"""Author expectations for terminal source coverage across static contexts."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator

def module(name,file):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v);return v
sources=module('author_sources','register-control-sources.py');deep=module('author_deep','register-generation-scenarios.py');ROOT=sources.ROOT
resources=[]
for path in [sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(path.read_text());resources.append((s['$id'],Resource.from_contents(s)))
schema=json.loads((ROOT/'sequential/register-source-scenarios-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))
def key(v):return json.dumps(v,sort_keys=True)
def coverage(v):
    return {s['signal']:{b for seg in s['coverage']['segments'] for b in range(seg['bits']['lsb'],seg['bits']['lsb']+seg['bits']['width'])} for s in v['signals']} if v else {}


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not sources.validator.is_valid(r) and not deep.validator.is_valid(r)
    a=deep.verify(r['analysis']);contexts=[];identities={};indexed=0
    for i,c in enumerate(r['scenarios']):
        assert c['scenario']==i and c['name']==a['scenarios'][i]['name'];value=None
        if 'sources' in c:
            assert c['status']!='not_run' and 'analysis' not in c['sources'] and 'analysis' not in c['fanout']
            profile=dict(a['analysis']['scenarios'][i]['profile'],analysis=a['analysis']['analysis']);g=dict(a['scenarios'][i]['generation'],analysis=profile)
            f=dict(c['fanout'],analysis=g);value=sources.verify(dict(c['sources'],analysis=f))
            assert c['status']==('complete' if value['quality']['completeness']=='complete' else 'partial')
            for gi,group in enumerate(value['groups']):
                ident=key(group['source'])
                identities.setdefault(ident,[None]*len(r['scenarios']))[i]=gi;indexed+=1
        else:assert c['status']=='not_run' and c['reasons']
        contexts.append(value)
    assert r['indexedGroups']<=indexed and r['inputSources']<=len(identities)
    if r['indexComplete']:assert r['indexedGroups']==indexed and r['inputSources']==len(identities)
    assert [key(row['source']) for row in r['rows']]==list(identities)[:len(r['rows'])]
    intervals=0;counts=dict(scenarios=len(contexts),notRun=sum(v is None for v in contexts),rows=len(r['rows']),comparisons=0,changed=0,unchanged=0,unresolved=0)
    for row in r['rows']:
        assert row['groups']==identities[key(row['source'])] and len(row['status'])==len(contexts)-1
        projections=[];known=[]
        for i,g in enumerate(row['groups']):
            known.append(r['indexComplete'] and contexts[i] is not None and contexts[i]['quality']['completeness']=='complete')
            projections.append(coverage(contexts[i]['groups'][g]) if known[-1] and g is not None else {})
            if known[-1] and g is not None:
                for bits in projections[-1].values():intervals+=sum(b-1 not in bits for b in bits)
        for i,status in enumerate(row['status'],1):
            expected='unresolved' if not known[0] or not known[i] else 'unchanged' if projections[0]==projections[i] else 'changed'
            assert status==expected;counts[status]+=1;counts['comparisons']+=1
    assert r['summary']==counts and r['cells']==len(r['rows'])*len(contexts)<=r['limits']['maxCells']
    assert r['intervals']==intervals<=r['limits']['maxIntervals'] and len(r['rows'])<=r['limits']['maxRows'] and r['work']<=r['limits']['maxWork']
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and all(known for known in [v is not None and v['quality']['completeness']=='complete' for v in contexts]) and r['indexComplete'] and len(r['rows'])==r['inputSources'] and not counts['unresolved']
    return r


def run(top,*extra,scope=None,code=0,levels=(0,1,0),matrix=True,deep_mode=True):
    argv=[sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios',*(['--compare-register-generation'] if deep_mode else []),*(['--compare-register-sources'] if matrix else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario',['BASE','OTHER','BACK'][i] if i<3 else 'S'+str(i)]
        if level is not None:argv+=['--input-value',top+'.sel','0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=25);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    value=json.loads(p.stdout);return verify(value) if matrix else deep.verify(value)


class SourceScenarios(unittest.TestCase):
    def test_same_source_coverage_changes_and_returns(self):
        r=run('sources_move','--require-complete');self.assertEqual(len(r['rows']),2)
        self.assertTrue(all(row['status']==['changed','unchanged'] for row in r['rows']))
        self.assertEqual([c['sources']['groups'][0]['totals']['coveredBits'] for c in r['scenarios']],[9,6,9])
    def test_fact_multiplicity_changes_but_bit_union_is_equal(self):
        r=run('sources_multiplicity','--require-complete');self.assertTrue(all(row['status']==['unchanged','unchanged'] for row in r['rows']))
        self.assertNotEqual(r['scenarios'][0]['sources']['groups'][0]['totals']['facts'],r['scenarios'][1]['sources']['groups'][0]['totals']['facts'])
        self.assertTrue(any(row['status']=='changed' for row in r['analysis']['impacts'][0]['rows']))
    def test_multilevel_clock_async_and_polarity_identity(self):
        r=run('deep_top','--require-complete',scope='deep_top.u');self.assertEqual(r['summary']['changed'],2);self.assertEqual(r['summary']['unchanged'],4)
        r=run('sources_polarity','--require-complete');self.assertEqual({row['source']['inverted'] for row in r['rows']},{False,True})
        self.assertTrue(all(row['status']==['changed','unchanged'] for row in r['rows']))
    def test_unknown_cycle_and_source_prefix_do_not_prove_absence(self):
        r=run('generation_self','--require-complete',levels=(None,None,None),code=4);self.assertEqual(r['rows'],[])
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None,None),code=4)
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertTrue(all(status=='unresolved' for row in r['rows'] for status in row['status']))
        r=run('sources_move','--max-generation-comparison-cones','1','--require-complete',code=4);self.assertTrue(all(row['status']==['changed','unchanged'] for row in r['rows']))
    def test_atomic_rows_canonical_intervals_and_work_index(self):
        r=run('sources_move','--max-register-source-scenario-rows','1','--require-complete',code=4);self.assertEqual((len(r['rows']),r['cells']),(1,3))
        for flag in ['cells','intervals','work']:
            r=run('sources_move','--max-register-source-scenario-'+flag,'1','--require-complete',code=4);self.assertEqual(r['rows'],[])
        run('sources_move','--max-register-fanout-members','1','--require-complete',code=4)
    def test_empty_repeated_context_and_maximum_scenario_count(self):
        r=run('empty','--require-complete',levels=(None,None,None));self.assertEqual(r['rows'],[])
        r=run('sources_move','--require-complete',levels=(0,0,0));self.assertTrue(all(row['status']==['unchanged','unchanged'] for row in r['rows']))
        r=run('sources_move','--require-complete',levels=(0,1,0,1,0,1,0,1));self.assertTrue(all(len(row['groups'])==8 and row['status']==['changed','unchanged','changed','unchanged','changed','unchanged','changed'] for row in r['rows']))
    def test_mode_dependencies_and_limit_validation(self):
        run('sources_move',deep_mode=False,code=2)
        legacy=run('sources_move',matrix=False);self.assertEqual(legacy['algorithm'],'rtl-register-generation-scenarios-v1')
        for flag in ['--register-control-sources','--register-control-fanout','--source-inventory']:run('sources_move',flag,code=2)
        run('sources_move','--max-register-source-scenario-work','1',matrix=False,code=2)
        for flag,hi in [('rows',100000),('cells',1000000),('intervals',2000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('sources_move','--max-register-source-scenario-'+flag,str(v),code=2)


if __name__=='__main__':unittest.main(argv=['source-scenarios.py'])
