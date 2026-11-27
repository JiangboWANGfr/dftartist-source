"""Author oracle inverts original per-source delta roles; production merges cohort source sets."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_hierarchy',Path(__file__).with_name('source-hierarchy.py'))
hierarchy=importlib.util.module_from_spec(spec);spec.loader.exec_module(hierarchy);ROOT=hierarchy.ROOT
BIN=hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.BIN
resources=[]
for path in [hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-hierarchy-matrix-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not hierarchy.validator.is_valid(r);h=hierarchy.verify(r['analysis']);i=h['analysis'];t=i['analysis'];a=t['analysis'];d=a['analysis'];s=hierarchy.impact.statistics(h)
    rows=members=input_nodes=input_members=0;stopped=False
    for ci,(c,hc) in enumerate(zip(r['comparisons'],h['comparisons'])):
        assert c['scenario']==hc['scenario'] and c['inputNodes']==len(hc['nodes']) and c['inputComplete']==(hc['state']=='complete') and c['sourcesComplete']==hc['sourcesComplete']
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        expected={}
        for ni,node in enumerate(hc['nodes']):
            instances={i['comparisons'][ci]['instances'][mi]['instance'] for mi in node['members']}
            allowed=set()
            for mi in node['members']:
                for ref in i['comparisons'][ci]['instances'][mi]['members']:
                    m=t['comparisons'][ci]['cohorts'][ref['cohort']]['members'][ref['member']];allowed.add((m['row'],m['segment']))
            for ri,row in enumerate(a['comparisons'][ci]['rows']):
                if s['signals'][row['signal']]['instance'] not in instances:continue
                for si,segment in enumerate(row['segments']):
                    if (ri,si) not in allowed:continue
                    for role in ['added','removed','retained']:
                        for delta in segment[role+'Rows']:
                            source=d['rows'][delta]['matrixRow'];expected.setdefault((source,ni),[]).append(dict(row=ri,segment=si,role=role))
        for ms in expected.values():ms.sort(key=lambda m:(m['row'],m['segment']))
        count=sum(map(len,expected.values()))
        if c['inputCollected']:assert c['inputMembers']==count;input_members+=count;input_nodes+=len(hc['nodes'])
        else:assert not c['rows'] and c['inputMembers']==0
        assert [(v['source'],v['node']) for v in c['rows']]==sorted(expected)[:len(c['rows'])]
        for row in c['rows']:
            key=(row['source'],row['node']);assert row['members']==expected[key]
            roles={k:set() for k in ['added','removed','retained']}
            for m in row['members']:
                original=a['comparisons'][ci]['rows'][m['row']];segment=original['segments'][m['segment']]
                roles[m['role']].update((original['signal'],b) for b in range(segment['bits']['lsb'],segment['bits']['lsb']+segment['bits']['width']))
            assert not(roles['added']&roles['removed'] or roles['added']&roles['retained'] or roles['removed']&roles['retained'])
            assert row['counts']==dict(baselineBits=len(roles['removed']|roles['retained']),scenarioBits=len(roles['added']|roles['retained']),addedBits=len(roles['added']),removedBits=len(roles['removed']),retainedBits=len(roles['retained']))
            rows+=1;members+=len(row['members'])
        if c['state']=='complete':assert c['inputCollected'] and c['inputComplete'] and len(c['rows'])==len(expected)
    assert (r['rows'],r['members'],r['inputNodes'],r['inputMembers'])==(rows,members,input_nodes,input_members)
    for f,l in [('rows','maxRows'),('members','maxMembers'),('inputNodes','maxInputNodes'),('inputMembers','maxInputMembers'),('work','maxWork')]:assert r[f]<=r['limits'][l]
    if r['quality']['completeness']=='complete':assert h['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top='hierarchy_root',*extra,code=0,scope=None,levels=(0,1,0),matrix=True,with_hierarchy=True):
    argv=[BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv','source-transitions.sv','source-impact.sv','source-hierarchy.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary',*(['--source-hierarchy-summary'] if with_hierarchy else []),*(['--source-hierarchy-matrix'] if matrix else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+('.mode' if top.startswith(('impact_','hierarchy_')) else '.sel'),'0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=35);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout);return verify(v) if matrix else hierarchy.verify(v)


class Matrix(unittest.TestCase):
    def test_source_roles_and_real_hierarchy(self):
        r=run('hierarchy_root','--require-complete');c=r['comparisons'][0]
        self.assertEqual((r['rows'],r['members'],r['inputNodes'],r['inputMembers']),(21,38,14,38));self.assertEqual(r['analysis']['queries'],9)
        roots=[v for v in c['rows'] if v['node']==0]
        self.assertEqual(sorted(v['counts']['removedBits'] for v in roots),[0,16]);self.assertEqual(sorted(v['counts']['addedBits'] for v in roots),[0,16]);self.assertEqual(sum(v['counts']['retainedBits'] for v in roots),2)
        self.assertEqual(len(r['comparisons'][1]['rows']),7);self.assertEqual(sum(v['counts']['retainedBits'] for v in r['comparisons'][1]['rows'] if v['node']==0),18)
        r=run('hierarchy_root','--require-complete',scope='hierarchy_root.left');self.assertEqual(len(r['comparisons'][0]['rows']),6)
    def test_multisource_retained_role_is_not_changed_by_other_source(self):
        r=run('transitions_multi_sources','--require-complete');rows=r['comparisons'][0]['rows'];self.assertEqual(len(rows),3)
        counts=sorted((v['counts']['addedBits'],v['counts']['removedBits'],v['counts']['retainedBits']) for v in rows)
        self.assertEqual(counts,[(0,0,4),(0,4,0),(4,0,0)])
        run('sources_polarity','--require-complete');run('deltas_holes','--require-complete')
    def test_complete_pair_prefix_and_member_admission(self):
        full=run('hierarchy_root','--require-complete')['comparisons'][0]['rows']
        r=run('hierarchy_root','--max-source-hierarchy-matrix-rows','1','--require-complete',code=4);self.assertEqual(r['comparisons'][0]['rows'],full[:1]);self.assertEqual(r['comparisons'][1]['state'],'not_run')
        r=run('hierarchy_root','--max-source-hierarchy-matrix-members','1','--require-complete',code=4);self.assertEqual((r['rows'],r['members']),(0,0));self.assertTrue(r['comparisons'][0]['inputCollected'])
    def test_collection_and_upstream_partial_are_distinct(self):
        for flag in ['input-nodes','input-members','work']:
            r=run('hierarchy_root','--max-source-hierarchy-matrix-'+flag,'1','--require-complete',code=4);self.assertEqual((r['rows'],r['members'],r['inputNodes'],r['inputMembers']),(0,0,0,0));self.assertFalse(r['comparisons'][0]['inputCollected'])
        r=run('hierarchy_root','--max-source-hierarchy-nodes','1','--require-complete',code=4);self.assertFalse(r['comparisons'][0]['inputComplete']);self.assertEqual(len(r['comparisons'][0]['rows']),2);self.assertEqual(sorted(v['counts']['removedBits'] for v in r['comparisons'][0]['rows']),[0,16])
        r=run('hierarchy_root','--max-source-transition-cohorts','1','--require-complete',code=4);self.assertFalse(r['comparisons'][0]['inputComplete']);self.assertTrue(r['comparisons'][0]['rows'])
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertEqual(r['rows'],0);self.assertFalse(r['comparisons'][0]['sourcesComplete'])
    def test_empty_unknown_and_contexts(self):
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['rows'],0)
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
        r=run('hierarchy_root','--require-complete',levels=(0,1,0,1,0,1,0,1));self.assertEqual(len(r['comparisons']),7);self.assertEqual(r['analysis']['queries'],9)
    def test_dependencies_and_errors(self):
        run('hierarchy_root',with_hierarchy=False,code=2);run('hierarchy_root','--max-source-hierarchy-matrix-work','1',matrix=False,code=2)
        self.assertEqual(run('hierarchy_root',matrix=False)['algorithm'],'rtl-register-source-hierarchy-v1')
        for flag,hi in [('rows',100000),('members',2000000),('input-nodes',100000),('input-members',2000000),('work',10000000),('millis',60000)]:
            for v in [0,hi+1]:run('hierarchy_root','--max-source-hierarchy-matrix-'+flag,str(v),code=2)
        run('hierarchy_root','--input-value','hierarchy_root.mode','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-hierarchy-matrix.py'])
