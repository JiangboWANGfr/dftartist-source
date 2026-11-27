"""Author real RTL expectations for transitive generation structure, not B oracle."""
import json
import subprocess
import unittest
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT = gen.ROOT
schema = json.loads((ROOT / 'sequential/generation-comparison-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry = gen.registry.with_resource(schema['$id'], Resource.from_contents(schema))
validator = Draft202012Validator(schema, registry=registry)


def packed(value): return json.dumps(value, sort_keys=True)


def verify(r):
    validator.validate(r)
    if 'error' in r: return r
    assert not gen.validator.is_valid(r) and all(not x.is_valid(r) for x in gen.inv.validators)
    original = gen.verify(r['analysis'])
    a = original['analysis']
    if a['algorithm'] == 'rtl-control-inventory-v1': a = a['analysis']
    graphs = {g['scenario']: g for g in original['graphs']}
    contexts = {c['scenario']: c['cones'] for c in r['contexts']}
    assert list(graphs) == list(contexts)
    assert r['snapshotId'] == a['snapshot']['snapshotId'] and r['scope'] == a['scope']
    assert r['inputCones'] == sum(len(s['report']['checks']) for s in a['scenarios'] if 'report' in s)
    assert r['processedCones'] == sum(len(c) for c in contexts.values()) <= r['limits']['maxCones']
    assert r['memberEntries'] == sum(len(c['nodes']) for cs in contexts.values() for c in cs) <= r['limits']['maxMembers']
    assert r['work'] <= r['limits']['maxWork']
    def signature(g, cone):
        rows=[]
        for n in cone['nodes']:
            node=g['nodes'][n]
            rows.append(packed([node['point'], node['source'], None if node['generator'] is None else g['generators'][node['generator']]['fact']]))
        return sorted(rows)
    for s, cones in contexts.items():
        g=graphs[s]
        for ci, c in enumerate(cones):
            assert c['check'] == ci and c['node'] == (g['seeds'][ci]['node'] if ci < len(g['seeds']) else None)
            assert len(c['nodes']) == len(set(c['nodes']))
            assert all(n < len(g['nodes']) for n in c['nodes'])
            if c['quality']['completeness'] == 'complete':
                assert c['node'] in c['nodes']
                seen=set(); pending=[c['node']]
                while pending:
                    n=pending.pop()
                    if n in seen: continue
                    seen.add(n); node=g['nodes'][n]; assert 'source' in node and not node['reasons']
                    if node['source']['kind'] == 'generated':
                        assert node['generator'] is not None
                        parent=g['generators'][node['generator']]; assert parent['expanded']
                        pending.extend([parent['clockNode'], *parent['asyncNodes']])
                assert seen == set(c['nodes'])
    counts=dict(contexts=len(contexts),cones=r['processedCones'],members=r['memberEntries'],rows=0,changed=0,unchanged=0,unresolved=0)
    assert [c['scenario'] for c in r['comparisons']] == list(range(1,len(a['scenarios'])))
    for comparison in r['comparisons']:
        s=comparison['scenario']; seen=set()
        for row in comparison['controls']:
            assert packed(row['point']) not in seen;seen.add(packed(row['point']))
            counts['rows']+=1;counts[row['status']]+=1
            selected=[]
            for case,field in [(0,'baselineCone'),(s,'scenarioCone')]:
                i=row[field]
                if i is None: selected.append(None);continue
                cone=contexts[case][i];selected.append(cone)
                assert a['scenarios'][case]['report']['checks'][cone['check']]['point'] == row['point']
            x,y=selected
            if row['status'] != 'unresolved':
                assert x['quality']['completeness'] == y['quality']['completeness'] == 'complete'
                assert (row['status']=='unchanged') == (signature(graphs[0],x)==signature(graphs[s],y))
            if x is None or y is None or any(c['quality']['completeness']=='partial' for c in selected if c): assert row['status']=='unresolved'
    assert counts['rows'] <= r['limits']['maxRows'] and r['summary'] == counts
    if r['quality']['completeness']=='complete':
        assert original['quality']['completeness']=='complete' and r['processedCones']==r['inputCones'] and not counts['unresolved']
    return r


def run(top, *args, scope=None, code=0, comparison=True, generation=True, logic=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',str(gen.inv.legacy.FIXTURE),
          *(str(ROOT/'tests'/(n+'.sv')) for n in ['logic','gates','values','generation','generation-comparison']),
          *(['--logic'] if logic else []), *(['--control-generation'] if generation else []),
          *(['--compare-generation'] if comparison else []), *args]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout);return verify(v) if comparison else v


def pair(top,*extra):return ['--scenario','A','--input-value',top+'.sel','0','0','--scenario','B','--input-value',top+'.sel','0','1',*extra]
def same():return ['--scenario','A','--scenario','B']


class Comparison(unittest.TestCase):
    def test_direct_source_same_but_upstream_chain_changed(self):
        r=run('generation_mode',*pair('generation_mode'),'--require-complete',scope='generation_mode.u')
        self.assertEqual(r['summary']['changed'],1);self.assertEqual(r['summary']['unchanged'],1)
        self.assertEqual(r['analysis']['analysis']['summary']['changed'],0)
        self.assertEqual([len(g['generators']) for g in r['analysis']['graphs']],[2,1])

    def test_same_contexts_and_return_to_original_have_no_history(self):
        r=run('generation_mode',*pair('generation_mode'),'--scenario','A_AGAIN','--input-value','generation_mode.sel','0','0',scope='generation_mode.u')
        self.assertEqual([sum(x['status']=='changed' for x in c['controls']) for c in r['comparisons']],[1,0])
        r=run('generation_chain',*same(),'--require-complete',scope='generation_chain.u')
        self.assertEqual(r['summary']['changed'],0);self.assertEqual(r['summary']['unresolved'],0)

    def test_generated_clock_polarity_change_is_visible(self):
        r=run('generation_polarity',*pair('generation_polarity'),'--require-complete',scope='generation_polarity.u')
        self.assertEqual(r['summary']['changed'],1)
        values=[]
        for g in r['analysis']['graphs']:
            n=g['generators'][0]['clockNode'];values.append(g['nodes'][n]['source']['inverted'])
        self.assertEqual(values,[False,True])

    def test_generator_async_control_change_is_visible(self):
        r=run('generation_async',*pair('generation_async'),'--require-complete',scope='generation_async.u')
        self.assertEqual(r['summary']['changed'],1)
        for g in r['analysis']['graphs']:
            self.assertEqual(g['generators'][0]['fact']['async'][0]['edge'],'negedge')

    def test_shared_source_and_distinct_written_bits(self):
        for top,count in [('generation_fanout',1),('generation_shared',2)]:
            r=run(top,*same(),'--require-complete',scope=top+'.sinks')
            self.assertEqual(r['summary']['changed'],0);self.assertEqual(r['summary']['unresolved'],0)
            self.assertEqual(len(r['analysis']['graphs'][0]['generators']),count)

    def test_unknown_does_not_erase_other_local_proof(self):
        r=run('generation_unknown',*same(),'--require-complete',scope='generation_unknown.u',code=4)
        self.assertEqual(r['summary']['unresolved'],1);self.assertEqual(r['summary']['unchanged'],1)

    def test_cycle_is_unresolved_even_when_identical(self):
        r=run('generation_self',*same(),'--require-complete','--fail-on-error',code=4)
        self.assertEqual(r['summary']['unresolved'],1)
        self.assertIn('generation_cycle',r['contexts'][0]['cones'][0]['quality']['reasons'])

    def test_unexpanded_generator_is_not_unchanged(self):
        r=run('generation_chain',*same(),'--max-generation-depth','0','--require-complete',scope='generation_chain.u',code=4)
        self.assertEqual(r['summary']['unresolved'],1)

    def test_original_partial_and_policy_retained(self):
        r=run('generation_chain',*same(),'--max-facts','1','--require-complete',code=4)
        self.assertEqual(r['quality']['completeness'],'partial')
        r=run('generation_chain',*same(),'--fail-on-error',scope='generation_chain.u',code=1)
        self.assertTrue(r['analysis']['analysis']['scenarios'][0]['report']['findings'])

    def test_all_global_caps_keep_prefix_and_partial(self):
        for option,value,reason in [('cones','1','budget_cones'),('members','1','budget_members'),('rows','1','budget_rows'),('work','1','budget_work')]:
            with self.subTest(option=option):
                r=run('generation_chain',*same(),'--max-generation-comparison-'+option,value,'--require-complete',scope='generation_chain.u',code=4)
                self.assertIn(reason,r['quality']['reasons'])

    def test_inventory_combination_and_direct_change(self):
        r=run('logic_bypass',*pair('logic_bypass'),'--source-inventory','--require-complete','--fail-on-error',code=1)
        self.assertEqual(r['analysis']['analysis']['algorithm'],'rtl-control-inventory-v1')
        self.assertEqual(r['summary']['changed'],1)

    def test_primary_only_and_empty_scope(self):
        for top in ['clean','empty']:
            r=run(top,*same(),'--require-complete')
            self.assertEqual(r['summary']['changed'],0);self.assertEqual(r['summary']['unresolved'],0)

    def test_arguments_and_budget_bounds(self):
        run('generation_chain',code=2)
        run('generation_chain',*same(),generation=False,code=2)
        run('generation_chain',*same(),logic=False,code=2)
        run('generation_chain',*same(),'--max-generation-comparison-work','1',comparison=False,code=2)
        for option,high in [('cones',80000),('members',1000000),('rows',100000),('work',10000000),('millis',60000)]:
            for value in [0,high+1]:
                run('generation_chain',*same(),'--max-generation-comparison-'+option,str(value),code=2)
        run('generation_chain',*same(),'--compare-generation',code=2)


if __name__=='__main__':unittest.main(argv=['generation-comparison.py'])
