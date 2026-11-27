"""Agent A regression for C's published C-35..C-42 counterexamples.

Separate from B's frozen oracle. Expectations follow the HDL and review contract.
"""
import json
import os
from pathlib import Path
import subprocess
import unittest

FIXTURE = Path(__file__).with_name('fixtures') / 'review.sv'
BIN = os.environ['HIER_BIN']


class Review(unittest.TestCase):
    def run_cli(self, top, *args, per=False):
        return subprocess.run([BIN, *args, '--top', top, str(FIXTURE),
                               *(['--per-instance-bodies'] if per else [])],
                              capture_output=True, text=True, timeout=30)

    def query(self, top, *args, per=False):
        r = self.run_cli(top, *args, per=per)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        return json.loads(r.stdout)

    def signal(self, top, name, inst='i:0'):
        return next(s['ref'] for s in self.query(top, 'signals', inst)['items'] if s['name'] == name)

    def partial(self, value, reason):
        self.assertEqual(value['completeness']['status'], 'partial', value)
        self.assertIn(reason, [r['code'] for r in value['completeness']['reasons']])

    def test_review_inputs_are_valid(self):
        for top in ('composite_expr', 'composite_mux', 'explicit_expr', 'output_extend',
                    'output_sign', 'output_truncate', 'output_concat', 'external_init',
                    'external_binding', 'external_assign', 'external_occurrence',
                    'external_output', 'positional_blackbox', 'positional_empty',
                    'interface_signal', 'interface_binding', 'constant_if',
                    'constant_false', 'constant_nested', 'constant_reset',
                    'constant_set', 'reset_else', 'two_async', 'library_output'):
            with self.subTest(top=top):
                self.assertEqual(self.query(top, 'diags')['errorCount'], 0)

    def test_page_limit_never_accepts_a_truncated_or_overflowed_integer(self):
        # M3 reuses this CLI option; preserve valid M1 pagination and reject
        # trailing garbage / integer overflow before dispatching either command.
        for command in (('children', 'i:0'), ('search', '')):
            positive = self.query('composite_expr', *command, '--limit', '1')
            page = positive['result'] if command[0] == 'search' else positive
            self.assertEqual(len(page['items']), 1)
            for text in ('', '1trailing', '2147483648', '4294967297',
                         '9999999999999999999999', '-2147483649'):
                with self.subTest(command=command[0], limit=text):
                    reply = self.run_cli('composite_expr', *command, '--limit', text)
                    self.assertNotEqual(reply.returncode, 0)
                    self.assertEqual(json.loads(reply.stdout)['error']['code'], 'bad_request')

    def test_c35_composite_expression(self):
        for per in (False, True):
            b = self.query('composite_expr', 'bindings', 'i:0', per=per)['bindings'][0]
            self.assertTrue(b['segments'])
            self.assertTrue(all(s['target']['kind'] == 'expr' for s in b['segments']), b)
            for name in ('hi', 'lo'):
                ref = self.signal('composite_expr', name, 'i:0.0')
                r = self.query('composite_expr', 'drivers', ref, '--reach', 'hier', per=per)
                self.assertEqual(r['completeness']['status'], 'complete')
                self.assertTrue(r['result'])
                self.assertTrue(all(e['kind'] == 'process' for e in r['result']), r)
            a = self.signal('composite_expr', 'a')
            r = self.query('composite_expr', 'loads', a, '--reach', 'hier', '--lsb', '3', '--width', '1', per=per)
            self.assertTrue(r['result'], r)

    def test_c36_output_extension(self):
        for per in (False, True):
            ref = self.signal('output_extend', 'y')
            r = self.query('output_extend', 'drivers', ref, '--reach', 'hier', '--lsb', '2', '--width', '2', per=per)
            self.assertEqual(r['completeness']['status'], 'complete')
            self.assertTrue(r['result'], r)

    def test_c37_external_sources(self):
        for top in ('external_init', 'external_binding', 'external_assign'):
            for per in (False, True):
                ref = self.signal(top, 's', 'i:0.0')
                for reach in ('local', 'hier'):
                    self.partial(self.query(top, 'loads', ref, '--reach', reach, per=per), 'hier_ref')
                self.partial(self.query(top, 'step', ref, '--dir', 'forward', per=per), 'hier_ref')

    def test_c38_positional_blackbox(self):
        for per in (False, True):
            p = self.query('positional_blackbox', 'ports', 'i:0.0', per=per)
            self.assertEqual(len(p), 2)
            b = self.query('positional_blackbox', 'bindings', 'i:0', per=per)['bindings']
            self.assertEqual(len(b), 2)
            for pin in b:
                self.assertEqual(pin['direction'], 'unknown')
                self.assertEqual(pin['segments'][0]['target']['kind'], 'signal')

    def test_c39_interface_signal(self):
        for per in (False, True):
            ref = self.signal('interface_signal', 's', 'i:0.0')
            for method in ('drivers', 'loads'):
                for reach in ('local', 'hier'):
                    self.partial(self.query('interface_signal', method, ref, '--reach', reach, per=per), 'interface_port')

    def test_c40_open_error(self):
        missing = str(FIXTURE.with_name('does-not-exist.sv'))
        self.assertFalse(Path(missing).exists())
        for method in ('verify-facts', 'verify-sharing', 'roots'):
            for args in ([missing], ['-f', missing], ['--no-such-option', str(FIXTURE)]):
                r = subprocess.run([BIN, method, *args], capture_output=True, text=True, timeout=30)
                self.assertNotEqual(r.returncode, 0, r.stdout)
                self.assertEqual(json.loads(r.stdout)['error']['code'], 'bad_request')

    def test_c41_constant_if(self):
        for per in (False, True):
            r = self.run_cli('constant_if', 'verify-facts', per=per)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertIn('mismatched=0', r.stdout)

    def test_c42_reset_branch(self):
        for per in (False, True):
            regs = self.query('constant_reset', 'registers', 'i:0', per=per)['result']['items']
            self.assertTrue(regs)
            for r in regs:
                self.assertEqual(r['async'][0]['type'], 'reset')

    def test_composite_bit_dependencies(self):
        for top in ('composite_expr', 'composite_mux', 'explicit_expr'):
            for per in (False, True):
                names = {s['ref']: s['name'] for s in self.query(top, 'signals', 'i:0')['items']}
                binding = self.query(top, 'bindings', 'i:0', per=per)['bindings'][0]
                for bit in range(4):
                    segment = next(s for s in binding['segments'] if s['pinBits']['lsb'] <= bit < s['pinBits']['lsb'] + s['pinBits']['width'])
                    proc = self.query(top, 'proc', segment['target']['process'], per=per)['result']
                    write = next(w for w in proc['writes'] if w['target']['bits']['lsb'] <= bit < w['target']['bits']['lsb'] + w['target']['bits']['width'])
                    got = set()
                    for dep in write['deps']:
                        self.assertEqual(dep['precision'], 'exact')
                        if dep['align'] == 'bitwise':
                            positions = [dep['bits']['lsb'] + bit - write['target']['bits']['lsb']]
                        else:
                            positions = range(dep['bits']['lsb'], dep['bits']['lsb'] + dep['bits']['width'])
                        got.update((names[dep['signal']], i, dep['role']) for i in positions)
                    expected = {('a', bit, 'data'), ('b', bit, 'data')}
                    if top == 'composite_mux':
                        expected.add(('c', 0, 'control'))
                    self.assertEqual(got, expected)
                self.assertEqual(self.run_cli(top, 'verify-facts', per=per).returncode, 0)

    def test_output_conversion_exact_writes(self):
        for top, targets in (('output_extend', {'y': [0, 1, None, None]}),
                             ('output_sign', {'y': [0, 1, 1, 1]}),
                             ('output_truncate', {'y': [0, 1]}),
                             ('output_concat', {'lo': [0, 1], 'hi': [None, None]})):
            for per in (False, True):
                binding = next(b for b in self.query(top, 'bindings', 'i:0', per=per)['bindings'] if b['port'] == 'q')
                for name, mapping in targets.items():
                    ref = self.signal(top, name)
                    for bit, source in enumerate(mapping):
                        reply = self.query(top, 'drivers', ref, '--reach', 'hier', '--lsb', str(bit), '--width', '1', per=per)
                        self.assertEqual(reply['completeness']['status'], 'complete', reply)
                        self.assertEqual(len(reply['result']), 1, reply)
                        endpoint = reply['result'][0]
                        self.assertEqual(endpoint['kind'], 'process')
                        proc = self.query(top, 'proc', endpoint['ref'], per=per)['result']
                        self.assertEqual(proc['kind'], 'port_expr')
                        write = next(w for w in proc['writes'] if w['target']['ref'] == ref and w['target']['bits']['lsb'] <= bit < w['target']['bits']['lsb'] + w['target']['bits']['width'])
                        deps = set()
                        for d in write['deps']:
                            self.assertEqual(d['signal'], binding['pin'])
                            self.assertEqual(d['precision'], 'exact')
                            lo = d['bits']['lsb']
                            if d['align'] == 'bitwise':
                                deps.add(lo + bit - write['target']['bits']['lsb'])
                            else:
                                deps.update(range(lo, lo + d['bits']['width']))
                        self.assertEqual(deps, set() if source is None else {source})
                r = self.run_cli(top, 'verify-facts', per=per)
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                if top == 'output_truncate':
                    q = self.signal(top, 'q', 'i:0.0')
                    for bit in range(4):
                        r = self.query(top, 'loads', q, '--reach', 'hier', '--lsb', str(bit), '--width', '1', per=per)
                        self.assertEqual(bool(r['result']), bit < 2, r)

    def test_external_occurrence_and_output(self):
        for per in (False, True):
            for index in (0, 1):
                ref = self.signal('external_occurrence', 's', f'i:0.{index}')
                r = self.query('external_occurrence', 'loads', ref, '--reach', 'hier', per=per)
                if index == 1:
                    self.partial(r, 'hier_ref')
                else:
                    self.assertEqual(r['completeness']['status'], 'complete')
            ref = self.signal('external_output', 's', 'i:0.0')
            self.partial(self.query('external_output', 'drivers', ref, '--reach', 'hier', per=per), 'hier_ref')
            b = self.query('external_output', 'bindings', 'i:0', per=per)['bindings'][-1]
            p = self.query('external_output', 'proc', b['segments'][0]['target']['process'], per=per)
            self.partial(p, 'hier_ref')
            self.assertTrue(any(r['access'] == 'write' for r in p['result']['externalRefs']))

    def test_unnamed_empty_pin(self):
        p = self.query('positional_empty', 'ports', 'i:0.0')
        self.assertEqual(len(p), 3)
        self.assertEqual([v['name'] for v in p], ['', '', ''])
        b = self.query('positional_empty', 'bindings', 'i:0')['bindings']
        self.assertEqual(len(b), 3)
        self.assertEqual(b[1]['unresolved'], 'unknown_pin_width')
        self.assertIsNone(b[1]['width'])
        self.assertEqual(b[1]['segments'], [])
        for name in ('a', 'y'):
            ref = self.signal('positional_empty', name)
            for method in ('drivers', 'loads'):
                self.partial(self.query('positional_empty', method, ref, '--reach', 'hier'), 'blackbox')

    def test_interface_all_entry_points(self):
        for per in (False, True):
            b = self.query('interface_binding', 'bindings', 'i:0', per=per)['bindings']
            interface = next(v for v in b if v['port'] == 'b')
            self.assertEqual(interface['unresolved'], 'interface_port')
            self.assertEqual(len({v['pin'] for v in b}), len(b))
            for method in ('drivers', 'loads'):
                for side in ('inside', 'outside'):
                    self.partial(self.query('interface_binding', method, interface['pin'], '--side', side, '--reach', 'hier', per=per), 'interface_port')
                    self.partial(self.query('interface_binding', 'step', interface['pin'], '--side', side, '--dir', 'back' if method == 'drivers' else 'forward', per=per), 'interface_port')

    def test_constant_reachability_and_async_variants(self):
        for per in (False, True):
            for top in ('constant_false', 'constant_nested'):
                r = self.run_cli(top, 'verify-facts', per=per)
                self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
                z = self.signal(top, 'z')
                self.assertEqual(self.query(top, 'drivers', z, '--reach', 'local', per=per)['result'], [])
            for top, expected in (('constant_set', 'set'), ('reset_else', 'reset')):
                for r in self.query(top, 'registers', 'i:0', per=per)['result']['items']:
                    self.assertEqual(r['async'][0]['type'], expected)
            regs = self.query('two_async', 'registers', 'i:0', per=per)['result']['items']
            names = {s['ref']: s['name'] for s in self.query('two_async', 'signals', 'i:0')['items']}
            got = {}
            for r in regs:
                for bit in range(r['bits']['lsb'], r['bits']['lsb'] + r['bits']['width']):
                    got[bit] = {names[e['signal']]: e['type'] for e in r['async']}
            self.assertEqual(got, {0: {'rst_n': 'reset', 'set': 'set'}, 1: {'rst_n': 'set', 'set': 'set'}})


if __name__ == '__main__':
    unittest.main()
