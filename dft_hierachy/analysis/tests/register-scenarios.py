"""Author checks: compare complete event identities and original state-bit unions."""
import importlib.util
import json
import subprocess
import unittest
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
spec=importlib.util.spec_from_file_location('author_resolved',ROOT/'tests/resolved-events.py')
resolved=importlib.util.module_from_spec(spec);spec.loader.exec_module(resolved)
events=resolved.events;stats=resolved.stats
schema=json.loads((ROOT/'sequential/register-scenarios-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=resolved.registry.with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not resolved.validator.is_valid(r) and not resolved.profile.validator.is_valid(r)
    assert not events.validator.is_valid(r) and not stats.validator.is_valid(r) and all(not v.is_valid(r) for v in stats.old_validators)
    shared=events.verify(r['analysis']);s=shared['analysis'];limits=r['limits']
    assert r['snapshotId']==shared['snapshotId'] and r['scope']==shared['scope']
    contexts=r['scenarios'];assert 2<=len(contexts)<=8 and len({v['name'] for v in contexts})==len(contexts)
    for context in contexts:
        if 'profile' in context:
            p=context['profile'];assert 'analysis' not in p
            assert p['options']['inputValuesRequested']==context['inputValuesRequested']
            assert p['options']['maxMillis']<=min(limits['maxMillis'],r['commonOptions']['maxMillis'])
            p=resolved.profile.verify(dict(p,analysis=shared))
            if 'resolved' in context:
                v=context['resolved'];assert 'analysis' not in v
                assert v['limits']['maxMillis']<=min(limits['maxMillis'],r['resolvedLimits']['maxMillis'])
                resolved.verify(dict(v,analysis=p))
                status='complete' if v['quality']['completeness']=='complete' else 'partial'
            else:status='profile_only'
        else:status='not_run'
        assert context['status']==status
    raw=[s['pages'][f['page']]['response']['result']['items'][f['item']] for f in s['facts']]
    owners={f:gi for gi,g in enumerate(shared['groups']) for si in g['signals'] for f in shared['signals'][si]['facts']}
    assert len(r['comparisons'])==len(contexts)-1
    for index,c in enumerate(r['comparisons'],1):
        assert (c['baseline'],c['scenario'],c['inputGroups'],c['processedGroups'])==(0,index,len(shared['groups']),len(c['rows']))
        for ri,row in enumerate(c['rows']):
            assert row['rawGroup']==ri
            groups=[]
            for ci,key in [(0,'baselineGroup'),(index,'scenarioGroup')]:
                v=contexts[ci].get('resolved',{});rows=v.get('rows',[])
                gi=rows[ri]['resolvedGroup'] if ri<len(rows) else None
                assert row[key]==gi
                groups.append(v['groups'][gi] if gi is not None else None)
            expected='unresolved' if None in groups else ('unchanged' if resolved.signature(groups[0])==resolved.signature(groups[1]) else 'changed')
            assert row['status']==expected
            if expected=='unresolved':assert row['reasons']
        changed={x['rawGroup'] for x in c['rows'] if x['status']=='changed'}
        assigned=set();signal_indices=set()
        for signal in c['changedSignals']:
            assert signal['signal'] not in signal_indices;signal_indices.add(signal['signal'])
            assert signal['facts']
            for fi in signal['facts']:
                assert fi not in assigned and s['facts'][fi]['signal']==signal['signal'] and owners[fi] in changed;assigned.add(fi)
            if 'coverage' in signal:assert signal['coverage']==stats.measure([(raw[f]['bits']['lsb'],raw[f]['bits']['width']) for f in signal['facts']])
        ss=c['changedSignals'];done=[v for v in ss if 'coverage' in v]
        assert c['changedTotals']==dict(facts=len(assigned),signals=len(ss),factBits=sum(raw[f]['bits']['width'] for f in assigned),summarizedFacts=sum(len(v['facts']) for v in done),summarizedSignals=len(done),coveredBits=sum(v['coverage']['coveredBits'] for v in done),overlapBits=sum(v['coverage']['overlapBits'] for v in done),maxMultiplicity=max([0,*[v['coverage']['maxMultiplicity'] for v in done]]))
        if c['quality']['completeness']=='complete':
            assert len(c['rows'])==c['inputGroups'] and all(v['status']!='unresolved' for v in c['rows'])
            assert assigned=={f for f,gi in owners.items() if gi in changed} and len(done)==len(ss)
            assert all(contexts[i]['resolved']['quality']['completeness']=='complete' for i in [0,index])
    rows=[row for c in r['comparisons'] for row in c['rows']]
    assert r['comparisonRows']==len(rows)<=limits['maxComparisons'] and r['work']<=limits['maxWork']
    assert r['memberFacts']==sum(c['changedTotals']['facts'] for c in r['comparisons'])<=limits['maxMembers']
    assert r['segmentCount']==sum(len(v['coverage']['segments']) for c in r['comparisons'] for v in c['changedSignals'] if 'coverage' in v)<=limits['maxSegments']
    assert r['summary']==dict(scenarios=len(contexts),profiled=sum('profile' in v for v in contexts),resolved=sum('resolved' in v for v in contexts),notRun=sum(v['status']=='not_run' for v in contexts),comparisons=len(r['comparisons']),rows=len(rows),changed=sum(v['status']=='changed' for v in rows),unchanged=sum(v['status']=='unchanged' for v in rows),unresolved=sum(v['status']=='unresolved' for v in rows))
    if r['quality']['completeness']=='complete':
        assert shared['quality']['completeness']=='complete' and all(v['status']=='complete' for v in contexts)
        assert all(c['quality']['completeness']=='complete' for c in r['comparisons'])
    return r


def run(top,*extra,code=0,values=(0,1,0),names=None,logic=True,new=True,flags=None):
    args=[]
    if values is not None:
        for i,v in enumerate(values):
            args+=['--scenario',names[i] if names else 'MODE'+str(i)]
            if v is not None:args+=['--input-value',top+'.sel','0',str(v)]
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',top,*(str(ROOT/'tests'/n) for n in ['design.sv','statistics.sv','event-groups.sv','register-profile.sv','resolved-events.sv','register-scenarios.sv']),*(flags if flags is not None else ['--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events']),*(['--compare-register-scenarios'] if new else []),*(['--logic'] if logic else []),*extra,*args]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    return verify(json.loads(p.stdout))


class Scenarios(unittest.TestCase):
    def test_source_identity_not_context_group_number_and_back(self):
        r=run('scenarios_reindex','--require-complete')
        c=r['comparisons'][0]
        self.assertEqual([v['status'] for v in c['rows']],['changed','unchanged','unchanged'])
        self.assertEqual(c['rows'][0]['baselineGroup'],c['rows'][0]['scenarioGroup'])
        self.assertNotEqual(c['rows'][1]['baselineGroup'],c['rows'][1]['scenarioGroup'])
        self.assertEqual(c['changedTotals']['coveredBits'],4)
        self.assertTrue(all(v['status']=='unchanged' for v in r['comparisons'][1]['rows']))

    def test_changed_state_bits_union_across_event_groups(self):
        r=run('scenarios_overlap','--require-complete');c=r['comparisons'][0]
        self.assertEqual([v['status'] for v in c['rows']],['changed','changed'])
        self.assertEqual((c['changedTotals']['facts'],c['changedTotals']['factBits'],c['changedTotals']['coveredBits'],c['changedTotals']['overlapBits']),(2,6,4,2))

    def test_async_reset_and_clock_polarity_are_full_identity(self):
        for top,bits in [('scenarios_reset',4),('scenarios_polarity',1)]:
            r=run(top,'--require-complete');self.assertEqual(r['comparisons'][0]['rows'][0]['status'],'changed')
            self.assertEqual(r['comparisons'][0]['changedTotals']['coveredBits'],bits)
        r=run('scenarios_reset','--require-complete',values=(0,None),code=4)
        self.assertEqual(r['comparisons'][0]['rows'][0]['status'],'unresolved')

    def test_unknown_context_preserves_known_rows_and_back(self):
        r=run('scenarios_reindex','--require-complete',values=(0,None,0),code=4)
        self.assertEqual([v['status'] for v in r['comparisons'][0]['rows']],['unresolved','unchanged','unchanged'])
        self.assertTrue(all(v['status']=='unchanged' for v in r['comparisons'][1]['rows']))
        self.assertEqual(r['comparisons'][0]['changedTotals']['facts'],0)

    def test_batch_limits_and_atomic_coverage(self):
        r=run('scenarios_reindex','--max-comparisons','1','--require-complete',code=4)
        self.assertEqual((r['comparisonRows'],len(r['comparisons'][1]['rows'])),(1,0))
        r=run('scenarios_overlap','--max-register-scenario-members','1','--require-complete',code=4)
        self.assertEqual((r['memberFacts'],r['comparisons'][0]['changedTotals']['coveredBits']),(1,3))
        r=run('scenarios_overlap','--max-register-scenario-segments','1','--require-complete',code=4)
        self.assertEqual(r['comparisons'][0]['changedTotals']['coveredBits'],0)
        run('scenarios_reindex','--max-register-scenario-work','1','--require-complete',code=4)

    def test_profile_and_resolved_truncation_remain_partial(self):
        for flag in ['--max-checks','--max-resolved-event-rows','--max-statistics-facts','--max-event-group-members']:
            run('scenarios_reindex',flag,'1','--require-complete',code=4)

    def test_paginated_parameter_instances_empty_and_blackbox(self):
        r=run('stats_many','--require-complete',values=(None,None));self.assertEqual(len(r['analysis']['analysis']['facts']),230)
        self.assertEqual(r['comparisons'][0]['rows'][0]['status'],'unchanged')
        r=run('stats_top','--recursive','--require-complete',values=(None,None));self.assertEqual(r['analysis']['analysis']['totals']['coveredBits'],11)
        self.assertEqual(run('empty','--require-complete',values=(None,None))['comparisons'][0]['rows'],[])
        run('with_blackbox','--recursive','--require-complete',values=(None,None),code=4)

    def test_names_counts_and_context_scoping(self):
        run('scenarios_reindex','--require-complete',values=(0,1),names=['功能','扫描😀'])
        run('scenarios_reindex',values=(0,1),names=['a'*128,'B'])
        for names in [['A','A'],['a'*129,'B']]:run('scenarios_reindex',values=(0,1),names=names,code=2)
        for values in [(0,),tuple([0]*9)]:run('scenarios_reindex',values=values,code=2)
        run('scenarios_reindex','--input-value','scenarios_reindex.sel','0','1',code=2)
        run('scenarios_reindex','--input-value','scenarios_reindex.c0','0','1',new=False,code=2)

    def test_dependencies_modes_and_bounds(self):
        run('scenarios_reindex',logic=False,code=2)
        run('scenarios_reindex',flags=['--register-statistics','--register-event-groups','--register-control-profile'],code=2)
        for flag in ['--source-inventory','--clock-generation','--compare-generation','--compare-register-scenarios']:
            run('scenarios_reindex',flag,code=2)
        run('scenarios_reindex','--max-register-scenario-work','1',new=False,values=None,code=2)
        for flag,high in [('--max-scenario-millis',60000),('--max-comparisons',100000),('--max-register-scenario-work',10000000),('--max-register-scenario-members',1000000),('--max-register-scenario-segments',2000000)]:
            for value in [0,high+1]:run('scenarios_reindex',flag,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['register-scenarios.py'])
