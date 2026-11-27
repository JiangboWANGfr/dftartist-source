"""Author RTL expectations for deep structural change and original state-bit impact."""
import importlib.util
import json
import subprocess
import unittest
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tests'/file);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
direct=module('author_register_scenarios','register-scenarios.py')
generation=module('author_register_generation','register-generation.py')
schema=json.loads((ROOT/'sequential/register-generation-scenarios-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=direct.registry.with_resource(generation.schema['$id'],Resource.from_contents(generation.schema)).with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)
def packed(v):return json.dumps(v,sort_keys=True)


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not direct.validator.is_valid(r) and not generation.validator.is_valid(r)
    a=direct.verify(r['analysis']);s=a['analysis']['analysis'];graphs={};profiles={}
    for i,v in enumerate(r['scenarios']):
        assert v['scenario']==i and v['name']==a['scenarios'][i]['name']
        if 'generation' in v:
            assert 'analysis' not in v['generation']
            p=dict(a['scenarios'][i]['profile'],analysis=a['analysis']);profiles[i]=p
            g=generation.verify(dict(v['generation'],analysis=p));graphs[i]=g['graph']
            assert v['status']==('complete' if g['quality']['completeness']=='complete' else 'partial')
        else:assert v['status']=='not_run' and v['reasons']
    c=r['structure'];assert 'analysis' not in c and c['snapshotId']==a['snapshotId'] and c['scope']==a['scope']
    contexts={x['scenario']:x['cones'] for x in c['contexts']};assert list(contexts)==list(graphs)
    assert c['inputCones']==sum(len(profiles[i]['checks']) for i in graphs)
    assert c['processedCones']==sum(len(cs) for cs in contexts.values())<=c['limits']['maxCones']
    assert c['memberEntries']==sum(len(v['nodes']) for cs in contexts.values() for v in cs)<=c['limits']['maxMembers'] and c['work']<=c['limits']['maxWork']
    def signature(g,cone):return sorted(packed([g['nodes'][n]['point'],g['nodes'][n]['source'],None if g['nodes'][n]['generator'] is None else g['generators'][g['nodes'][n]['generator']]['fact']]) for n in cone['nodes'])
    for i,cones in contexts.items():
        g=graphs[i]
        for ci,cone in enumerate(cones):
            assert cone['check']==ci and cone['node']==(g['seeds'][ci]['node'] if ci<len(g['seeds']) else None)
            assert len(cone['nodes'])==len(set(cone['nodes'])) and all(n<len(g['nodes']) for n in cone['nodes'])
            if cone['quality']['completeness']=='complete':
                seen=set();pending=[cone['node']]
                while pending:
                    n=pending.pop()
                    if n in seen:continue
                    seen.add(n);node=g['nodes'][n];assert 'source' in node and not node['reasons']
                    if node['source']['kind']=='generated':
                        parent=g['generators'][node['generator']];assert parent['expanded'];pending.extend([parent['clockNode'],*parent['asyncNodes']])
                assert seen==set(cone['nodes'])
    counts=dict(contexts=len(contexts),cones=c['processedCones'],members=c['memberEntries'],rows=0,changed=0,unchanged=0,unresolved=0)
    for i,comparison in enumerate(c['comparisons'],1):
        assert comparison['scenario']==i
        for row in comparison['controls']:
            counts['rows']+=1;counts[row['status']]+=1;selected=[]
            for si,field in [(0,'baselineCone'),(i,'scenarioCone')]:
                n=row[field];cone=contexts[si][n] if n is not None else None;selected.append(cone)
                if cone is not None:assert profiles[si]['checks'][cone['check']]['control']['point']==row['point']
            if any(v is None or v['quality']['completeness']=='partial' for v in selected):assert row['status']=='unresolved'
            else:assert (row['status']=='unchanged')==(signature(graphs[0],selected[0])==signature(graphs[i],selected[1]))
    assert counts==c['summary'] and counts['rows']<=c['limits']['maxRows']
    raw=[s['pages'][f['page']]['response']['result']['items'][f['item']] for f in s['facts']]
    owners={f:gi for gi,g in enumerate(a['analysis']['groups']) for si in g['signals'] for f in a['analysis']['signals'][si]['facts']}
    allrows=[]
    for i,impact in enumerate(r['impacts'],1):
        assert impact['baseline']==0 and impact['scenario']==i and impact['inputGroups']==len(a['analysis']['groups'])
        structure=c['comparisons'][i-1]['controls'];lookup={packed(v['point']):j for j,v in enumerate(structure)};offset=0
        for gi,row in enumerate(impact['rows']):
            assert row['rawGroup']==gi;want=[]
            for e in range(1+len(a['analysis']['groups'][gi]['async'])):
                found=None
                if all(si in graphs and offset+e<len(r['scenarios'][si]['generation']['events']) for si in [0,i]):
                    x,y=[r['scenarios'][si]['generation']['events'][offset+e] for si in [0,i]]
                    if all(v['node'] is not None and v['check'] is not None for v in [x,y]):
                        px=profiles[0]['checks'][x['check']]['control']['point'];py=profiles[i]['checks'][y['check']]['control']['point']
                        if px==py:found=lookup.get(packed(px))
                want.append(found)
            assert row['events']==want;offset+=len(want)
            expected='unresolved' if any(n is None or structure[n]['status']=='unresolved' for n in want) else 'changed' if any(structure[n]['status']=='changed' for n in want) else 'unchanged'
            assert row['status']==expected;allrows.append(row)
        assigned=set();signals=set();changed={v['rawGroup'] for v in impact['rows'] if v['status']=='changed'}
        for v in impact['changedSignals']:
            assert v['signal'] not in signals and v['facts'];signals.add(v['signal'])
            for f in v['facts']:assert f not in assigned and s['facts'][f]['signal']==v['signal'] and owners[f] in changed;assigned.add(f)
            if 'coverage' in v:assert v['coverage']==direct.stats.measure([(raw[f]['bits']['lsb'],raw[f]['bits']['width']) for f in v['facts']])
        ss=impact['changedSignals'];done=[v for v in ss if 'coverage' in v]
        assert impact['changedTotals']==dict(facts=len(assigned),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for f in assigned),summarizedFacts=sum(len(v['facts']) for v in done),summarizedSignals=len(done),coveredBits=sum(v['coverage']['coveredBits'] for v in done),overlapBits=sum(v['coverage']['overlapBits'] for v in done),maxMultiplicity=max([0,*[v['coverage']['maxMultiplicity'] for v in done]]))
        if impact['quality']['completeness']=='complete':assert len(impact['rows'])==impact['inputGroups'] and assigned=={f for f,g in owners.items() if g in changed} and len(done)==len(ss)
    limits=r['limits'];assert r['rows']==len(allrows)<=limits['maxRows'] and r['eventEntries']==sum(len(v['events']) for v in allrows)<=limits['maxEvents'] and r['work']<=limits['maxWork']
    assert r['memberFacts']==sum(v['changedTotals']['facts'] for v in r['impacts'])<=limits['maxMembers']
    assert r['segmentCount']==sum(len(v['coverage']['segments']) for c in r['impacts'] for v in c['changedSignals'] if 'coverage' in v)<=limits['maxSegments']
    assert r['summary']==dict(scenarios=len(r['scenarios']),notRun=sum(v['status']=='not_run' for v in r['scenarios']),comparisons=len(r['impacts']),rows=len(allrows),changed=sum(v['status']=='changed' for v in allrows),unchanged=sum(v['status']=='unchanged' for v in allrows),unresolved=sum(v['status']=='unresolved' for v in allrows))
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and c['quality']['completeness']=='complete' and all(v['status']=='complete' for v in r['scenarios']) and all(v['quality']['completeness']=='complete' for v in r['impacts'])
    return r


def run(top,*extra,values=(0,1,0),scope=None,code=0,deep=True,source=True):
    args=[]
    for i,v in enumerate(values):
        args+=['--scenario','MODE'+str(i)]
        if v is not None:args+=['--input-value',top+'.sel','0',str(v)]
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',scope or top+'.u','--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','statistics.sv','generation.sv','register-generation-scenarios.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic',*(['--compare-register-scenarios'] if source else []),*(['--compare-register-generation'] if deep else []),*extra,*args]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=20);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class Deep(unittest.TestCase):
    def test_same_direct_source_but_changed_upstream_and_back(self):
        r=run('deep_top','--require-complete');self.assertEqual(r['analysis']['comparisons'][0]['rows'][0]['status'],'unchanged')
        self.assertEqual([v['rows'][0]['status'] for v in r['impacts']],['changed','unchanged']);self.assertEqual(r['impacts'][0]['changedTotals']['coveredBits'],4)
    def test_generated_async_and_polarity_changes(self):
        for top in ['deep_reset','deep_invert']:
            r=run(top,'--require-complete');self.assertEqual(r['analysis']['comparisons'][0]['rows'][0]['status'],'unchanged');self.assertEqual(r['impacts'][0]['changedTotals']['coveredBits'],4)
    def test_overlapping_changed_groups_union_original_state_bits(self):
        r=run('deep_overlap','--require-complete');t=r['impacts'][0]['changedTotals'];self.assertEqual((t['facts'],t['factBits'],t['coveredBits'],t['overlapBits']),(2,6,4,2))
    def test_unknown_and_cycles_remain_unresolved_with_local_proofs(self):
        r=run('deep_local','--require-complete',values=(0,None,0),code=4);self.assertEqual({v['status'] for v in r['impacts'][0]['rows']},{'unresolved','unchanged'})
        self.assertTrue(all(v['status']=='unchanged' for v in r['impacts'][1]['rows']))
        r=run('generation_self','--require-complete',values=(None,None),scope='generation_self',code=4);self.assertEqual(r['impacts'][0]['rows'][0]['status'],'unresolved')
    def test_impact_rows_events_work_members_segments_and_parent_partial(self):
        r=run('deep_top','--max-register-impact-events','1','--require-complete',code=4);self.assertEqual((r['rows'],r['eventEntries']),(0,0))
        r=run('deep_overlap','--max-register-impact-rows','1','--require-complete',code=4);self.assertEqual(r['rows'],1)
        r=run('deep_overlap','--max-register-impact-members','1','--require-complete',code=4);self.assertEqual(r['impacts'][0]['changedTotals']['coveredBits'],3)
        r=run('deep_overlap','--max-register-impact-segments','1','--require-complete',code=4);self.assertEqual(r['impacts'][0]['changedTotals']['coveredBits'],0)
        run('deep_top','--max-register-impact-work','1','--require-complete',code=4)
        r=run('deep_overlap','--max-resolved-event-rows','1','--require-complete',code=4);self.assertEqual(r['impacts'][0]['changedTotals']['coveredBits'],4)
    def test_cone_and_generation_mapping_prefixes_cannot_prove_unchanged(self):
        for flag in ['--max-generation-comparison-cones','--max-generation-comparison-work','--max-generation-controls','--max-register-generation-events']:
            r=run('deep_top',flag,'1','--require-complete',code=4);self.assertEqual(r['impacts'][0]['rows'][0]['status'],'unresolved')
        run('deep_top','--max-generation-depth','0','--require-complete',code=4)
    def test_empty_parameter_instances_and_policy(self):
        self.assertEqual(run('empty',scope='empty',values=(None,None))['impacts'][0]['rows'],[])
        r=run('stats_top',scope='stats_top',values=(None,None));self.assertEqual(r['summary']['changed'],0)
        run('deep_top','--require-complete','--fail-on-error')
    def test_modes_names_and_budget_boundaries(self):
        run('deep_top',source=False,code=2)
        for flag in ['--register-control-generation','--control-generation','--source-inventory']:run('deep_top',flag,code=2)
        run('deep_top','--max-register-impact-rows','1',deep=False,code=2)
        for suffix,high in [('rows',100000),('events',1000000),('work',10000000),('members',1000000),('segments',2000000),('millis',60000)]:
            for v in [0,high+1]:run('deep_top','--max-register-impact-'+suffix,str(v),code=2)


if __name__=='__main__':unittest.main(argv=['register-generation-scenarios.py'])
