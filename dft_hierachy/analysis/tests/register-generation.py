"""Author checks for register-profile inputs to the shared generation graph."""
import importlib.util
import json
import subprocess
import unittest
import generation as gen
from jsonschema import Draft202012Validator
from referencing import Resource
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_profile',ROOT/'tests/register-profile.py')
profile=importlib.util.module_from_spec(spec);spec.loader.exec_module(profile)
schema=json.loads((ROOT/'sequential/register-generation-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=profile.events.registry.with_resource(profile.schema['$id'],Resource.from_contents(profile.schema)).with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not profile.validator.is_valid(r) and not gen.validator.is_valid(r)
    p=profile.verify(r['analysis']);g=r['graph'];limits=r['limits']['generation']
    assert g['scenario'] is None and g['scope']==p['scope'] and g['snapshotId']==p['snapshotId']
    assert g['inputChecks']==len(p['checks']) and g['work']<=limits['maxWork']
    assert g['registerFacts']==sum(len(v['response']['result']['items']) for v in g['registerPages'])<=limits['maxRegisterFacts']
    assert len(g['nodes'])<=limits['maxControls'] and len(g['generators'])<=limits['maxGenerators'] and len(g['cycles'])<=limits['maxCycles']
    assert [v['check'] for v in g['seeds']]==list(range(len(g['seeds'])))
    points=set();refs=set()
    for n in g['nodes']:
        key=json.dumps(n['point'],sort_keys=True);assert key not in points;points.add(key)
        c=p['checks'][n['originalCheck']]['control'] if n['originalCheck'] is not None else n['control']
        assert c['point']==n['point'] and c['path']==n['path']
        if n['generator'] is not None:assert n['source']['kind']=='generated' and n['source']['sourceRef']==g['generators'][n['generator']]['fact']['ref']
    for seed in g['seeds']:assert g['nodes'][seed['node']]['originalCheck']==seed['check']
    for v in g['generators']:
        assert v['fact']['ref'] not in refs;refs.add(v['fact']['ref']);page=g['registerPages'][v['lookup']['page']]
        assert page['instance']==v['fact']['inst'] and page['response']['result']['items'][v['lookup']['item']]==v['fact']
        assert len(v['asyncNodes'])<=len(v['fact']['async'])
        for ni,e in [(v['clockNode'],v['fact']['clock']),*zip(v['asyncNodes'],v['fact']['async'])]:
            if ni is not None:assert g['nodes'][ni]['point']['slice']==dict(ref=e['signal'],bits=e['bits'])
        if v['expanded']:assert v['clockNode'] is not None and len(v['asyncNodes'])==len(v['fact']['async']) and all(n is not None for n in v['asyncNodes'])
    for cycle in g['cycles']:
        path=cycle['generators'];assert path[0]==path[-1] and len(path)==len(cycle['controls'])+1
        for fr,to,n in zip(path,path[1:],cycle['controls']):
            parent=g['generators'][fr];assert (n==parent['clockNode'] or n in parent['asyncNodes']) and g['nodes'][n]['generator']==to
    for field,limit,member in [('traceNodes','maxTraceNodes','nodes'),('traceEdges','maxTraceEdges','edges')]:
        assert g[field]==sum(len(n['control'].get('trace',{}).get('result',{}).get(member,[])) for n in g['nodes'] if 'control' in n)<=limits[limit]
    assert g['logicWork']==sum(n['control'].get('logic',{}).get('work',0) for n in g['nodes'] if 'control' in n)<=limits['maxLogicWork']
    expected=[];seeds={s['check']:s['node'] for s in g['seeds']}
    for gi,group in enumerate(p['analysis']['groups']):
        for ei in range(1+len(group['async'])):
            row=p['groupControls'][gi] if gi<len(p['groupControls']) else None
            check=(row['asyncChecks'][ei-1] if ei else row['clockCheck']) if row else None
            expected.append(dict(rawGroup=gi,role='async' if ei else 'clock',asyncIndex=ei-1 if ei else None,check=check,node=seeds.get(check)))
    assert r['inputEvents']==len(expected) and len(r['events'])<=r['limits']['maxEvents']
    assert r['work']==len(r['events'])<=r['limits']['maxWork']
    for actual,want in zip(r['events'],expected):
        assert {k:actual[k] for k in want}==want
        if actual['node'] is None:assert actual['reasons']
    mapped=sum(v['node'] is not None for v in r['events'])
    assert r['mappingComplete']==(len(r['events'])==len(expected) and mapped==len(expected))
    assert r['summary']==dict(inputEvents=len(expected),eventRows=len(r['events']),mappedEvents=mapped,unmappedEvents=len(r['events'])-mapped,nodes=len(g['nodes']),generators=len(g['generators']),cycles=len(g['cycles']))
    assert (r['quality']['completeness']=='complete')==(p['quality']['completeness']=='complete' and g['quality']['completeness']=='complete' and r['mappingComplete'])
    return r


def run(top,*extra,scope=None,code=0,logic=True,new=True,flags=None):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,*(str(ROOT/'tests'/n) for n in ['design.sv','logic.sv','gates.sv','values.sv','statistics.sv','register-profile.sv','generation.sv','register-generation.sv']),*(flags if flags is not None else ['--register-statistics','--register-event-groups','--register-control-profile']),*(['--register-control-generation'] if new else []),*(['--logic'] if logic else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class RegisterGeneration(unittest.TestCase):
    def test_multilevel_clock_and_generated_reset_outside_scope(self):
        r=run('rg_top',scope='rg_top.u');self.assertEqual(len(r['graph']['generators']),3)
        self.assertEqual({v['signalPath'] for v in r['graph']['generators']},{'rg_top.first','rg_top.second','rg_top.reset_q'})
        self.assertEqual([v['role'] for v in r['events']],['clock','async'])
        self.assertEqual((r['graph']['registerFacts'],len(r['graph']['registerPages'])),(3,1))

    def test_original_chain_and_shared_generator(self):
        r=run('generation_chain',scope='generation_chain.u');self.assertEqual(len(r['graph']['generators']),2)
        r=run('generation_fanout','--recursive',scope='generation_fanout.sinks')
        self.assertEqual(len(r['graph']['generators']),1)
        r=run('generation_shared','--recursive',scope='generation_shared.sinks')
        self.assertEqual([v['fact']['bits']['lsb'] for v in r['graph']['generators']],[0,1])

    def test_ordered_mapping_and_budget_prefix(self):
        r=run('rg_top','--max-register-generation-events','1','--require-complete',scope='rg_top.u',code=4)
        self.assertEqual((r['mappingComplete'],len(r['events']),r['graph']['quality']['completeness']),(False,1,'complete'))
        self.assertEqual(r['events'][0]['role'],'clock')
        r=run('rg_top','--max-generation-controls','1','--require-complete',scope='rg_top.u',code=4)
        self.assertEqual([v['node'] is not None for v in r['events']],[True,False])
        for flag in ['--max-register-generation-work','--max-generation-work','--max-generation-generators','--max-generation-facts']:
            run('rg_top',flag,'1','--require-complete',scope='rg_top.u',code=4)
        run('rg_top','--max-generation-depth','0','--require-complete',scope='rg_top.u',code=4)

    def test_cycle_witnesses_unknown_and_partial_profile(self):
        r=run('generation_cycles','--require-complete',code=4);self.assertEqual(len(r['graph']['cycles']),2)
        r=run('generation_unknown','--recursive','--require-complete',code=4);self.assertIn('generation_incomplete',r['quality']['reasons'])
        r=run('rg_top','--max-checks','1','--require-complete',scope='rg_top.u',code=4)
        self.assertEqual([v['check'] is not None for v in r['events']],[True,False])

    def test_context_zero_one_zero_has_no_cache_leak(self):
        graphs=[]
        for v in [0,1,0]:
            r=run('generation_mode','--input-value','generation_mode.sel','0',str(v),scope='generation_mode.u')
            graphs.append({g['signalPath'] for g in r['graph']['generators']})
        self.assertEqual(graphs[0],graphs[2]);self.assertNotEqual(graphs[0],graphs[1])

    def test_pagination_parameter_instances_empty_and_unmodeled(self):
        r=run('generation_paged','--recursive',scope='generation_paged.sinks');self.assertEqual(len(r['graph']['registerPages']),2)
        r=run('stats_top','--recursive');self.assertEqual(r['analysis']['analysis']['analysis']['totals']['coveredBits'],11)
        self.assertEqual(run('empty')['events'],[])
        run('with_blackbox','--recursive','--require-complete',code=4)

    def test_mode_dependencies_and_all_budget_bounds(self):
        run('rg_top',logic=False,code=2)
        run('rg_top',flags=['--register-statistics','--register-event-groups'],code=2)
        for flag in ['--register-resolved-events','--compare-register-scenarios','--control-generation','--source-inventory']:
            run('rg_top',flag,code=2)
        run('rg_top','--max-register-generation-events','1',new=False,code=2)
        for flag,high in [('--max-register-generation-events',1000000),('--max-register-generation-work',10000000),('--max-register-generation-millis',60000),('--max-generation-controls',10000),('--max-generation-millis',60000)]:
            for v in [0,high+1]:run('rg_top',flag,str(v),code=2)


if __name__=='__main__':unittest.main(argv=['register-generation.py'])
