"""Author checks for original control-event dependencies and per-node RTL bit unions."""
import importlib.util
import json
import subprocess
import unittest
from collections import deque
import generation as gen
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_register_generation',ROOT/'tests/register-generation.py')
generation=importlib.util.module_from_spec(spec);spec.loader.exec_module(generation)
resources=[]
for path in [gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
registry=Registry().with_resources(resources)
schema=json.loads((ROOT/'sequential/register-fanout-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=registry)


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not generation.validator.is_valid(r)
    g=generation.verify(r['analysis']);p=g['analysis'];e=p['analysis'];s=e['analysis'];graph=g['graph'];limits=r['limits']
    assert r['snapshotId']==graph['snapshotId'] and r['scope']==graph['scope']
    assert (r['inputOrigins'],r['inputSeeds'],r['inputNodes'])==(g['inputEvents'],len(graph['seeds']),len(graph['nodes']))
    assert [v['event'] for v in r['origins']]==list(range(len(r['origins']))) and len(r['origins'])<=min(len(g['events']),limits['maxOrigins'])
    bycheck={}
    for oi,v in enumerate(r['origins']):
        event=g['events'][v['event']]
        if event['check'] is not None and event['node'] is not None:bycheck.setdefault(event['check'],[]).append(oi)
        if v['seed'] is not None:assert oi in r['seeds'][v['seed']]['origins'] and r['seeds'][v['seed']]['check']==event['check']
    assert r['relevantSeeds']==len(bycheck) and [v['check'] for v in r['seeds']]==sorted(bycheck)[:len(r['seeds'])] and len(r['seeds'])<=limits['maxSeeds']
    for si,seed in enumerate(r['seeds']):
        assert seed['origins']==bycheck[seed['check']] and seed['node']==graph['seeds'][seed['check']]['node']
        assert all(r['origins'][oi]['seed']==si for oi in seed['origins'])
        distances={seed['node']:0};pending=deque([seed['node']])
        while pending:
            ni=pending.popleft();node=graph['nodes'][ni]
            if node['generator'] is None:continue
            v=graph['generators'][node['generator']]
            for child in [v['clockNode'],*v['asyncNodes']]:
                if child is not None and child not in distances:distances[child]=distances[ni]+1;pending.append(child)
        seen=set();depth=[]
        for j,step in enumerate(seed['steps']):
            assert step['node'] not in seen;seen.add(step['node'])
            if step['parent'] is None:
                assert j==0 and step['node']==seed['node'] and step['generator'] is None and step['asyncIndex'] is None and step['role']=='root';depth.append(0)
            else:
                assert step['parent']<j;parent=seed['steps'][step['parent']];v=graph['generators'][step['generator']]
                assert graph['nodes'][parent['node']]['generator']==step['generator']
                assert (v['clockNode'] if step['asyncIndex'] is None else v['asyncNodes'][step['asyncIndex']])==step['node']
                assert step['role']==('clock' if step['asyncIndex'] is None else 'async');depth.append(depth[step['parent']]+1)
            assert depth[-1]==distances[step['node']]
        if seed['traversalComplete']:
            assert seen==set(distances)
            for n in seen:
                node=graph['nodes'][n];assert 'source' in node
                if node['source']['kind']=='generated':assert node['generator'] is not None and graph['generators'][node['generator']]['expanded']
    raw=[s['pages'][f['page']]['response']['result']['items'][f['item']] for f in s['facts']]
    owner={f:gi for gi,v in enumerate(e['groups']) for si in v['signals'] for f in e['signals'][si]['facts']}
    nodes=set()
    for node in r['nodes']:
        assert node['node'] not in nodes;nodes.add(node['node'])
        want=[dict(seed=si,step=pi) for si,v in enumerate(r['seeds']) for pi,step in enumerate(v['steps']) if step['node']==node['node']]
        assert node['reaches']==want
        groups=sorted({g['events'][r['origins'][oi]['event']]['rawGroup'] for reach in want for oi in r['seeds'][reach['seed']]['origins']})
        assert node['rawGroups']==sorted(set(node['rawGroups'])) and set(node['rawGroups'])<=set(groups)
        assigned=set();signals=set()
        for v in node['signals']:
            assert v['signal'] not in signals and v['facts'];signals.add(v['signal'])
            for f in v['facts']:assert f not in assigned and s['facts'][f]['signal']==v['signal'] and owner[f] in node['rawGroups'];assigned.add(f)
            if 'coverage' in v:assert v['coverage']==generation.profile.stats.measure([(raw[f]['bits']['lsb'],raw[f]['bits']['width']) for f in v['facts']])
        ss=node['signals'];done=[v for v in ss if 'coverage' in v]
        assert node['totals']==dict(facts=len(assigned),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for f in assigned),summarizedFacts=sum(len(v['facts']) for v in done),summarizedSignals=len(done),coveredBits=sum(v['coverage']['coveredBits'] for v in done),overlapBits=sum(v['coverage']['overlapBits'] for v in done),maxMultiplicity=max([0,*[v['coverage']['maxMultiplicity'] for v in done]]))
        if node['membersComplete']:assert node['rawGroups']==groups and assigned=={f for f,gi in owner.items() if gi in groups} and len(done)==len(ss)
    assert len(nodes)<=limits['maxNodes'] and r['links']==sum(len(v['steps']) for v in r['seeds'])==sum(len(v['reaches']) for v in r['nodes'])<=limits['maxLinks']
    assert nodes=={step['node'] for v in r['seeds'] for step in v['steps']} and r['work']<=limits['maxWork']
    assert r['memberFacts']==sum(v['totals']['facts'] for v in r['nodes'])<=limits['maxMembers']
    assert r['segmentCount']==sum(len(v['coverage']['segments']) for n in r['nodes'] for v in n['signals'] if 'coverage' in v)<=limits['maxSegments']
    assert r['summary']==dict(origins=len(r['origins']),unassignedOrigins=sum(v['seed'] is None for v in r['origins']),seeds=len(r['seeds']),partialSeeds=sum(not v['traversalComplete'] for v in r['seeds']),nodes=len(r['nodes']),partialNodes=sum(not v['membersComplete'] for v in r['nodes']),links=r['links'],nodeSignals=sum(len(v['signals']) for v in r['nodes']),summarizedNodeSignals=sum(v['totals']['summarizedSignals'] for v in r['nodes']))
    if r['quality']['completeness']=='complete':assert g['quality']['completeness']=='complete' and len(r['origins'])==r['inputOrigins'] and len(r['seeds'])==r['relevantSeeds'] and all(v['traversalComplete'] for v in r['seeds']) and all(v['membersComplete'] for v in r['nodes'])
    return r


def run(top,*extra,scope=None,code=0,fanout=True,generation=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',scope or top+'.u','--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation.sv','register-profile.sv','statistics.sv','register-fanout.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--logic',*(['--register-control-generation'] if generation else []),*(['--register-control-fanout'] if fanout else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=20);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class Fanout(unittest.TestCase):
    def test_multilevel_clock_and_async_paths(self):
        r=run('rg_top','--require-complete');self.assertEqual((len(r['seeds']),len(r['nodes'])),(2,5))
        self.assertTrue(all(v['totals']['coveredBits']==4 for v in r['nodes']))
        self.assertTrue(any(step['role']=='clock' for seed in r['seeds'] for step in seed['steps']))
    def test_shared_upstream_roots_deduplicate_original_state_bits(self):
        r=run('generation_fanout','--require-complete',scope='generation_fanout.sinks')
        shared=[n for n in r['nodes'] if len(n['reaches'])>1]
        self.assertTrue(shared);self.assertTrue(any(n['totals']['coveredBits']==2 for n in shared))
        r=run('fanout_overlap','--require-complete');self.assertEqual(len(r['seeds']),1)
        self.assertTrue(all((n['totals']['facts'],n['totals']['factBits'],n['totals']['coveredBits'],n['totals']['overlapBits'])==(2,13,9,4) for n in r['nodes']))
    def test_same_point_clock_async_origins_count_one_fact(self):
        r=run('fanout_roles','--require-complete',scope='fanout_roles')
        self.assertEqual([v['role'] for v in r['analysis']['events']],['clock','async'])
        self.assertEqual((len(r['origins']),len(r['seeds']),r['nodes'][0]['totals']['coveredBits']),(2,1,1))
    def test_cycles_are_finite_and_unknown_keeps_positive_prefix(self):
        r=run('generation_self','--require-complete',scope='generation_self',code=4)
        self.assertEqual((r['links'],len(r['nodes'])),(1,1));self.assertEqual(r['nodes'][0]['totals']['coveredBits'],1)
        run('generation_unknown','--require-complete',scope='generation_unknown.u',code=4)
    def test_all_admission_caps_and_atomic_coverage(self):
        r=run('fanout_overlap','--max-register-fanout-origins','1','--require-complete',code=4)
        self.assertEqual(r['nodes'][0]['totals']['coveredBits'],6)
        for flag in ['seeds','nodes','links']:
            run('rg_top','--max-register-fanout-'+flag,'1','--require-complete',code=4)
        r=run('fanout_overlap','--max-register-fanout-members','1','--require-complete',code=4);self.assertEqual(r['memberFacts'],1)
        r=run('fanout_overlap','--max-register-fanout-segments','1','--require-complete',code=4);self.assertEqual(r['segmentCount'],0)
        r=run('fanout_overlap','--max-register-fanout-work','1','--require-complete',code=4);self.assertEqual(r['nodes'],[])
    def test_input_mapping_prefix_empty_and_parameter_instances(self):
        r=run('rg_top','--max-register-generation-events','1','--require-complete',code=4);self.assertEqual(len(r['origins']),1)
        self.assertEqual(run('empty',scope='empty')['nodes'],[])
        run('stats_top','--require-complete',scope='stats_top')
    def test_flag_dependencies_and_budget_boundaries(self):
        run('rg_top',generation=False,code=2)
        for flag in ['--register-resolved-events','--compare-register-scenarios','--compare-register-generation','--source-inventory']:run('rg_top',flag,code=2)
        run('rg_top','--max-register-fanout-work','1',fanout=False,code=2)
        for flag,high in [('origins',1000000),('seeds',10000),('nodes',10000),('links',1000000),('members',1000000),('segments',2000000),('work',10000000),('millis',60000)]:
            for v in [0,high+1]:run('rg_top','--max-register-fanout-'+flag,str(v),code=2)


if __name__=='__main__':unittest.main(argv=['register-fanout.py'])
