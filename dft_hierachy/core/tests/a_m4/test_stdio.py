"""A real OS-pipe regression. Deadlines bound broken runs, never choose a cancel winner."""

import hashlib
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import tempfile
import time
import unittest


class PipeSession:
    def __init__(self, fixture, socket_input=False):
        self.input_peer = None
        child_input = None
        self.input_closed = False
        if socket_input:
            self.input_peer, child_input = socket.socketpair()
        try:
            self.process = subprocess.Popen(
                [os.environ["HIER_BIN"], "serve", str(fixture)],
                stdin=child_input if socket_input else subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except BaseException:
            if self.input_peer:
                self.input_peer.close()
            raise
        finally:
            if child_input:
                child_input.close()
        if self.input_peer:
            self.process.stdin = self.input_peer.makefile("wb")
        self.pending = b""
        self.hello = self.receive()

    def receive(self):
        deadline = time.monotonic() + 20
        while b"\n" not in self.pending:
            remaining = deadline - time.monotonic()
            if (
                remaining <= 0
                or not select.select([self.process.stdout], [], [], remaining)[0]
            ):
                raise AssertionError("pipe deadline")
            chunk = os.read(self.process.stdout.fileno(), 4093)
            if not chunk:
                raise AssertionError(
                    "unexpected stdout EOF: " + self.process.stderr.read().decode()
                )
            self.pending += chunk
        line, self.pending = self.pending.split(b"\n", 1)
        return json.loads(line)

    def request(self, identity, method, params):
        self.send(
            json.dumps(
                {
                    "id": identity,
                    "method": method,
                    "params": params,
                    "snapshot": self.hello["snapshot"]["snapshotId"],
                }
            ).encode()
            + b"\n"
        )

    def send(self, data):
        self.process.stdin.write(data)
        self.process.stdin.flush()

    def terminal(self):
        while True:
            result = self.receive()
            if "id" in result:
                return result

    def close_input(self):
        if self.input_closed:
            return
        self.input_closed = True
        try:
            self.process.stdin.close()
        except BrokenPipeError:
            pass
        if self.input_peer:
            self.input_peer.shutdown(socket.SHUT_WR)

    def close(self):
        self.close_input()
        try:
            self.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
            raise
        finally:
            self.process.stdout.close()
            self.process.stderr.close()
            if self.input_peer:
                self.input_peer.close()


class Stdio(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="hier-a-m4-pipe-")
        self.addCleanup(self.directory.cleanup)
        self.fixture = Path(self.directory.name) / "input.sv"
        self.text = "module top(input logic a, output logic q); assign q=a; endmodule\n"
        self.fixture.write_text(self.text)

    def start(self, socket_input=False):
        self.server = PipeSession(self.fixture, socket_input)
        self.addCleanup(self.server.close)

    def test_large_reply_crosses_pipe_capacity_and_next_request_recovers(self):
        self.text += "//" + "位" * 700000 + "\n"
        self.fixture.write_text(self.text)
        self.start()
        self.server.request(1, "obj.source", {"ref": "i:0", "kind": "definition"})
        span = self.server.terminal()["result"]
        self.server.request(2, "source.read", {"file": span["file"]})
        reply = self.server.terminal()
        self.assertEqual(reply["id"], 2)
        self.assertEqual(reply["result"]["text"], self.text)
        self.assertEqual(
            reply["result"]["contentHash"],
            hashlib.sha256(self.text.encode()).hexdigest(),
        )
        self.server.request(3, "inst.roots", {})
        self.assertEqual(self.server.terminal()["id"], 3)
        self.server.process.stdin.close()
        self.assertEqual(self.server.process.wait(timeout=20), 0)

    def test_stdout_peer_close_exits_nonzero_and_reaps_worker(self):
        self.start()
        self.server.process.stdout.close()
        self.assertNotEqual(self.server.process.wait(timeout=20), 0)

    def test_stdin_eof_drops_backpressured_output_without_consumer_drain(self):
        self.fixture.write_text(self.text + "//" + "x" * (2 * 1024 * 1024) + "\n")
        for socket_input, fragment in [
            (s, f) for s in [False, True] for f in [b"", b'{"id":3']
        ]:
            with self.subTest(socket_input=socket_input, fragment=fragment):
                self.start(socket_input)
                self.server.request(
                    1, "obj.source", {"ref": "i:0", "kind": "definition"}
                )
                file = self.server.terminal()["result"]["file"]
                self.server.request(2, "source.read", {"file": file})
                for done in [0, 1]:
                    progress = self.server.receive()
                    self.assertEqual((progress["target"], progress["done"]), (2, done))
                # Read only a prefix: the reply exceeds every supported pipe's capacity.
                prefix = self.server.pending
                if not prefix:
                    self.assertTrue(
                        select.select([self.server.process.stdout], [], [], 20)[0]
                    )
                    prefix = os.read(self.server.process.stdout.fileno(), 256)
                self.assertIn(b'"id":2', prefix)
                self.assertIn(b'"ok":true', prefix)
                self.server.send(fragment)
                self.server.close_input()
                # No stdout read before wait, and no cleanup kill can satisfy this assertion.
                code = self.server.process.wait(timeout=20)
                self.assertEqual(code == 0, not fragment)
                if fragment:
                    self.assertIn(b"EOF", self.server.process.stderr.read())

    def test_exact_integer_spelling_and_overflow_are_not_rounded(self):
        self.start()
        snapshot = json.dumps(self.server.hello["snapshot"]["snapshotId"])
        self.server.send(
            (
                "{"
                + '"id":1.0e0,"method":"inst.roots","snapshot":'
                + snapshot
                + ',"params":{}}\n'
            ).encode()
        )
        self.assertTrue(self.server.terminal()["ok"])
        self.server.send(
            (
                "{"
                + '"id":9007199254740991.1,"method":"inst.roots","snapshot":'
                + snapshot
                + ',"params":{}}\n'
            ).encode()
        )
        fault = self.server.receive()
        self.assertEqual(fault["event"], "protocol_error")
        self.assertNotEqual(self.server.process.wait(timeout=20), 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
