"""Author full proven event tuple grouping and cross-group state-bit expectations."""
import importlib.util
import json
import subprocess
import unittest
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_profile',ROOT/'tests/register-profile.py')
profile=importlib.util.module_from_spec(spec);spec.loader.exec_module(profile)
events=profile.events;stats=profile.stats
schema=json.loads((ROOT/'sequential/register-resolved-events-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=events.registry.with_resource(profile.schema['$id'],Resource.from_contents(profile.schema)).with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)


def event_key(e):return (profile.source_key(e['source']),e['edge'],e.get('type',''))
def signature(g):return (event_key(g['clock']),tuple(event_key(e) for e in g['async']))
def raw_signature(p,ri):
    if ri>=len(p['groupControls']):return None
    row=p['groupControls'][ri];g=p['analysis']['groups'][ri];values=[]
    for ci,event in zip([row['clockCheck'],*row['asyncChecks']],[g['clock'],*g['async']]):
        if ci is None or 'source' not in p['checks'][ci]:return None
        values.append((profile.source_key(p['checks'][ci]['source']),event['edge'],event.get('type','')))
    return (values[0],tuple(values[1:]))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not profile.validator.is_valid(r) and not events.validator.is_valid(r) and not stats.validator.is_valid(r) and all(not v.is_valid(r) for v in stats.old_validators)
    p=profile.verify(r['analysis']);g=p['analysis'];s=g['analysis'];limits=r['limits']
    assert r['snapshotId']==p['snapshotId'] and r['scope']==p['scope']
    assert r['inputRawGroups']==len(g['groups']) and r['inputFacts']==len(s['facts'])
    assert r['processedRawGroups']==len(r['rows'])<=min(r['inputRawGroups'],limits['maxRows'])
    assert r['work']<=limits['maxWork'] and len(r['groups'])<=limits['maxGroups'] and r['assignedFacts']<=limits['maxMembers']
    for i,row in enumerate(r['rows']):
        assert row['rawGroup']==i;expected=raw_signature(p,i)
        if row['resolvedGroup'] is None:assert expected is None and row['reasons'] and not row['membersComplete']
        else:
            result=r['groups'][row['resolvedGroup']];assert expected is not None and signature(result)==expected and i in result['rawGroups']
    assert r['resolvedRows']==sum(x['resolvedGroup'] is not None for x in r['rows'])
    owners={f:gi for gi,item in enumerate(g['groups']) for si in item['signals'] for f in g['signals'][si]['facts']}
    raw=[s['pages'][f['page']]['response']['result']['items'][f['item']] for f in s['facts']]
    assigned={};pairs=set();keys=set()
    for si,item in enumerate(r['signals']):
        assert (item['group'],item['signal']) not in pairs;pairs.add((item['group'],item['signal']))
        assert si in r['groups'][item['group']]['signals'] and item['facts']
        for f in item['facts']:
            assert f not in assigned and s['facts'][f]['signal']==item['signal'];assigned[f]=item['group']
            assert r['rows'][owners[f]]['resolvedGroup']==item['group']
        if 'coverage' in item:assert item['coverage']==stats.measure([(raw[f]['bits']['lsb'],raw[f]['bits']['width']) for f in item['facts']])
    assert len(assigned)==r['assignedFacts']
    for row in r['rows']:
        if row['membersComplete']:
            assert row['resolvedGroup'] is not None
            fs=[f for si in g['groups'][row['rawGroup']]['signals'] for f in g['signals'][si]['facts']]
            assert all(f in assigned for f in fs)
    for gi,item in enumerate(r['groups']):
        key=signature(item);assert key not in keys;keys.add(key)
        assert item['rawGroups']==[x['rawGroup'] for x in r['rows'] if x['resolvedGroup']==gi]
        ss=[r['signals'][i] for i in item['signals']];assert all(v['group']==gi for v in ss)
        complete=[v for v in ss if 'coverage' in v]
        assert item['totals']==dict(facts=sum(len(v['facts']) for v in ss),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for v in ss for f in v['facts']),summarizedFacts=sum(len(v['facts']) for v in complete),summarizedSignals=len(complete),coveredBits=sum(v['coverage']['coveredBits'] for v in complete),overlapBits=sum(v['coverage']['overlapBits'] for v in complete),maxMultiplicity=max([0,*[v['coverage']['maxMultiplicity'] for v in complete]]))
    last=-1
    for item in r['attributions']:
        assert item['signal']>last;last=item['signal'];fs=s['signals'][item['signal']]['facts'];assert all(f in assigned for f in fs)
        assert item['groups']==sorted({assigned[f] for f in fs}) and len(item['groups'])>1
        boundaries=sorted({v for f in fs for v in [raw[f]['bits']['lsb'],sum(raw[f]['bits'].values())]});segments=[]
        for start,end in zip(boundaries,boundaries[1:]):
            active=sorted({assigned[f] for f in fs if raw[f]['bits']['lsb']<=start<sum(raw[f]['bits'].values())})
            if len(active)<2:continue
            if segments and sum(segments[-1]['bits'].values())==start and segments[-1]['groups']==active:segments[-1]['bits']['width']+=end-start
            else:segments.append(dict(bits=dict(lsb=start,width=end-start),groups=active))
        assert item['segments']==segments and item['crossGroupBits']==sum(v['bits']['width'] for v in segments)
    assert r['crossGroupBits']==sum(v['crossGroupBits'] for v in r['attributions'])
    assert r['overlapMembers']==sum(len(v['groups']) for a in r['attributions'] for v in a['segments'])<=limits['maxOverlapMembers']
    assert r['segmentCount']==sum(len(v['coverage']['segments']) for v in r['signals'] if 'coverage' in v)+sum(len(a['segments']) for a in r['attributions'])<=limits['maxSegments']
    eligible=sum(all(f in assigned for f in v['facts']) for v in s['signals'])
    assert len(r['attributions'])<=r['checkedSignals']<=eligible
    assert r['summary']==dict(inputRawGroups=r['inputRawGroups'],processedRawGroups=r['processedRawGroups'],resolvedRows=r['resolvedRows'],unresolvedRows=r['processedRawGroups']-r['resolvedRows'],groups=len(r['groups']),assignedFacts=r['assignedFacts'],groupSignals=len(r['signals']),summarizedGroupSignals=sum('coverage' in v for v in r['signals']),groupCoveredBits=sum(v['totals']['coveredBits'] for v in r['groups']),checkedSignals=r['checkedSignals'],crossGroupBits=r['crossGroupBits'])
    if r['quality']['completeness']=='complete':
        assert p['quality']['completeness']=='complete' and r['processedRawGroups']==r['resolvedRows']==r['inputRawGroups']
        assert all(x['membersComplete'] for x in r['rows']) and r['assignedFacts']==r['inputFacts'] and r['checkedSignals']==len(s['signals'])
        assert all('coverage' in v for v in r['signals'])
    if p['quality']['completeness']=='partial':assert r['quality']['completeness']=='partial'
    return r


def run(top,*extra,code=0,logic=True,profiled=True,resolved=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',top,*(str(ROOT/'tests'/n) for n in ['design.sv','statistics.sv','event-groups.sv','register-profile.sv','resolved-events.sv']),'--register-statistics','--register-event-groups',*(['--register-control-profile'] if profiled else []),*(['--register-resolved-events'] if resolved else []),*(['--logic'] if logic else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class Resolved(unittest.TestCase):
    def test_clock_and_reset_aliases_merge_complete_tuple(self):
        r=run('resolved_alias','--require-complete')
        self.assertEqual((r['inputRawGroups'],len(r['groups']),r['summary']['groupCoveredBits'],r['crossGroupBits']),(2,1,4,0))
        self.assertEqual(r['analysis']['analysis']['crossGroupBits'],2);self.assertEqual(r['groups'][0]['totals']['overlapBits'],2)

    def test_same_clock_different_resets_stay_different(self):
        r=run('profile_alias','--require-complete');self.assertEqual(len(r['analysis']['cohorts']),1)
        self.assertEqual((len(r['groups']),r['summary']['groupCoveredBits'],r['crossGroupBits']),(2,6,2))

    def test_role_with_same_source_edge_is_part_of_identity(self):
        r=run('resolved_roles','--require-complete');self.assertEqual(len(r['groups']),2)
        self.assertEqual({g['async'][0]['type'] for g in r['groups']},{'reset','set'})
        self.assertEqual(len({event_key(g['async'][0])[:2] for g in r['groups']}),1)

    def test_async_polarity_and_order_remain_original(self):
        r=run('resolved_invert','--require-complete');self.assertEqual(len(r['groups']),2)
        self.assertEqual({g['async'][0]['source']['inverted'] for g in r['groups']},{False,True})
        r=run('resolved_order','--require-complete');self.assertEqual((len(r['groups']),r['crossGroupBits']),(2,1))
        self.assertEqual(r['groups'][0]['async'],list(reversed(r['groups'][1]['async'])))

    def test_clock_edge_and_polarity_do_not_become_equivalent(self):
        r=run('events_cross','--require-complete');self.assertEqual({g['clock']['edge'] for g in r['groups']},{'posedge','negedge'})
        r=run('profile_invert','--require-complete');self.assertEqual({g['clock']['source']['inverted'] for g in r['groups']},{False,True})

    def test_three_groups_and_disjoint_ranges(self):
        r=run('events_three','--require-complete');self.assertEqual((len(r['groups']),r['summary']['groupCoveredBits'],r['crossGroupBits']),(3,12,4))
        r=run('events_disjoint','--require-complete');self.assertEqual(r['crossGroupBits'],0);self.assertEqual(r['attributions'][0]['segments'],[])

    def test_unresolved_async_does_not_borrow_clock_only_cohort(self):
        r=run('resolved_async_unknown','--require-complete',code=4)
        self.assertEqual(len(r['analysis']['cohorts']),1);self.assertEqual(r['groups'],[])
        self.assertIn('async_source_unresolved',r['rows'][0]['reasons']);self.assertEqual(r['checkedSignals'],0)
        r=run('resolved_async_unknown','--input-value','resolved_async_unknown.sel','0','0','--require-complete');self.assertEqual(len(r['groups']),1)

    def test_static_contexts_zero_one_zero(self):
        sources=[]
        for level in [0,1,0]:
            r=run('profile_modes','--input-value','profile_modes.sel','0',str(level),'--require-complete')
            sources.append(profile.source_key(r['groups'][0]['clock']['source']).replace(r['snapshotId'],'<snapshot>'))
        self.assertEqual(sources[0],sources[2]);self.assertNotEqual(sources[0],sources[1])

    def test_capacity_and_rows_preserve_explicit_prefix(self):
        self.assertEqual(run('resolved_alias','--max-resolved-event-groups','1','--require-complete')['resolvedRows'],2)
        for flag,reason in [('--max-resolved-event-groups','budget_groups'),('--max-resolved-event-rows','budget_rows'),('--max-resolved-event-work','budget_work')]:
            r=run('profile_alias',flag,'1','--require-complete',code=4);self.assertIn(reason,r['quality']['reasons'])
            self.assertLess(r['processedRawGroups'],r['inputRawGroups'])

    def test_membership_and_coverage_are_not_half_complete(self):
        r=run('resolved_alias','--max-resolved-event-members','1','--require-complete',code=4)
        self.assertEqual((r['assignedFacts'],r['summary']['groupCoveredBits'],r['checkedSignals']),(1,3,0))
        self.assertFalse(r['rows'][-1]['membersComplete'])
        r=run('resolved_alias','--max-resolved-event-segments','1','--require-complete',code=4)
        self.assertEqual(r['summary']['groupCoveredBits'],0);self.assertTrue(all('coverage' not in v for v in r['signals']))

    def test_cross_attribution_is_atomic_under_both_caps(self):
        for flag,value,reason in [('--max-resolved-event-overlap-members',2,'budget_overlap_members'),('--max-resolved-event-segments',3,'budget_segments')]:
            r=run('events_three',flag,str(value),'--require-complete',code=4)
            self.assertIn(reason,r['quality']['reasons']);self.assertEqual(r['attributions'],[]);self.assertEqual(r['summary']['groupCoveredBits'],12)

    def test_parent_partial_pagination_and_instances(self):
        for flag in ['--max-checks','--max-statistics-facts','--max-event-group-members']:
            r=run('resolved_alias',flag,'1','--require-complete',code=4);self.assertIn('profile_incomplete',r['quality']['reasons'])
        partial=run('resolved_alias','--max-register-control-members','1','--require-complete',code=4)
        self.assertEqual((partial['resolvedRows'],partial['assignedFacts'],partial['summary']['groupCoveredBits']),(2,2,4))
        r=run('stats_many','--require-complete');self.assertEqual((r['assignedFacts'],r['summary']['groupCoveredBits']),(230,230))
        r=run('stats_top','--recursive','--require-complete');self.assertEqual((len(r['groups']),len(r['signals']),r['summary']['groupCoveredBits']),(1,3,11))

    def test_empty_blackbox_and_structural_unknown(self):
        self.assertEqual(run('empty','--require-complete')['groups'],[])
        r=run('with_blackbox','--recursive','--require-complete',code=4);self.assertIn('profile_incomplete',r['quality']['reasons'])
        r=run('resolved_alias','--require-complete',logic=False,code=4);self.assertEqual(r['groups'],[])
        run('events_three','--fail-on-error','--require-complete')

    def test_flag_combinations_and_all_limit_boundaries(self):
        run('resolved_alias',profiled=False,code=2)
        run('resolved_alias','--max-resolved-event-work','1',resolved=False,code=2)
        run('resolved_alias','--register-resolved-events',code=2)
        run('resolved_alias','--source-inventory',code=2)
        for flag,high in [('rows',100000),('groups',100000),('members',1000000),('segments',2000000),('overlap-members',1000000),('work',10000000),('millis',60000)]:
            for value in [0,high+1]:run('resolved_alias','--max-resolved-event-'+flag,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['resolved-events.py'])
