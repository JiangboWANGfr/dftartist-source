"""B-only real Core wire/EOF regressions from DESIGN5.6.2/.4.

No reader thread drains stdout after the recorded partial reply. Deadlines are
harness guards, not product latency promises; cleanup kills never satisfy exit.
Unicode raw escapes are never parsed/re-encoded before reaching Core.
"""

import json
import os
import selectors
import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "m4" / "sdk_core.sv"
GOOD = [
    (r'"\ud83d\ude00"', "pair"),
    (r'"\u0000"', "NUL"),
    ('"汉é😀"', "literal_UTF8"),
    (r'"e\u0301"', "combining_no_normalization"),
]
BAD = [
    (r'"\ud800"', "high"),
    (r'"\udc00"', "low"),
    (r'"\udc00\ud800"', "reverse"),
    (r'"\ud800x"', "high_literal"),
    (r'"\ud800\u0041"', "high_ordinary_escape"),
    (r'"\ud800\ud800"', "two_high"),
]


class RawServer:
    def __init__(self, path=FIXTURE):
        self.process = subprocess.Popen(
            [os.environ["HIER_BIN"], "serve", str(path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.pending = b""
        self.stderr = bytearray()
        self.errors = threading.Thread(target=self._errors)
        self.errors.start()
        try:
            hello = self.frame()
            if hello.get("event") != "hello":
                raise AssertionError(f"expected hello: {hello}")
            self.snapshot = hello["snapshot"]["snapshotId"]
            self.root = hello["snapshot"]["tops"][0]["ref"]
        except BaseException:
            self.close()
            raise

    def _errors(self):
        while chunk := self.process.stderr.read(4096):
            self.stderr.extend(chunk)
            del self.stderr[:-65536]

    def _read(self, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0 or not self.selector.select(remaining):
            raise AssertionError("B harness guard: no stdout bytes")
        chunk = os.read(self.process.stdout.fileno(), 65536)
        if not chunk:
            raise AssertionError(f"unexpected stdout EOF: {bytes(self.stderr)!r}")
        self.pending += chunk

    def frame(self):
        deadline = time.monotonic() + 20
        while b"\n" not in self.pending:
            self._read(deadline)
        line, self.pending = self.pending.split(b"\n", 1)
        return json.loads(line)

    def prefix(self, count):
        deadline = time.monotonic() + 20
        while len(self.pending) < count:
            self._read(deadline)
        result, self.pending = self.pending[:count], self.pending[count:]
        return result

    def send_bytes(self, data):
        view = memoryview(data)
        while view:
            count = self.process.stdin.write(view)
            if not count:
                raise AssertionError("failed to send complete B input")
            view = view[count:]

    def request(self, identity, method, params=None):
        self.send_bytes(
            (
                json.dumps(
                    {
                        "id": identity,
                        "method": method,
                        "snapshot": self.snapshot,
                        "params": {} if params is None else params,
                    }
                )
                + "\n"
            ).encode()
        )

    def terminal(self):
        for _ in range(1000):
            frame = self.frame()
            if "id" in frame:
                return frame
            if frame.get("event") not in ("progress", "index"):
                raise AssertionError(f"unexpected frame: {frame}")
        raise AssertionError("too many events before terminal")

    def close_input(self):
        if not self.process.stdin.closed:
            try:
                self.process.stdin.close()
            except BrokenPipeError:
                pass

    def close(self):
        self.close_input()
        if self.process.poll() is None:
            self.process.kill()  # Cleanup only. Tests assert natural exit beforehand.
        self.process.wait(timeout=5)
        self.errors.join(timeout=5)
        self.selector.close()
        self.process.stdout.close()
        self.process.stderr.close()
        if self.errors.is_alive():
            raise AssertionError("B stderr collector not reclaimed")


class WireUnicode(unittest.TestCase):
    def setUp(self):
        self.server = RawServer()
        self.addCleanup(self.server.close)

    def wire(self, token, where):
        extra = (
            ('"future":{' + token + ":true}")
            if where == "key"
            else ('"future":{"nested":[' + token + "]}")
        )
        # Raw concatenation preserves malformed UTF-16 escapes and original bytes.
        line = (
            '{"id":1,"method":"inst.roots","snapshot":'
            + json.dumps(self.server.snapshot)
            + ',"params":{},'
            + extra
            + "}\n"
        )
        self.server.send_bytes(line.encode("utf-8"))

    def scalar(self, token, where):
        self.wire(token, where)
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"]), (1, True))
        self.server.close_input()
        self.assertEqual(self.server.process.wait(timeout=20), 0)

    def non_scalar(self, token, where):
        self.wire(token, where)
        frame = self.server.frame()
        self.assertEqual(frame.get("event"), "protocol_error", frame)
        self.assertEqual(frame["error"]["code"], "bad_request")
        self.assertTrue(frame["error"]["message"])
        self.assertIsInstance(frame["error"]["data"], dict)
        self.assertNotIn("id", frame)
        self.assertNotEqual(self.server.process.wait(timeout=20), 0)


def scalar_case(token, where, valid):
    def body(self):
        (self.scalar if valid else self.non_scalar)(token, where)

    return body


for cases, valid in [(GOOD, True), (BAD, False)]:
    for token, label in cases:
        for where in ["key", "value"]:
            setattr(
                WireUnicode,
                "test_" + ("accept_" if valid else "reject_") + label + "_" + where,
                scalar_case(token, where, valid),
            )


class BackpressureEOF(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="hier-b-eof-")
        self.addCleanup(self.folder.cleanup)
        path = Path(self.folder.name) / "large.sv"
        # Valid SV; exact large returned bytes are hand-defined, not Core-derived.
        self.text = "module b_eof; endmodule\n// " + "x" * (3 * 1024 * 1024) + "\n"
        path.write_text(self.text, encoding="utf-8")
        self.server = RawServer(path)
        self.addCleanup(self.server.close)

    def blocked(self):
        self.server.request(
            1, "obj.source", {"ref": self.server.root, "kind": "definition"}
        )
        span = self.server.terminal()
        self.assertEqual((span["id"], span["ok"]), (1, True))
        self.server.request(2, "source.read", {"file": span["result"]["file"]})
        got = []
        for _ in range(1000):
            frame = self.server.frame()
            self.assertNotIn("id", frame, "large terminal must follow progress")
            if frame.get("event") == "progress" and frame["target"] == 2:
                got.append((frame["done"], frame["total"]))
                if got[-1] == (1, 1):
                    break
        self.assertEqual(got, [(0, 1), (1, 1)])
        prefix = self.server.prefix(4096)
        self.assertTrue(prefix.startswith(b"{"))
        self.assertNotIn(b"\n", prefix, "observed incomplete real response")
        self.assertIsNone(self.server.process.poll())
        # From here no stdout reads/drain. Local pending also remains untouched.

    def test_clean_stdin_eof_during_partial_stdout_exits_zero_without_drain(self):
        self.blocked()
        self.server.close_input()
        self.assertEqual(self.server.process.wait(timeout=20), 0)
        self.server.errors.join(timeout=5)
        self.assertFalse(self.server.errors.is_alive())

    def test_fragment_eof_during_partial_stdout_exits_nonzero_without_drain(self):
        self.blocked()
        self.server.send_bytes(b'{"id":3')  # No LF: EOF is a protocol fault.
        self.server.close_input()
        self.assertNotEqual(self.server.process.wait(timeout=20), 0)
        self.server.errors.join(timeout=5)
        self.assertFalse(self.server.errors.is_alive())
        # No required fault frame when half stdout frame cannot be completed.

    def test_closed_stdout_read_end_reclaims_and_exits_nonzero(self):
        self.blocked()
        self.server.selector.unregister(self.server.process.stdout)
        self.server.process.stdout.close()
        self.assertNotEqual(self.server.process.wait(timeout=20), 0)

    def test_large_source_positive_drains_full_original_text_then_clean_exit(self):
        self.server.request(
            1, "obj.source", {"ref": self.server.root, "kind": "definition"}
        )
        span = self.server.terminal()
        self.server.request(2, "source.read", {"file": span["result"]["file"]})
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"]), (2, True))
        self.assertEqual(reply["result"]["text"], self.text)
        self.assertTrue(reply["result"]["matchesSnapshot"])
        self.server.close_input()
        self.assertEqual(self.server.process.wait(timeout=20), 0)


if __name__ == "__main__":
    unittest.main()
