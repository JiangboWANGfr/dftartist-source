"""Agent A regression for C-37 direction and C-43 constant projection."""
import json
import os
from pathlib import Path
import subprocess
import unittest

BIN = os.environ['HIER_BIN']
FIXTURE = Path(__file__).with_name('fixtures') / 'rereview.sv'


class Rereview(unittest.TestCase):
    def query(self, top, *args, per=False):
        result = subprocess.run([BIN, *args, '--top', top, str(FIXTURE),
                                 *(['--per-instance-bodies'] if per else [])],
                                capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def test_inputs_valid(self):
        for top in ('ext_inout', 'ext_tran', 'external_library_output', 'concat_reset',
                    'split_reset', 'slice_reset', 'nested_external', 'external_ref',
                    'external_selector', 'external_tranif', 'nested_concat_reset', 'unknown_concat_reset'):
            with self.subTest(top=top):
                diags = self.query(top, 'diags')
                self.assertEqual(diags['errorCount'], 0, diags)

    def test_bidirectional_external_access(self):
        for top in ('ext_inout', 'ext_tran', 'external_ref', 'external_tranif'):
            for per in (False, True):
                for command in ('drivers', 'loads'):
                    for reach in ('local', 'hier'):
                        with self.subTest(top=top, per=per, command=command, reach=reach):
                            value = self.query(top, command, 's:0.0:0', '--reach', reach, per=per)
                            self.assertEqual(value['completeness']['status'], 'partial', value)
                            self.assertTrue(any(r['code'] == 'hier_ref' and r['at'] == 's:0.0:0'
                                                for r in value['completeness']['reasons']), value)

    def test_selector_is_only_read(self):
        for per in (False, True):
            for command, status in (('loads', 'partial'), ('drivers', 'complete')):
                with self.subTest(per=per, command=command):
                    result = self.query('external_selector', command, 's:0.1:0', '--reach', 'local', per=per)
                    self.assertEqual(result['completeness']['status'], status, result)

    def test_bidirectional_source_records_both_accesses(self):
        for top in ('ext_inout', 'ext_tran', 'external_ref', 'external_tranif'):
            for per in (False, True):
                with self.subTest(top=top, per=per):
                    sources = self.query(top, 'procs', 'i:0', per=per)['items']
                    accesses = set()
                    for source in sources:
                        process = self.query(top, 'proc', source['ref'], per=per)
                        accesses.update(e['access'] for e in process['result']['externalRefs'] if e['text'] == 'u.s')
                    self.assertEqual(accesses, {'read', 'write'})

    def test_concat_constants_project_to_target(self):
        for top in ('concat_reset', 'split_reset', 'slice_reset', 'nested_concat_reset', 'unknown_concat_reset'):
            for per in (False, True):
                with self.subTest(top=top, per=per):
                    signals = self.query(top, 'signals', 'i:0', per=per)['items']
                    names = {s['ref']: s['name'] for s in signals}
                    regs = self.query(top, 'registers', 'i:0', per=per)['result']['items']
                    actual = {}
                    for reg in regs:
                        for bit in range(reg['bits']['lsb'], reg['bits']['lsb'] + reg['bits']['width']):
                            actual[(names[reg['signal']], bit)] = reg['async'][0]['type']
                    expected = ({('hi', 0): 'set', ('lo', 0): 'reset'}
                                if top in ('concat_reset', 'split_reset') else
                                {('q', 0): 'reset', ('q', 1): 'reset', ('q', 2): 'set', ('q', 3): 'set'})
                    if top == 'unknown_concat_reset':
                        expected = {('hi', 0): 'unknown', ('lo', 0): 'reset'}
                    self.assertEqual(actual, expected)

    def test_external_targets_in_repeated_parents_stay_distinct(self):
        for per in (False, True):
            for parent in (0, 1):
                for child in (0, 1):
                    with self.subTest(per=per, parent=parent, child=child):
                        ref = f's:0.{parent}.{child}:0'
                        result = self.query('nested_external', 'loads', ref, '--reach', 'local', per=per)
                        self.assertEqual(result['completeness']['status'],
                                         'partial' if child == 1 else 'complete', result)


if __name__ == '__main__':
    unittest.main()
