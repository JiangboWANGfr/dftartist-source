"""Author oracle groups existing per-bit source identities, not production cohorts."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_attribution',Path(__file__).with_name('source-attribution.py'))
attribution=importlib.util.module_from_spec(spec);spec.loader.exec_module(attribution);ROOT=attribution.ROOT
resources=[]
for path in [attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-transitions-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not attribution.validator.is_valid(r);a=attribution.verify(r['analysis']);cohorts=members=sources=input_segments=0;stopped=False
    assert [c['scenario'] for c in r['comparisons']]==[c['scenario'] for c in a['comparisons']]
    for c,original in zip(r['comparisons'],a['comparisons']):
        assert c['inputRows']==len(original['rows']) and c['inputComplete']==(original['state']=='complete') and c['sourcesComplete']==original['sourcesComplete']
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        expected={};bitsets={};segment_count=0
        for row_index,row in enumerate(original['rows']):
            for segment_index,v in enumerate(row['segments']):
                before=tuple(sorted({a['analysis']['rows'][i]['matrixRow'] for i in v['removedRows']+v['retainedRows']}))
                after=tuple(sorted({a['analysis']['rows'][i]['matrixRow'] for i in v['addedRows']+v['retainedRows']}))
                key=(before,after);expected.setdefault(key,[]).append(dict(row=row_index,segment=segment_index));segment_count+=1
                bits=bitsets.setdefault(key,set())
                for bit in range(v['bits']['lsb'],v['bits']['lsb']+v['bits']['width']):assert (row['signal'],bit) not in bits;bits.add((row['signal'],bit))
        keys=sorted(expected);actual_keys=[(tuple(v['baselineSources']),tuple(v['scenarioSources'])) for v in c['cohorts']]
        assert actual_keys==keys[:len(actual_keys)]
        if c['inputCollected']:assert c['inputSegments']==segment_count;input_segments+=segment_count
        else:assert not c['cohorts'] and not c['inputSegments']
        totals=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)
        for group,key in zip(c['cohorts'],keys):
            assert group['members']==expected[key] and group['changed']==(key[0]!=key[1]);count=len(bitsets[key])
            counts=dict(coveredBits=count,changedBits=count if group['changed'] else 0,retainedOnlyBits=0 if group['changed'] else count)
            assert group['counts']==counts
            for k,v in counts.items():totals[k]+=v
            cohorts+=1;members+=len(group['members']);sources+=len(key[0])+len(key[1])
        assert c['totals']==totals
        if c['state']=='complete':assert c['inputCollected'] and c['inputComplete'] and len(c['cohorts'])==len(keys) and c['totals']==original['totals']
    assert (r['cohorts'],r['members'],r['sources'],r['inputSegments'])==(cohorts,members,sources,input_segments)
    for field in ['cohorts','members','sources','inputSegments','work']:assert r[field]<=r['limits']['max'+field[0].upper()+field[1:]]
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top,*extra,code=0,levels=(0,1,0),scope=None,transitions=True,with_attribution=True):
    argv=[attribution.deltas.matrix.sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv','source-transitions.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas',*(['--source-bit-attribution'] if with_attribution else []),*(['--source-transition-cohorts'] if transitions else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+'.sel','0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=30);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    value=json.loads(p.stdout);return verify(value) if transitions else attribution.verify(value)


class Transitions(unittest.TestCase):
    def test_sets_order_and_original_segments(self):
        r=run('sources_move','--require-complete');c=r['comparisons'][0];self.assertEqual(c['totals'],dict(coveredBits=9,changedBits=7,retainedOnlyBits=2))
        self.assertEqual([(v['baselineSources'],v['scenarioSources']) for v in c['cohorts']],[([0],[0]),([0],[0,1]),([0],[1])])
        self.assertEqual([v['counts']['coveredBits'] for v in c['cohorts']],[2,4,3]);self.assertEqual(r['comparisons'][1]['totals']['retainedOnlyBits'],9)
    def test_multisignal_group_and_member_atomicity(self):
        r=run('transitions_shared','--require-complete');c=r['comparisons'][0];self.assertEqual(len(c['cohorts']),1)
        self.assertEqual(c['cohorts'][0]['counts']['coveredBits'],8);self.assertEqual(c['cohorts'][0]['members'],[dict(row=0,segment=0),dict(row=1,segment=0)])
        p=run('transitions_shared','--max-source-transition-members','1','--require-complete',code=4);self.assertEqual((p['cohorts'],p['members'],p['sources']),(0,0,0));self.assertTrue(p['comparisons'][0]['inputCollected'])
        r=run('attribution_multi','--require-complete');self.assertEqual(r['comparisons'][0]['cohorts'][-1]['counts']['coveredBits'],7)
    def test_many_to_many_is_a_source_set_not_guessed_pairs(self):
        c=run('transitions_multi_sources','--require-complete')['comparisons'][0];self.assertEqual(len(c['cohorts']),1);v=c['cohorts'][0]
        self.assertEqual((v['baselineSources'],v['scenarioSources']),([0,1],[1,2]));self.assertEqual(v['counts'],dict(coveredBits=4,changedBits=4,retainedOnlyBits=0))
        c=run('sources_multiplicity','--require-complete')['comparisons'][0];self.assertEqual(c['totals']['coveredBits'],4);self.assertEqual(c['cohorts'][0]['baselineSources'],c['cohorts'][0]['scenarioSources'])
    def test_holes_polarity_deep_empty_and_eight(self):
        run('deltas_holes','--require-complete');run('sources_polarity','--require-complete');run('deep_top','--require-complete',scope='deep_top.u')
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['cohorts'],0)
        self.assertEqual(len(run('sources_move','--require-complete',levels=(0,1,0,1,0,1,0,1))['comparisons']),7)
    def test_partial_inputs_never_prove_complete_sets(self):
        p=run('attribution_multi','--max-source-attribution-rows','1','--require-complete',code=4)
        self.assertTrue(p['comparisons'][0]['sourcesComplete']);self.assertFalse(p['comparisons'][0]['inputComplete']);self.assertEqual(p['comparisons'][0]['state'],'partial')
        p=run('sources_move','--max-source-delta-rows','1','--require-complete',code=4);self.assertFalse(p['comparisons'][0]['sourcesComplete']);self.assertTrue(p['comparisons'][0]['cohorts'])
        p=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertEqual(p['cohorts'],0);self.assertTrue(all(not c['sourcesComplete'] for c in p['comparisons']))
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
    def test_post_caps_keep_whole_lexicographic_cohorts(self):
        full=run('sources_move','--require-complete')
        p=run('sources_move','--max-source-transition-cohorts','1','--require-complete',code=4);self.assertEqual(p['comparisons'][0]['cohorts'],full['comparisons'][0]['cohorts'][:1]);self.assertEqual(p['comparisons'][1]['state'],'not_run')
        for field in ['sources','input-segments','work']:
            p=run('sources_move','--max-source-transition-'+field,'1','--require-complete',code=4);self.assertEqual((p['cohorts'],p['members'],p['sources']),(0,0,0))
            if field!='sources':self.assertFalse(p['comparisons'][0]['inputCollected']);self.assertEqual(p['inputSegments'],0)
    def test_dependencies_limits_and_original_mode(self):
        run('sources_move',with_attribution=False,code=2)
        run('sources_move','--max-source-transition-work','1',transitions=False,code=2)
        self.assertEqual(run('sources_move',transitions=False)['algorithm'],'rtl-register-source-attribution-v1')
        for field,hi in [('cohorts',10000),('members',1000000),('sources',1000000),('input-segments',2000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('sources_move','--max-source-transition-'+field,str(v),code=2)
        run('sources_move','--input-value','sources_move.sel','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-transitions.py'])
