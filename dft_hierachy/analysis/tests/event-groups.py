"""Author RTL event tuple grouping and cross-group bit attribution expectations."""
import json
import subprocess
import unittest
import importlib.util
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_statistics',ROOT/'tests/statistics.py')
stats=importlib.util.module_from_spec(spec);spec.loader.exec_module(stats)
schema=json.loads((ROOT/'sequential/register-event-groups-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=stats.registry.with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)


def event_key(e):return (e['signal'],e['bits']['lsb'],e['bits']['width'],e['edge'],e.get('type',''))
def signature(clock,asyncs):return (event_key(clock),tuple(event_key(e) for e in asyncs))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not stats.validator.is_valid(r) and all(not v.is_valid(r) for v in stats.old_validators)
    a=stats.verify(r['analysis'])
    assert r['snapshotId']==a['snapshot']['snapshotId'] and r['scope']==a['scope']
    assert r['inputFacts']==len(a['facts']) and r['inputSignals']==len(a['signals'])
    assert r['processedFacts']<=min(r['inputFacts'],r['limits']['maxMembers']) and len(r['groups'])<=r['limits']['maxGroups']
    assert r['work']<=r['limits']['maxWork']
    raw=[a['pages'][f['page']]['response']['result']['items'][f['item']] for f in a['facts']]
    assigned={};keys=set();pairs=set()
    for si,s in enumerate(r['signals']):
        assert (s['group'],s['signal']) not in pairs;pairs.add((s['group'],s['signal']))
        assert si in r['groups'][s['group']]['signals'] and s['facts']
        ranges=[]
        for f in s['facts']:
            assert f not in assigned and a['facts'][f]['signal']==s['signal'];assigned[f]=s['group']
            g=r['groups'][s['group']];assert signature(g['clock'],g['async'])==signature(raw[f]['clock'],raw[f]['async'])
            b=raw[f]['bits'];ranges.append((b['lsb'],b['width']))
        if 'coverage' in s:assert s['coverage']==stats.measure(ranges)
    assert sorted(assigned)==list(range(r['processedFacts']))
    for gi,g in enumerate(r['groups']):
        ss=[r['signals'][i] for i in g['signals']];assert all(s['group']==gi for s in ss)
        assert len(set(g['signals']))==len(g['signals'])
        if g['identityComplete']:
            key=signature(g['clock'],g['async']);assert key not in keys;keys.add(key)
        else:assert sum(len(s['facts']) for s in ss)==1
        completed=[s for s in ss if 'coverage' in s]
        assert g['totals']==dict(facts=sum(len(s['facts']) for s in ss),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for s in ss for f in s['facts']),summarizedFacts=sum(len(s['facts']) for s in completed),summarizedSignals=len(completed),coveredBits=sum(s['coverage']['coveredBits'] for s in completed),overlapBits=sum(s['coverage']['overlapBits'] for s in completed),maxMultiplicity=max([0,*[s['coverage']['maxMultiplicity'] for s in completed]]))
    last=-1
    for item in r['attributions']:
        assert item['signal']>last;last=item['signal']
        indices=a['signals'][item['signal']]['facts'];assert all(f in assigned and r['groups'][assigned[f]]['identityComplete'] for f in indices)
        groups=sorted({assigned[f] for f in indices});assert item['groups']==groups and len(groups)>1
        boundaries=sorted({v for f in indices for v in [raw[f]['bits']['lsb'],sum(raw[f]['bits'].values())]})
        segments=[]
        for begin,end in zip(boundaries,boundaries[1:]):
            active=sorted({assigned[f] for f in indices if raw[f]['bits']['lsb']<=begin<sum(raw[f]['bits'].values())})
            if len(active)<2:continue
            if segments and sum(segments[-1]['bits'].values())==begin and segments[-1]['groups']==active:segments[-1]['bits']['width']+=end-begin
            else:segments.append(dict(bits=dict(lsb=begin,width=end-begin),groups=active))
        assert item['segments']==segments and item['crossGroupBits']==sum(s['bits']['width'] for s in segments)
    assert r['crossGroupBits']==sum(x['crossGroupBits'] for x in r['attributions'])
    assert r['overlapMembers']==sum(len(s['groups']) for x in r['attributions'] for s in x['segments'])<=r['limits']['maxOverlapMembers']
    assert r['segmentCount']==sum(len(s['coverage']['segments']) for s in r['signals'] if 'coverage' in s)+sum(len(x['segments']) for x in r['attributions'])<=r['limits']['maxSegments']
    eligible=sum(all(f in assigned and r['groups'][assigned[f]]['identityComplete'] for f in s['facts']) for s in a['signals'])
    assert len(r['attributions'])<=r['checkedSignals']<=eligible
    assert r['summary']==dict(groups=len(r['groups']),unresolvedGroups=sum(not g['identityComplete'] for g in r['groups']),members=r['processedFacts'],groupSignals=len(r['signals']),summarizedGroupSignals=sum('coverage' in s for s in r['signals']),groupCoveredBits=sum(g['totals']['coveredBits'] for g in r['groups']),crossGroupBits=r['crossGroupBits'],checkedSignals=r['checkedSignals'],attributions=len(r['attributions']))
    if r['quality']['completeness']=='complete':
        assert a['quality']['completeness']=='complete' and r['processedFacts']==r['inputFacts'] and r['checkedSignals']==r['inputSignals']
        assert all('coverage' in s for s in r['signals']) and all(g['identityComplete'] for g in r['groups'])
    return r


def run(top,*extra,code=0,statistics=True,grouped=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',top,str(gen.inv.legacy.FIXTURE),str(ROOT/'tests/statistics.sv'),str(ROOT/'tests/event-groups.sv'),*(['--register-statistics'] if statistics else []),*(['--register-event-groups'] if grouped else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    r=json.loads(p.stdout);return verify(r) if grouped else r


class Events(unittest.TestCase):
    def test_same_events_overlap_only_within_one_group(self):
        r=run('events_same','--require-complete')
        self.assertEqual(r['summary']['groups'],1);self.assertEqual(r['summary']['groupCoveredBits'],4)
        self.assertEqual(r['groups'][0]['totals']['overlapBits'],2);self.assertEqual(r['crossGroupBits'],0)

    def test_distinct_edges_attribute_shared_state_bits(self):
        r=run('events_cross','--require-complete')
        self.assertEqual(r['summary']['groups'],2);self.assertEqual(r['summary']['groupCoveredBits'],6)
        self.assertEqual(r['analysis']['totals']['coveredBits'],4);self.assertEqual(r['crossGroupBits'],2)
        self.assertEqual(r['attributions'][0]['segments'][0]['bits'],dict(lsb=1,width=2))

    def test_three_groups_not_subtracted_as_excess_memberships(self):
        r=run('events_three','--require-complete')
        self.assertEqual((r['summary']['groups'],r['summary']['groupCoveredBits'],r['crossGroupBits']),(3,12,4))
        self.assertNotEqual(r['crossGroupBits'],r['summary']['groupCoveredBits']-r['analysis']['totals']['coveredBits'])

    def test_different_groups_can_cover_disjoint_bits(self):
        r=run('events_disjoint','--require-complete')
        self.assertEqual(r['crossGroupBits'],0);self.assertEqual(len(r['attributions']),1)
        self.assertEqual(r['attributions'][0]['segments'],[])

    def test_async_identity_and_role_remain_original(self):
        r=run('events_reset','--require-complete');self.assertEqual(len(r['groups']),2)
        self.assertEqual(len({g['async'][0]['signal'] for g in r['groups']}),2)
        r=run('events_roles','--require-complete');self.assertEqual(r['crossGroupBits'],1)
        self.assertEqual({g['async'][0]['type'] for g in r['groups']},{'reset','set'})

    def test_same_definition_instances_are_not_same_literal_event(self):
        r=run('stats_top','--recursive','--require-complete')
        self.assertEqual((len(r['groups']),r['summary']['groupCoveredBits'],r['checkedSignals']),(3,11,3))

    def test_pagination_and_known_group_at_capacity(self):
        r=run('stats_many','--max-event-groups','1','--require-complete')
        self.assertEqual((r['inputFacts'],r['processedFacts'],len(r['analysis']['pages'])),(230,230,2))
        self.assertEqual(r['summary']['groupCoveredBits'],230)

    def test_original_partial_and_no_false_findings(self):
        r=run('events_cross','--max-statistics-facts','1','--require-complete','--fail-on-error',code=4)
        self.assertIn('statistics_incomplete',r['quality']['reasons'])
        self.assertEqual(run('events_cross','--fail-on-error')['quality']['completeness'],'complete')

    def test_global_group_member_work_limits_preserve_prefix(self):
        for option,reason in [('--max-event-groups','budget_groups'),('--max-event-group-members','budget_members'),('--max-event-group-work','budget_work')]:
            with self.subTest(option=option):
                r=run('events_cross',option,'1','--require-complete',code=4)
                self.assertIn(reason,r['quality']['reasons']);self.assertLess(r['processedFacts'],r['inputFacts'])

    def test_atomic_coverage_and_attribution_limits(self):
        r=run('events_cross','--max-event-group-segments','1','--require-complete',code=4)
        self.assertIn('budget_segments',r['quality']['reasons']);self.assertEqual(r['crossGroupBits'],0)
        r=run('events_three','--max-event-group-overlap-members','2','--require-complete',code=4)
        self.assertIn('budget_overlap_members',r['quality']['reasons']);self.assertEqual(r['attributions'],[])
        self.assertEqual(r['summary']['groupCoveredBits'],12)

    def test_empty_and_blackbox_quality(self):
        self.assertEqual(run('empty','--require-complete')['groups'],[])
        r=run('with_blackbox','--recursive','--require-complete',code=4)
        self.assertIn('statistics_incomplete',r['quality']['reasons'])

    def test_mode_and_bounds(self):
        run('events_cross',statistics=False,code=2)
        run('events_cross','--max-event-group-work','1',grouped=False,code=2)
        run('events_cross','--register-event-groups',code=2)
        for option,high in [('--max-event-groups',100000),('--max-event-group-members',1000000),('--max-event-group-segments',2000000),('--max-event-group-overlap-members',1000000),('--max-event-group-work',10000000),('--max-event-group-millis',60000)]:
            for value in [0,high+1]:run('events_cross',option,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['event-groups.py'])
