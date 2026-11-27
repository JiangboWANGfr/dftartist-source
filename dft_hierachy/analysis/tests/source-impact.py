"""Author oracle maps original per-bit evidence to instance and definition identities."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_transitions',Path(__file__).with_name('source-transitions.py'))
transitions=importlib.util.module_from_spec(spec);spec.loader.exec_module(transitions);ROOT=transitions.ROOT
resources=[]
for path in [transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-impact-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def statistics(r):
    while r['algorithm']!='rtl-register-statistics-v1':r=r['analysis']
    return r


def counts(bits,changed):return dict(coveredBits=len(bits),changedBits=len(changed),retainedOnlyBits=len(bits-changed))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not transitions.validator.is_valid(r);a=transitions.verify(r['analysis']);s=statistics(a);instance_rows=definition_rows=member_count=input_members=0;stopped=False
    assert [c['scenario'] for c in r['comparisons']]==[c['scenario'] for c in a['comparisons']]
    for ci,(c,original) in enumerate(zip(r['comparisons'],a['comparisons'])):
        assert c['inputCohorts']==len(original['cohorts']) and c['inputComplete']==(original['state']=='complete') and c['sourcesComplete']==original['sourcesComplete']
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        expected={};all_members=0
        for gi,group in enumerate(original['cohorts']):
            for mi,member in enumerate(group['members']):
                row=a['analysis']['comparisons'][ci]['rows'][member['row']];segment=row['segments'][member['segment']];signal=row['signal'];inst=s['signals'][signal]['instance'];definition=s['instances'][inst]['definition']
                v=expected.setdefault(inst,dict(definition=definition,members=[],bits=set(),changed=set()));v['members'].append(dict(cohort=gi,member=mi));all_members+=1
                for bit in range(segment['bits']['lsb'],segment['bits']['lsb']+segment['bits']['width']):
                    key=(signal,bit);assert key not in v['bits'];v['bits'].add(key)
                    if group['changed']:v['changed'].add(key)
        if c['inputCollected']:assert c['inputMembers']==all_members;input_members+=all_members
        else:assert c['inputMembers']==0 and not c['instances'] and not c['definitions']
        assert [v['instance'] for v in c['instances']]==sorted(expected)[:len(c['instances'])]
        definitions={};total=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)
        for row in c['instances']:
            inst=row['instance'];e=expected[inst];self_counts=counts(e['bits'],e['changed'])
            assert row['definition']==e['definition'] and row['members']==e['members'] and row['counts']==self_counts
            d=definitions.setdefault(row['definition'],dict(instances=[],counts=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)));d['instances'].append(inst)
            assert inst in s['definitions'][row['definition']]['instances'] and s['instances'][inst]['info']['def']==s['definitions'][row['definition']]['ref']
            for k,v in self_counts.items():total[k]+=v;d['counts'][k]+=v
            instance_rows+=1;member_count+=len(row['members'])
        assert c['definitions']==[dict(definition=di,**definitions[di]) for di in sorted(definitions)]
        definition_rows+=len(definitions);assert c['totals']==total
        if c['state']=='complete':assert c['inputComplete'] and c['inputCollected'] and len(c['instances'])==len(expected) and total==original['totals']
    assert (r['instanceRows'],r['definitionRows'],r['members'],r['inputMembers'])==(instance_rows,definition_rows,member_count,input_members)
    for field,limit in [('instanceRows','maxInstances'),('definitionRows','maxDefinitions'),('members','maxMembers'),('inputMembers','maxInputMembers'),('work','maxWork')]:assert r[field]<=r['limits'][limit]
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top,*extra,code=0,scope=None,levels=(0,1,0),impact=True,with_transitions=True):
    argv=[transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv','source-transitions.sv','source-impact.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution',*(['--source-transition-cohorts'] if with_transitions else []),*(['--source-impact-summary'] if impact else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+('.mode' if top.startswith('impact_') else '.sel'),'0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=35);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout);return verify(v) if impact else transitions.verify(v)


class Impact(unittest.TestCase):
    def test_hierarchical_instances_and_shared_definition_keep_distinct_state_bits(self):
        r=run('impact_top','--require-complete');c=r['comparisons'][0];s=statistics(r)
        self.assertEqual(c['totals'],dict(coveredBits=10,changedBits=8,retainedOnlyBits=2));self.assertEqual(len(c['instances']),3)
        by_path={s['instances'][v['instance']]['info']['pathText']:v['counts'] for v in c['instances']}
        self.assertEqual(by_path['impact_top.u0']['changedBits'],4);self.assertEqual(by_path['impact_top.u1']['changedBits'],4);self.assertEqual(by_path['impact_top.keep']['retainedOnlyBits'],2)
        by_def={s['definitions'][v['definition']]['name']:v for v in c['definitions']};self.assertEqual(by_def['impact_leaf']['counts']['coveredBits'],8);self.assertEqual(len(by_def['impact_leaf']['instances']),2)
        self.assertEqual(r['comparisons'][1]['totals'],dict(coveredBits=10,changedBits=0,retainedOnlyBits=10))
    def test_explicit_scope_and_multiple_sources(self):
        r=run('impact_top','--require-complete',scope='impact_top.u1');self.assertEqual(r['comparisons'][0]['totals']['changedBits'],4);self.assertEqual(len(r['comparisons'][0]['instances']),1)
        r=run('transitions_multi_sources','--require-complete');self.assertEqual(r['comparisons'][0]['totals']['changedBits'],4)
        run('deltas_holes','--require-complete');run('sources_polarity','--require-complete')
    def test_instance_prefix_and_definition_admission_are_one_commit(self):
        full=run('impact_top','--require-complete')['comparisons'][0]
        p=run('impact_top','--max-source-impact-instances','1','--require-complete',code=4);self.assertEqual(p['comparisons'][0]['instances'],full['instances'][:1]);self.assertEqual(len(p['comparisons'][0]['definitions']),1);self.assertEqual(p['comparisons'][1]['state'],'not_run')
        p=run('impact_top','--max-source-impact-definitions','1','--require-complete',code=4);self.assertEqual(len(p['comparisons'][0]['definitions']),1);self.assertTrue(p['comparisons'][0]['instances'])
        p=run('sources_move','--max-source-impact-members','1','--require-complete',code=4);self.assertEqual((p['instanceRows'],p['definitionRows'],p['members']),(0,0,0));self.assertTrue(p['comparisons'][0]['inputCollected'])
    def test_collection_work_and_unknown_preserve_quality(self):
        for flag in ['input-members','work']:
            p=run('impact_top','--max-source-impact-'+flag,'1','--require-complete',code=4);self.assertEqual((p['instanceRows'],p['definitionRows'],p['members'],p['inputMembers']),(0,0,0,0));self.assertFalse(p['comparisons'][0]['inputCollected'])
        p=run('impact_top','--max-source-transition-cohorts','1','--require-complete',code=4);self.assertFalse(p['comparisons'][0]['inputComplete']);self.assertTrue(p['comparisons'][0]['sourcesComplete']);self.assertTrue(p['comparisons'][0]['instances'])
        p=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertEqual(p['instanceRows'],0);self.assertFalse(p['comparisons'][0]['sourcesComplete'])
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
    def test_empty_eight_and_dependencies(self):
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['instanceRows'],0)
        self.assertEqual(len(run('impact_top','--require-complete',levels=(0,1,0,1,0,1,0,1))['comparisons']),7)
        run('impact_top',with_transitions=False,code=2);run('impact_top','--max-source-impact-work','1',impact=False,code=2)
        self.assertEqual(run('impact_top',impact=False)['algorithm'],'rtl-register-source-transitions-v1')
    def test_reject_limits_and_second_context_errors(self):
        for flag,hi in [('instances',100000),('definitions',100000),('members',2000000),('input-members',2000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('impact_top','--max-source-impact-'+flag,str(v),code=2)
        run('impact_top','--input-value','impact_top.mode','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-impact.py'])
