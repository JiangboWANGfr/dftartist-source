"""Per-bit dependencies, roles and precision (docs/DESIGN.md 4.4 rule table; M2 gate
items "逐位对应与角色" and "网线声明初始值作为驱动"; 9.1 V5 step M2).
Expectations are written by hand from the SystemVerilog source and the rule table."""
import unittest

from hiercli import both, use


def d(sig, *idx, role="data", precision="exact"):
    return frozenset(use(sig, i, role, precision) for i in idx)


def every(sig, width, **kw):
    return d(sig, *range(width), **kw)


CONS = {"precision": "conservative"}
C = d("c", 0, role="control")
S_CTRL = every("s", 2, role="control")
ALL_AB = every("a", 4) | every("b", 4)
NONE = frozenset()

# precision/ops.sv: module -> what y[0], y[1], y[2], y[3] depend on. Inputs are
# a[3:0], b[3:0], s[1:0], c. A (lower, upper) pair accepts anything in between.
OPS = {
    "op_select_concat": [d("b", 2), d("b", 3), d("a", 0), d("a", 1)],  # {a[1:0], b[3:2]}
    "op_replicate": [d("a", 0), d("a", 1), d("a", 0), d("a", 1)],      # {2{a[1:0]}}
    "op_bitwise_and": [d("a", i) | d("b", i) for i in range(4)],
    "op_bitwise_not": [d("a", i) for i in range(4)],
    "op_conditional": [d("a", i) | d("b", i) | C for i in range(4)],   # c ? a : b
    "op_zero_extend": [d("a", 0), d("a", 1), NONE, NONE],              # y = a[1:0]
    "op_sign_extend": [d("a", 0), d("a", 1), d("a", 1), d("a", 1)],    # $signed(a[1:0])
    "op_shift_const": [NONE, d("a", 0), d("a", 1), d("a", 2)],         # a << 1
    "op_reduce_and": [every("a", 4), NONE, NONE, NONE],                # {3'b0, &a}
    "op_compare": [ALL_AB, NONE, NONE, NONE],                          # {3'b0, a < b}
    "op_equal": [ALL_AB, NONE, NONE, NONE],
    "op_add": [every("a", 4, **CONS) | every("b", 4, **CONS)] * 4,
    "op_multiply": [every("a", 4, **CONS) | every("b", 4, **CONS)] * 4,
    "op_shift_var": [every("a", 4, **CONS) | every("s", 2, **CONS)] * 4,   # a << s
    "op_dynamic_index": [every("a", 4, **CONS) | every("s", 2, **CONS),    # {3'b0, a[s]}
                         NONE, NONE, NONE],
    # {2'b0, b[s +: 2]}: y[1] is b[s+1], which can never be b[0]; "all possible
    # positions" may or may not be read that tightly.
    "op_dynamic_part": [every("b", 4, **CONS) | every("s", 2, **CONS),
                        (d("b", 1, 2, 3, **CONS) | every("s", 2, **CONS),
                         every("b", 4, **CONS) | every("s", 2, **CONS)),
                        NONE, NONE],
    "op_function": [every("a", 4, **CONS)] * 4,
    "op_proc_if": [d("a", i) | d("b", i) | C for i in range(4)],
    "op_proc_case": [d("a", i) | d("b", i) | S_CTRL for i in range(4)],
}


class RuleTable(unittest.TestCase):
    def test_every_row(self):
        for module, expected in OPS.items():
            for mode, design in both("precision/ops.sv", module):
                for bit, want in enumerate(expected):
                    with self.subTest(module=module, mode=mode, bit=bit):
                        drivers = design.driver_deps(module, "y", bit)
                        self.assertEqual(len(drivers), 1, drivers)
                        got = drivers[0][1]
                        if isinstance(want, tuple):
                            self.assertLessEqual(want[0], got)
                            self.assertLessEqual(got, want[1])
                        else:
                            self.assertEqual(got, want)


class Roles(unittest.TestCase):
    def deps(self, top, name, bit):
        results = [design.driver_deps(top, name, bit) for _, design in both("m2/conn.sv", top)]
        self.assertEqual(results[0], results[1])
        self.assertEqual(len(results[0]), 1, results[0])
        return results[0][0][1]

    def test_concatenation_on_the_left(self):
        # assign {hi, lo} = a;
        self.assertEqual(self.deps("lhs_concat", "lo", 0), d("a", 0))
        self.assertEqual(self.deps("lhs_concat", "lo", 1), d("a", 1))
        self.assertEqual(self.deps("lhs_concat", "hi", 0), d("a", 2))
        self.assertEqual(self.deps("lhs_concat", "hi", 1), d("a", 3))

    def test_nested_if_and_case(self):
        guard = d("en", 0, role="control") | every("m", 2, role="control")
        self.assertEqual(self.deps("nested", "y", 0),
                         d("a", 0) | d("b", 0) | d("c", 1) | guard | d("k", 0, role="control"))
        # `if (k) y[0] = ...` does not write y[1].
        self.assertEqual(self.deps("nested", "y", 1), d("a", 1) | d("b", 1) | guard)

    def test_clock_and_async_roles(self):
        for bit in range(2):
            # rst_n is in the event list AND is the if condition: both are reported.
            self.assertEqual(self.deps("ff", "q", bit),
                             d("d", bit) | d("clk", 0, role="clock")
                             | d("rst_n", 0, role="async") | d("rst_n", 0, role="control"))


class Kinds(unittest.TestCase):
    def test_processes_are_listed_in_declaration_order(self):
        for top, want in (
                ("init", ["init", "init", "init", "assign", "assign"]),
                ("pins", ["port_expr", "port_expr"]),          # u_expr: .d(a & b), .en(~s)
                ("seq", ["always_ff", "always", "always_ff", "always_comb"]),
                ("multi", ["assign"] * 4)):
            for mode, design in both("m2/conn.sv", top):
                with self.subTest(top=top, mode=mode):
                    self.assertEqual(design.proc_kinds(top), want)
        for mode, design in both("m2/conn.sv", "occ"):
            for child in ("occ.u_a", "occ.u_b", "occ.u_arr[0]", "occ.u_arr[1]"):
                with self.subTest(child=child, mode=mode):
                    self.assertEqual(design.proc_kinds(child), ["assign"] * 3)
            self.assertEqual(design.proc_kinds("occ"), [])

    def test_procedural_kinds(self):
        for fixture, top, name, want in (("precision/ops.sv", "op_proc_if", "y", "always_comb"),
                                         ("m2/conn.sv", "ff", "q", "always_ff"),
                                         ("m2/conn.sv", "seq", "s", "always")):
            _, design = both(fixture, top)[0]
            self.assertEqual([kind for kind, _ in design.driver_deps(top, name, 0)], [want])


class Initializers(unittest.TestCase):
    def test_initializers_are_drivers(self):
        for mode, design in both("m2/conn.sv", "init"):
            with self.subTest(mode=mode):
                # wire x = a[0] & b[0];
                self.assertEqual(design.driver_deps("init", "x", 0),
                                 [("init", d("a", 0) | d("b", 0))])
                # wire [3:0] w = {a[1:0], b[3:2]};
                for bit, want in enumerate([d("b", 2), d("b", 3), d("a", 0), d("a", 1)]):
                    self.assertEqual(design.driver_deps("init", "w", bit), [("init", want)])
                # wire two = a[1]; assign two = b[1];
                two = design.driver_deps("init", "two", 0)
                self.assertEqual(len(two), 2, two)
                self.assertEqual(set(two), {("init", d("a", 1)), ("assign", d("b", 1))})


if __name__ == "__main__":
    unittest.main()
