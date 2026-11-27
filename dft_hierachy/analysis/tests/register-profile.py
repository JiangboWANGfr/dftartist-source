"""Author semantic checks for register control sources and source-local bit unions."""
import importlib.util
import json
import subprocess
import unittest
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_events',ROOT/'tests/event-groups.py')
events=importlib.util.module_from_spec(spec);spec.loader.exec_module(events)
stats=events.stats
schema=json.loads((ROOT/'sequential/register-control-profile-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=events.registry.with_resource(schema['$id'],Resource.from_contents(schema)))


def source_key(s):return json.dumps(s,sort_keys=True)
def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not events.validator.is_valid(r) and not stats.validator.is_valid(r) and all(not v.is_valid(r) for v in stats.old_validators)
    a=events.verify(r['analysis']);b=a['analysis'];o=r['options']
    assert r['snapshotId']==a['snapshotId'] and r['scope']==a['scope']
    assert len(r['checks'])<=o['maxChecks'] and r['work']<=o['maxWork'] and r['attributedFacts']<=o['maxMembers']
    assert r['traceNodes']==sum(len(c['control'].get('trace',{}).get('result',{}).get('nodes',[])) for c in r['checks'])<=o['maxTraceNodes']
    assert r['traceEdges']==sum(len(c['control'].get('trace',{}).get('result',{}).get('edges',[])) for c in r['checks'])<=o['maxTraceEdges']
    points=[json.dumps(c['control']['point']['slice'],sort_keys=True) for c in r['checks']];assert len(points)==len(set(points))
    visited=0
    for i,row in enumerate(r['groupControls']):
        assert row['group']==i;g=a['groups'][i]
        assert len(row['asyncChecks'])==len(g['async'])
        refs=[row['clockCheck'],*row['asyncChecks']]
        for ci,event in zip(refs,[g['clock'],*g['async']]):
            if ci is None:continue
            visited+=1;c=r['checks'][ci]['control'];assert c['point']['slice']==dict(ref=event['signal'],bits=event['bits'])
        assert row['eventsComplete']==all(ci is not None for ci in refs)
        if row['cohort'] is not None:
            assert row['clockCheck'] is not None
            c=r['cohorts'][row['cohort']];assert c['source']==r['checks'][row['clockCheck']]['source'] and c['edge']==g['clock']['edge']
            assert i in c['groups']
    assert r['processedGroups']==sum(x['eventsComplete'] for x in r['groupControls']) and r['visitedEvents']==visited
    raw=[b['pages'][f['page']]['response']['result']['items'][f['item']] for f in b['facts']]
    owners={f:gi for gi,g in enumerate(a['groups']) for si in g['signals'] for f in a['signals'][si]['facts']}
    assigned=set();pairs=set()
    for si,s in enumerate(r['signals']):
        assert (s['cohort'],s['signal']) not in pairs;pairs.add((s['cohort'],s['signal']))
        assert si in r['cohorts'][s['cohort']]['signals'] and s['facts']
        for f in s['facts']:
            assert f not in assigned;assigned.add(f)
            assert b['facts'][f]['signal']==s['signal'] and r['groupControls'][owners[f]]['cohort']==s['cohort']
        if 'coverage' in s:assert s['coverage']==stats.measure([(raw[f]['bits']['lsb'],raw[f]['bits']['width']) for f in s['facts']])
    assert len(assigned)==r['attributedFacts']
    keys=set()
    for ci,c in enumerate(r['cohorts']):
        key=(source_key(c['source']),c['edge']);assert key not in keys;keys.add(key)
        assert c['groups']==[x['group'] for x in r['groupControls'] if x['cohort']==ci]
        ss=[r['signals'][i] for i in c['signals']];assert all(s['cohort']==ci for s in ss)
        completed=[s for s in ss if 'coverage' in s]
        assert c['totals']==dict(facts=sum(len(s['facts']) for s in ss),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for s in ss for f in s['facts']),summarizedFacts=sum(len(s['facts']) for s in completed),summarizedSignals=len(completed),coveredBits=sum(s['coverage']['coveredBits'] for s in completed),overlapBits=sum(s['coverage']['overlapBits'] for s in completed),maxMultiplicity=max([0,*[s['coverage']['maxMultiplicity'] for s in completed]]))
    assert r['segmentCount']==sum(len(s['coverage']['segments']) for s in r['signals'] if 'coverage' in s)<=o['maxSegments']
    assert r['summary']==dict(inputGroups=len(a['groups']),processedGroups=r['processedGroups'],checks=len(r['checks']),unresolvedChecks=sum('source' not in c for c in r['checks']),cohorts=len(r['cohorts']),attributedFacts=r['attributedFacts'],cohortSignals=len(r['signals']),summarizedCohortSignals=sum('coverage' in s for s in r['signals']),cohortCoveredBits=sum(c['totals']['coveredBits'] for c in r['cohorts']))
    if r['quality']['completeness']=='complete':
        assert a['quality']['completeness']=='complete' and r['processedGroups']==len(a['groups'])
        assert all('source' in c for c in r['checks']) and r['attributedFacts']==a['processedFacts'] and all('coverage' in s for s in r['signals'])
    return r


def run(top,*extra,code=0,profile=True,grouped=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',top,*(str(ROOT/'tests'/n) for n in ['design.sv','statistics.sv','event-groups.sv','register-profile.sv']),'--register-statistics',*(['--register-event-groups'] if grouped else []),*(['--register-control-profile'] if profile else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class Profile(unittest.TestCase):
    def test_aliases_union_same_root_across_async_groups(self):
        r=run('profile_alias','--logic','--require-complete')
        self.assertEqual((r['analysis']['summary']['groupCoveredBits'],r['summary']['cohortCoveredBits']),(6,4))
        self.assertEqual((len(r['cohorts']),r['cohorts'][0]['totals']['overlapBits']),(1,2))
        self.assertEqual(r['cohorts'][0]['source']['kind'],'primary_input')

    def test_structural_mode_stops_at_alias_process(self):
        r=run('profile_alias','--require-complete',code=4)
        self.assertEqual(r['cohorts'],[]);self.assertEqual(r['summary']['unresolvedChecks'],2)

    def test_shared_check_different_async_groups(self):
        r=run('profile_resets','--max-checks','3','--require-complete')
        self.assertEqual((r['visitedEvents'],len(r['checks']),len(r['cohorts'])),(4,3,1))

    def test_edge_and_polarity_do_not_merge(self):
        r=run('events_cross','--require-complete');self.assertEqual(len(r['cohorts']),2)
        self.assertEqual({c['edge'] for c in r['cohorts']},{'posedge','negedge'})
        r=run('profile_invert','--logic','--require-complete');self.assertEqual(len(r['cohorts']),2)
        self.assertEqual({c['source']['inverted'] for c in r['cohorts']},{False,True})

    def test_parameter_occurrences_share_root_not_state_bits(self):
        r=run('stats_top','--recursive','--require-complete');self.assertEqual((len(r['cohorts']),r['summary']['cohortCoveredBits'],len(r['signals'])),(1,11,3))

    def test_generated_constant_undriven_are_kinds_not_findings(self):
        r=run('profile_derived','--logic','--require-complete');self.assertEqual({c['source']['kind'] for c in r['cohorts']},{'primary_input','generated'})
        for top,kind in [('profile_constant','constant'),('profile_undriven','undriven')]:
            r=run(top,'--logic','--require-complete','--fail-on-error');self.assertEqual(r['cohorts'][0]['source']['kind'],kind)

    def test_unknown_and_gate_do_not_acquire_clock_cohorts(self):
        r=run('profile_modes','--logic','--require-complete',code=4);self.assertEqual(r['cohorts'],[])
        r=run('profile_gate','--logic','--clock-root','profile_gate.clk','0','--require-complete',code=4)
        self.assertEqual(r['checks'][0]['control']['verdict'],'gated');self.assertEqual(r['cohorts'],[])
        r=run('profile_gate','--logic','--clock-root','profile_gate.clk','0','--input-value','profile_gate.en','0','1','--require-complete')
        self.assertEqual(r['cohorts'][0]['source']['point'],r['clockRoots'][0]['point'])

    def test_context_zero_one_zero(self):
        sources=[]
        for bit in [0,1,0]:
            r=run('profile_modes','--logic','--input-value','profile_modes.sel','0',str(bit),'--require-complete')
            sources.append(source_key(r['cohorts'][0]['source']).replace(r['snapshotId'],'<snapshot>'))
        self.assertEqual(sources[0],sources[2]);self.assertNotEqual(sources[0],sources[1])

    def test_pagination_and_check_capacity(self):
        r=run('stats_many','--max-checks','1','--require-complete')
        self.assertEqual((r['attributedFacts'],r['summary']['cohortCoveredBits'],len(r['analysis']['analysis']['pages'])),(230,230,2))

    def test_source_membership_and_atomic_coverage_limits(self):
        r=run('profile_alias','--logic','--max-register-control-members','1','--require-complete',code=4);self.assertEqual(r['attributedFacts'],1)
        r=run('profile_alias','--logic','--max-register-control-segments','1','--require-complete',code=4)
        self.assertEqual(r['summary']['cohortCoveredBits'],0);self.assertTrue(all('coverage' not in s for s in r['signals']))
        for flag in ['--max-checks','--max-register-control-work','--max-trace-nodes']:
            r=run('profile_alias','--logic',flag,'1','--require-complete',code=4);self.assertEqual(r['quality']['completeness'],'partial')

    def test_input_partial_empty_and_blackbox(self):
        r=run('profile_alias','--max-event-group-members','1','--require-complete',code=4);self.assertIn('event_groups_incomplete',r['quality']['reasons'])
        r=run('profile_alias','--max-statistics-facts','1','--require-complete',code=4);self.assertIn('event_groups_incomplete',r['quality']['reasons'])
        self.assertEqual(run('empty','--require-complete')['cohorts'],[])
        self.assertEqual(run('with_blackbox','--recursive','--require-complete',code=4)['quality']['completeness'],'partial')

    def test_modes_contexts_and_budget_boundaries(self):
        run('profile_alias','--logic',profile=False,grouped=False,code=2)
        run('profile_alias',grouped=False,code=2)
        run('profile_alias','--source-inventory',code=2)
        run('profile_alias','--scenario','A','--logic',code=2)
        run('profile_alias','--clock-root','profile_alias.clk','0',code=2)
        run('profile_alias','--max-register-control-work','1',profile=False,code=2)
        for flag,limit in [('--max-register-control-work',10000000),('--max-register-control-members',1000000),('--max-register-control-segments',2000000),('--max-checks',10000),('--max-trace-nodes',1000000),('--max-millis',60000)]:
            for value in [0,limit+1]:run('profile_alias',flag,str(value),code=2)
        run('profile_alias','--logic','--clock-root','profile_alias.d','4',code=2)
        run('profile_alias','--logic','--input-value','profile_alias.r0','0','1','--input-value','profile_alias.r0','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['register-profile.py'])
