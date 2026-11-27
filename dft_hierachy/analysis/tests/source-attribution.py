"""Author oracle reconstructs per-bit role membership from the old delta report."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_deltas',Path(__file__).with_name('source-deltas.py'))
deltas=importlib.util.module_from_spec(spec);spec.loader.exec_module(deltas);ROOT=deltas.ROOT
resources=[]
for path in [deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-attribution-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not deltas.validator.is_valid(r);a=deltas.verify(r['analysis']);expected={};input_counts={}
    for scenario in range(1,len(a['analysis']['scenarios'])):
        signal_bits={};resolved=unresolved=0
        for i,v in enumerate(a['rows']):
            if v['scenario']!=scenario:continue
            if 'delta' not in v:unresolved+=1;continue
            resolved+=1
            for signal in v['delta']['signals']:
                dest=signal_bits.setdefault(signal['signal'],{})
                for role in ['added','removed','retained']:
                    for bit in deltas.bits(signal[role]):dest.setdefault(bit,dict(added=set(),removed=set(),retained=set()))[role].add(i)
        expected[scenario]=signal_bits;input_counts[scenario]=(resolved,unresolved,a['inputRows']-resolved-unresolved)
    assert [v['scenario'] for v in r['comparisons']]==list(expected)
    rows=segments=members=intervals=0;stopped=False
    for c in r['comparisons']:
        scenario=c['scenario'];total=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        if c['inputCollected']:
            assert (c['resolvedRows'],c['unresolvedRows'],c['missingRows'])==input_counts[scenario]
            assert c['sourcesComplete']==(a['analysis']['quality']['completeness']=='complete' and input_counts[scenario][1:]==(0,0))
            intervals+=sum(len(v[k]) for row in a['rows'] if row['scenario']==scenario and 'delta' in row for v in row['delta']['signals'] for k in ['added','removed','retained'])
        else:assert not c['rows'] and not c['sourcesComplete'] and c['resolvedRows']==c['unresolvedRows']==0 and c['missingRows']==a['inputRows']
        assert [v['signal'] for v in c['rows']]==sorted(expected[scenario])[:len(c['rows'])]
        for row in c['rows']:
            actual={};prev_end=None;prev_roles=None;counts=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)
            for seg in row['segments']:
                lo=seg['bits']['lsb'];hi=lo+seg['bits']['width'];roles={k:set(seg[k+'Rows']) for k in ['added','removed','retained']}
                assert any(roles.values()) and (prev_end is None or lo>=prev_end)
                assert prev_end!=lo or roles!=prev_roles
                for k in roles:assert seg[k+'Rows']==sorted(roles[k])
                for bit in range(lo,hi):assert bit not in actual;actual[bit]=roles
                counts['coveredBits']+=hi-lo;counts['changedBits' if roles['added'] or roles['removed'] else 'retainedOnlyBits']+=hi-lo
                members+=sum(len(v) for v in roles.values());segments+=1;prev_end=hi;prev_roles=roles
            assert actual==expected[scenario][row['signal']] and row['counts']==counts
            for k,v in counts.items():total[k]+=v
            rows+=1
        assert c['totals']==total
        if c['state']=='complete':assert c['inputCollected'] and c['sourcesComplete'] and len(c['rows'])==len(expected[scenario])
    assert (r['rows'],r['segments'],r['members'],r['intervals'])==(rows,segments,members,intervals)
    for field in ['rows','segments','members','intervals','work']:assert r[field]<=r['limits']['max'+field.title()]
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top,*extra,code=0,levels=(0,1,0),scope=None,attribution=True,delta=True):
    argv=[deltas.matrix.sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources',*(['--source-coverage-deltas'] if delta else []),*(['--source-bit-attribution'] if attribution else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+'.sel','0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=30);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    value=json.loads(p.stdout);return verify(value) if attribution else deltas.verify(value)


class Attribution(unittest.TestCase):
    def test_source_transfer_preserves_both_references_without_double_count(self):
        r=run('sources_move','--require-complete');c=r['comparisons'][0];self.assertEqual(c['totals'],dict(coveredBits=9,changedBits=7,retainedOnlyBits=2))
        s=c['rows'][0]['segments'];self.assertEqual([v['bits'] for v in s],[dict(lsb=1,width=3),dict(lsb=4,width=4),dict(lsb=8,width=2)])
        self.assertEqual((s[0]['addedRows'],s[0]['removedRows'],s[0]['retainedRows']),([2],[0],[]))
        self.assertEqual((s[1]['addedRows'],s[1]['retainedRows']),([2],[0]))
        self.assertEqual(r['comparisons'][1]['totals'],dict(coveredBits=9,changedBits=0,retainedOnlyBits=9))
    def test_overlapping_sources_and_polarity(self):
        c=run('sources_multiplicity','--require-complete')['comparisons'][0];self.assertEqual(c['totals'],dict(coveredBits=4,changedBits=0,retainedOnlyBits=4))
        self.assertEqual(c['rows'][0]['segments'][0]['retainedRows'],[0,2])
        c=run('sources_polarity','--require-complete')['comparisons'][0];self.assertEqual(c['totals'],dict(coveredBits=4,changedBits=4,retainedOnlyBits=0))
    def test_holes_deep_and_empty_eight(self):
        run('deltas_holes','--require-complete');run('deep_top','--require-complete',scope='deep_top.u')
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['comparisons'][0]['rows'],[])
        self.assertEqual(len(run('sources_move','--require-complete',levels=(0,1,0,1,0,1,0,1))['comparisons']),7)
    def test_partial_delta_matrix_and_unknown_are_not_zero_proofs(self):
        r=run('sources_move','--max-source-delta-rows','1','--require-complete',code=4);self.assertEqual(r['comparisons'][0]['missingRows'],1);self.assertFalse(r['comparisons'][0]['sourcesComplete'])
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertTrue(all(not c['sourcesComplete'] and not c['rows'] for c in r['comparisons']))
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
        run('sources_move','--max-register-source-scenario-rows','1','--require-complete',code=4)
    def test_post_caps_publish_atomic_signal_rows_and_collection(self):
        for flag in ['rows','intervals','segments','members','work']:
            r=run('sources_move','--max-source-attribution-'+flag,'1','--require-complete',code=4)
            if flag!='rows':self.assertEqual((r['rows'],r['segments'],r['members']),(0,0,0))
            if flag in ['work','intervals']:self.assertFalse(r['comparisons'][0]['inputCollected']);self.assertEqual(r['intervals'],0)
    def test_multiple_signals_and_signal_atomic_prefix(self):
        r=run('attribution_multi','--require-complete');self.assertEqual(len(r['comparisons'][0]['rows']),2)
        self.assertEqual(r['comparisons'][0]['totals'],dict(coveredBits=11,changedBits=9,retainedOnlyBits=2))
        p=run('attribution_multi','--max-source-attribution-rows','1','--require-complete',code=4)
        self.assertEqual(p['comparisons'][0]['rows'],r['comparisons'][0]['rows'][:1]);self.assertEqual(p['comparisons'][0]['state'],'partial')
        self.assertEqual(p['comparisons'][1]['state'],'not_run');self.assertTrue(p['comparisons'][0]['sourcesComplete'])
    def test_dependency_limits_and_old_mode(self):
        run('sources_move',delta=False,code=2)
        run('sources_move','--max-source-attribution-work','1',attribution=False,code=2)
        self.assertEqual(run('sources_move',attribution=False)['algorithm'],'rtl-register-source-deltas-v1')
        for flag,hi in [('rows',100000),('intervals',2000000),('segments',2000000),('members',10000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('sources_move','--max-source-attribution-'+flag,str(v),code=2)
        run('sources_move','--input-value','sources_move.sel','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-attribution.py'])
