"""M4 real-process integration/E2E gates, exclusively DESIGN 5.2.

No Electron channel names, undocumented exports, cancellation scheduling races
or JSON Schema are invented. Timeout is a test safety bound, not an SLA.
All spawned processes and reader threads are reclaimed even after assertion failure.
"""
import json
import os
import queue
import subprocess
import threading
import unittest

FIXTURE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "fixtures",
                                      "nav", "nav.sv"))


class Server:
    def __init__(self):
        self.process = subprocess.Popen([os.environ["HIER_BIN"], "serve", FIXTURE],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, text=True, bufsize=1)
        self.messages = queue.Queue()
        self.stderr = []
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.errors = threading.Thread(target=self._errors, daemon=True)
        self.reader.start()
        self.errors.start()

    def _read(self):
        try:
            for line in self.process.stdout:
                try:
                    self.messages.put(json.loads(line))
                except ValueError as error:
                    self.messages.put(error)
        finally:
            self.messages.put(EOFError("serve closed stdout"))

    def _errors(self):
        self.stderr.extend(self.process.stderr)

    def receive(self):
        try:
            value = self.messages.get(timeout=20)
        except queue.Empty as error:
            raise AssertionError("no protocol message within harness deadline") from error
        if isinstance(value, Exception):
            raise AssertionError(f"{value}; stderr={''.join(self.stderr)}")
        return value

    def send(self, message):
        self.process.stdin.write(json.dumps(message) + "\n")
        self.process.stdin.flush()

    def request(self, identity, method, params=None, snapshot=None):
        self.send({"id": identity, "method": method,
                   "snapshot": self.snapshot if snapshot is None else snapshot,
                   "params": {} if params is None else params})

    def terminal(self):
        # Progress/index notifications may be interleaved, but not terminal IDs.
        for _ in range(1000):
            value = self.receive()
            if "id" in value:
                return value
            if value.get("event") not in ("progress", "index"):
                raise AssertionError(f"unexpected event: {value}")
        raise AssertionError("too many events without a terminal response")

    def close(self):
        if not self.process.stdin.closed:
            try:
                self.process.stdin.close()
            except (BrokenPipeError, OSError):
                pass  # The process can reject a frame before all bytes are flushed.
        try:
            self.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.reader.join(timeout=5)
        self.errors.join(timeout=5)
        self.process.stdout.close()
        self.process.stderr.close()


class Protocol(unittest.TestCase):
    def setUp(self):
        self.server = Server()
        self.addCleanup(self.server.close)
        hello = self.server.receive()
        self.assertEqual(hello["event"], "hello")
        self.assertEqual(hello["protocol"], 2)
        self.assertIsInstance(hello["snapshot"], dict)
        self.assertEqual(hello["snapshot"]["schemaVersion"], 7)
        for field in ("snapshotId", "inputHash", "inputHashComplete", "indexState",
                      "openedAt", "topCandidates"):
            self.assertIn(field, hello["snapshot"])
        self.server.snapshot = hello["snapshot"]["snapshotId"]
        self.server.snapshot_tops = hello["snapshot"]["tops"]
        self.assertTrue(self.server.snapshot)
        self.assertIn("cancel", hello["capabilities"])
        self.assertIn("progress", hello["capabilities"])

    def test_hello_and_roots_have_typed_complete_reply(self):
        self.server.request(1, "inst.roots")
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"]), (1, True))
        self.assertEqual([r["pathText"] for r in reply["result"]], ["top_a", "top_b"])
        self.assertEqual(reply["completeness"], {"status": "complete", "reasons": []})
        self.assertNotIn("error", reply)

    def test_unknown_method_is_error_and_next_query_recovers(self):
        self.server.request(1, "acceptance.no_such_method")
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"], reply["error"]["code"]),
                         (1, False, "unknown_method"))
        self.assertTrue(reply["error"]["message"])
        self.assertNotIn("result", reply)
        self.server.request(2, "inst.roots")
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"]), (2, True))

    def test_wrong_snapshot_is_rejected_without_poisoning_current_one(self):
        self.server.request(1, "inst.roots", snapshot="acceptance-stale-snapshot")
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"], reply["error"]["code"]),
                         (1, False, "stale_snapshot"))
        self.server.request(2, "inst.roots")
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"]), (2, True))

    def test_not_found_is_distinct_from_malformed_reference(self):
        for identity, ref, code in ((1, "i:999", "not_found"),
                                     (2, "i:1..0", "bad_request")):
            self.server.request(identity, "inst.get", {"inst": ref})
            reply = self.server.terminal()
            self.assertEqual((reply["id"], reply["ok"], reply["error"]["code"]),
                             (identity, False, code))

    def test_batch_requests_return_fifo_once_each(self):
        for identity in (11, 12, 13):
            self.server.request(identity, "inst.roots")
        replies = [self.server.terminal() for _ in range(3)]
        self.assertEqual([r["id"] for r in replies], [11, 12, 13])
        self.assertTrue(all(r["ok"] for r in replies))
        self.assertEqual(replies[0]["result"], replies[1]["result"])
        self.assertEqual(replies[1]["result"], replies[2]["result"])
        self.server.request(14, "inst.roots")
        self.assertEqual(self.server.terminal()["id"], 14)  # no duplicate terminal

    def test_cancelling_unknown_or_finished_request_produces_no_reply(self):
        self.server.request(1, "inst.roots")
        self.assertEqual(self.server.terminal()["id"], 1)
        for identity in (1, 999):
            self.server.send({"method": "cancel", "params": {"target": identity}})
        self.server.request(2, "inst.roots")
        self.assertEqual(self.server.terminal()["id"], 2)

    def test_source_read_cannot_read_arbitrary_path(self):
        self.server.request(1, "source.read", {"file": "/etc/passwd"})
        reply = self.server.terminal()
        self.assertEqual((reply["id"], reply["ok"], reply["error"]["code"]),
                         (1, False, "not_found"))
        self.assertNotIn("result", reply)

    def test_eof_exits_and_releases_child_process(self):
        self.server.request(1, "inst.roots")
        self.assertTrue(self.server.terminal()["ok"])
        self.server.process.stdin.close()
        self.server.process.wait(timeout=20)
        self.server.reader.join(timeout=5)
        self.server.errors.join(timeout=5)
        self.assertFalse(self.server.reader.is_alive())
        self.assertFalse(self.server.errors.is_alive())


if __name__ == "__main__":
    unittest.main()
