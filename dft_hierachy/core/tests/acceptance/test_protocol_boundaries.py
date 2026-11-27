"""B M4 raw-input and lifecycle candidates; no scheduler races as oracle.

These reuse B's original process owner/reader, never mock a Core reply.
Two writes cover supplied byte fragments, NOT proof of OS read boundaries.
"""

import json
import unittest

import test_protocol


class ProtocolBoundaries(unittest.TestCase):
    def setUp(self):
        test_protocol.Protocol.setUp(self)

    def raw(self, value):
        try:
            self.server.process.stdin.buffer.write(value)
            self.server.process.stdin.buffer.flush()
        except BrokenPipeError:
            pass  # Still verify the fault frame/exit, never turn it into success.

    def encoded(self, identity=1, params=None):
        return (
            json.dumps(
                {
                    "id": identity,
                    "method": "inst.roots",
                    "snapshot": self.server.snapshot,
                    "params": {} if params is None else params,
                },
                ensure_ascii=False,
            )
            + "\n"
        ).encode("utf-8")

    def fault(self):
        frame = self.server.receive()
        self.assertEqual(frame.get("event"), "protocol_error", frame)
        self.assertEqual(frame["error"]["code"], "bad_request")
        self.assertTrue(frame["error"]["message"])
        self.assertIsInstance(frame["error"]["data"], dict)
        self.assertNotIn("id", frame)
        self.server.process.wait(timeout=20)
        self.assertNotEqual(self.server.process.returncode, 0)
        self.server.reader.join(timeout=5)
        self.server.errors.join(timeout=5)
        self.assertFalse(self.server.reader.is_alive())
        self.assertFalse(self.server.errors.is_alive())
        value = self.server.messages.get(timeout=5)
        self.assertIsInstance(value, EOFError, "fault has exactly one final frame")

    def recover(self, next_id=2):
        self.server.request(next_id, "inst.roots")
        response = self.server.terminal()
        self.assertEqual((response["id"], response["ok"]), (next_id, True))

    def test_missing_params_consumes_id_and_new_request_recovers(self):
        self.server.send(
            {"id": 1, "method": "inst.roots", "snapshot": self.server.snapshot}
        )
        frame = self.server.terminal()
        self.assertEqual(
            (frame["id"], frame["ok"], frame["error"]["code"]),
            (1, False, "bad_request"),
        )
        self.recover()
        self.server.request(1, "inst.roots")
        self.fault()

    def test_snapshot_error_precedes_unknown_method(self):
        self.server.request(1, "B.unknown", snapshot="B-stale")
        frame = self.server.terminal()
        self.assertEqual(
            (frame["id"], frame["ok"], frame["error"]["code"]),
            (1, False, "stale_snapshot"),
        )
        self.assertEqual(frame["error"]["data"]["expected"], self.server.snapshot)
        self.assertEqual(frame["error"]["data"]["received"], "B-stale")
        self.recover()

    def test_duplicate_completed_id_is_connection_fault(self):
        self.server.request(1, "inst.roots")
        self.assertTrue(self.server.terminal()["ok"])
        self.server.request(1, "inst.roots")
        self.fault()

    def test_decreasing_id_is_connection_fault(self):
        self.server.request(9, "inst.roots")
        self.assertTrue(self.server.terminal()["ok"])
        self.server.request(8, "inst.roots")
        self.fault()

    def test_cancel_with_id_is_not_a_second_request(self):
        self.server.send({"id": 1, "method": "cancel", "params": {"target": 7}})
        self.fault()

    def test_nullable_page_field_is_rejected_then_recovers(self):
        root = self.server.snapshot_tops[0]["ref"]
        self.server.request(1, "inst.children", {"inst": root, "limit": None})
        frame = self.server.terminal()
        self.assertEqual(
            (frame["id"], frame["ok"], frame["error"]["code"]),
            (1, False, "bad_request"),
        )
        self.recover()

    def test_one_write_contains_three_frames_and_fifo_terminals(self):
        self.raw(b"".join(self.encoded(i) for i in (1, 2, 3)))
        frames = [self.server.terminal() for _ in range(3)]
        self.assertEqual([x["id"] for x in frames], [1, 2, 3])
        self.assertTrue(all(x["ok"] for x in frames))
        self.recover(4)

    def test_utf8_fragmented_request_and_crlf(self):
        line = self.encoded(params={"future": "你好"}).replace(b"\n", b"\r\n")
        split = line.index("你".encode("utf-8")) + 1
        self.raw(line[:split])
        self.raw(line[split:])
        frame = self.server.terminal()
        self.assertEqual((frame["id"], frame["ok"]), (1, True))

    def test_invalid_utf8_in_otherwise_valid_request(self):
        line = self.encoded(params={"future": "B_UTF"})
        self.raw(line.replace(b'"B_UTF"', b'"\xff"'))
        self.fault()

    def test_oversized_valid_json_is_connection_fault(self):
        self.raw(self.encoded(params={"future": "x" * 1048576}))
        self.fault()

    def test_deep_extension_is_connection_fault(self):
        value = 0
        for _ in range(140):
            value = [value]
        self.raw(self.encoded(params={"future": value}))
        self.fault()  # Well over128; exact root-depth convention remains separate.

    def test_eof_fragment_without_lf_is_connection_fault(self):
        self.raw(self.encoded()[:-1])
        self.server.process.stdin.close()
        self.fault()

    def test_normal_eof_is_zero_and_reclaims_readers(self):
        self.server.process.stdin.close()
        self.server.process.wait(timeout=20)
        self.assertEqual(self.server.process.returncode, 0)
        self.server.reader.join(timeout=5)
        self.server.errors.join(timeout=5)
        self.assertFalse(self.server.reader.is_alive())
        self.assertFalse(self.server.errors.is_alive())


def raw_case(payload):
    def body(self):
        self.raw(payload)
        self.fault()

    return body


for name, payload in [
    ("blank_line", b"\n"),
    ("truncated_json", b'{"id":1,\n'),
    ("non_object", b"[]\n"),
    ("duplicate_json_key", b'{"id":1,"id":2}\n'),
]:
    setattr(ProtocolBoundaries, "test_raw_" + name, raw_case(payload))


if __name__ == "__main__":
    unittest.main()
