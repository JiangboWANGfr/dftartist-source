"""Author oracle reconstructs subtree membership from original statistics path vectors."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_impact',Path(__file__).with_name('source-impact.py'))
impact=importlib.util.module_from_spec(spec);spec.loader.exec_module(impact);ROOT=impact.ROOT
resources=[]
for path in [impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-hierarchy-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not impact.validator.is_valid(r);a=impact.verify(r['analysis']);s=impact.statistics(a);node_rows=members=0;stopped=False
    infos={v['info']['ref']:v['info'] for v in s['instances']}
    scope=r.get('scope');root=next((v['info'] for v in s['instances'] if v['info']['pathText']==s['scope']),None)
    if scope:assert scope==root
    for c,original in zip(r['comparisons'],a['comparisons']):
        assert c['scenario']==original['scenario'] and c['inputRows']==len(original['instances'])
        assert c['inputComplete']==(original['state']=='complete') and c['sourcesComplete']==original['sourcesComplete']
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        expected={}
        for mi,row in enumerate(original['instances']):
            local=s['instances'][row['instance']]['info'];p=local['path']
            for info in infos.values():
                q=info['path']
                if len(q)<=len(p) and p[:len(q)]==q:
                    e=expected.setdefault(info['ref'],dict(info=info,members=[],local=None));e['members'].append(mi)
                    if q==p:e['local']=mi
        ordered=sorted(expected.values(),key=lambda e:e['info']['path'])
        if not c['inputCollected']:assert not c['nodes']
        assert [v['info'] for v in c['nodes']]==[v['info'] for v in ordered[:len(c['nodes'])]]
        total=dict(coveredBits=0,changedBits=0,retainedOnlyBits=0)
        for v in c['nodes']:
            e=expected[v['info']['ref']];assert v['members']==e['members'] and v['local']==e['local']
            ancestors=[i for i in infos.values() if len(i['path'])<len(v['info']['path']) and v['info']['path'][:len(i['path'])]==i['path']]
            parent=max(ancestors,key=lambda i:len(i['path'])) if ancestors else None
            assert v['depth']==len(ancestors) and v['parent']==(parent['ref'] if parent else None)
            ct={k:sum(original['instances'][m]['counts'][k] for m in e['members']) for k in total}
            assert v['counts']==ct
            if v['info']['ref']==scope['ref']:total=ct
            node_rows+=1;members+=len(v['members'])
        assert c['totals']==total
        if c['state']=='complete':assert c['inputCollected'] and c['inputComplete'] and len(c['nodes'])==len(ordered) and c['totals']==original['totals']
    assert (r['nodeRows'],r['members'])==(node_rows,members)
    for f,l in [('queries','maxQueries'),('ancestorEntries','maxAncestors'),('nodeRows','maxNodes'),('members','maxMembers'),('work','maxWork')]:assert r[f]<=r['limits'][l]
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top='hierarchy_root',*extra,code=0,scope=None,levels=(0,1,0),hierarchy=True,with_impact=True):
    argv=[impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv','source-transitions.sv','source-impact.sv','source-hierarchy.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts',*(['--source-impact-summary'] if with_impact else []),*(['--source-hierarchy-summary'] if hierarchy else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+('.mode' if top.startswith(('impact_','hierarchy_')) else '.sel'),'0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=35);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout);return verify(v) if hierarchy else impact.verify(v)


class Hierarchy(unittest.TestCase):
    def test_real_ancestors_generate_and_escaped_names(self):
        r=run('hierarchy_root','--require-complete');c=r['comparisons'][0]
        self.assertEqual(c['totals'],dict(coveredBits=18,changedBits=16,retainedOnlyBits=2))
        self.assertEqual((r['nodeRows'],r['members'],r['queries'],r['ancestorEntries']),(14,26,9,13))
        self.assertEqual([v['depth'] for v in c['nodes']],[0,1,2,2,1,2,2])
        self.assertEqual(c['nodes'][0]['members'],list(range(5)));self.assertIsNotNone(c['nodes'][0]['local'])
        escaped=[v for v in c['nodes'] if v['info']['path'][-1]=='unit.with.dot'];self.assertEqual(len(escaped),2)
        generated=[v for v in c['nodes'] if v['info']['path'][-2:]==['g','u0']];self.assertEqual(len(generated),2)
        self.assertTrue(all(v['depth']==2 for v in generated));self.assertEqual(r['comparisons'][1]['totals']['retainedOnlyBits'],18)
    def test_scope_stops_at_actual_scope_instance(self):
        r=run('hierarchy_root','--require-complete',scope='hierarchy_root.left');self.assertEqual((r['queries'],r['ancestorEntries'],r['nodeRows']),(5,4,6))
        self.assertEqual(r['comparisons'][0]['totals']['changedBits'],8);self.assertEqual(r['comparisons'][0]['nodes'][0]['parent'],None)
        r=run('hierarchy_root','--require-complete',scope='hierarchy_root.left.g.u0');self.assertEqual((r['queries'],r['ancestorEntries'],r['nodeRows']),(1,1,2))
    def test_atomic_collection_and_actual_query_counters(self):
        for budget in [1,2]:
            r=run('hierarchy_root','--max-source-hierarchy-queries',str(budget),'--require-complete',code=4)
            self.assertEqual((r['queries'],r['nodeRows'],r['members']),(budget,0,0));self.assertFalse(r['comparisons'][0]['inputCollected']);self.assertEqual(r['comparisons'][1]['state'],'not_run')
        for flag in ['ancestors','work']:
            r=run('hierarchy_root','--max-source-hierarchy-'+flag,'1','--require-complete',code=4);self.assertEqual(r['nodeRows'],0);self.assertFalse(r['comparisons'][0]['inputCollected'])
    def test_whole_node_prefix_retains_full_scope_total(self):
        full=run('hierarchy_root','--require-complete')['comparisons'][0]
        r=run('hierarchy_root','--max-source-hierarchy-nodes','1','--require-complete',code=4);self.assertEqual(r['comparisons'][0]['nodes'],full['nodes'][:1]);self.assertEqual(r['comparisons'][0]['totals'],full['totals']);self.assertEqual(r['members'],5)
        r=run('hierarchy_root','--max-source-hierarchy-members','1','--require-complete',code=4);self.assertEqual((r['nodeRows'],r['members']),(0,0));self.assertTrue(r['comparisons'][0]['inputCollected'])
    def test_prior_partial_empty_unknown_and_context_cache(self):
        r=run('hierarchy_root','--max-source-impact-instances','1','--require-complete',code=4);self.assertFalse(r['comparisons'][0]['inputComplete']);self.assertEqual(r['comparisons'][0]['totals']['coveredBits'],2)
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertEqual(r['nodeRows'],0);self.assertFalse(r['comparisons'][0]['sourcesComplete'])
        r=run('empty','--require-complete',levels=(None,None));self.assertEqual((r['queries'],r['nodeRows'],r['ancestorEntries']),(1,0,0))
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
        r=run('hierarchy_root','--require-complete',levels=(0,1,0,1,0,1,0,1));self.assertEqual((len(r['comparisons']),r['queries'],r['ancestorEntries']),(7,9,13))
    def test_dependencies_errors_and_old_impact(self):
        run('hierarchy_root',with_impact=False,code=2);run('hierarchy_root','--max-source-hierarchy-work','1',hierarchy=False,code=2)
        self.assertEqual(run('hierarchy_root',hierarchy=False)['algorithm'],'rtl-register-source-impact-v1')
        for flag,hi in [('queries',100000),('ancestors',2000000),('nodes',100000),('members',2000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('hierarchy_root','--max-source-hierarchy-'+flag,str(v),code=2)
        run('hierarchy_root','--input-value','hierarchy_root.mode','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-hierarchy.py'])
