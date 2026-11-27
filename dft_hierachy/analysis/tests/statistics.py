"""Author RTL expectations for fact intervals and instance/definition aggregation."""
import json
import subprocess
import unittest
from collections import defaultdict
import generation as gen
from referencing import Resource
from jsonschema import Draft202012Validator
ROOT=gen.ROOT
registry=gen.registry
old_comparison=json.loads((ROOT/'sequential/generation-comparison-report.schema.json').read_text())
registry=registry.with_resource(old_comparison['$id'],Resource.from_contents(old_comparison))
old_validators=[*gen.inv.validators,gen.validator,Draft202012Validator(old_comparison,registry=registry)]
schema=json.loads((ROOT/'sequential/register-statistics-report.schema.json').read_text())
Draft202012Validator.check_schema(schema)
registry=registry.with_resource(schema['$id'],Resource.from_contents(schema))
validator=Draft202012Validator(schema,registry=registry)


def measure(ranges):
    events=defaultdict(int)
    for lsb,width in ranges:events[lsb]+=1;events[lsb+width]-=1
    count=0;previous=0;segments=[]
    for boundary,delta in sorted(events.items()):
        if boundary>previous and count:
            if segments and segments[-1]['factCount']==count and sum(segments[-1]['bits'].values())==previous:
                segments[-1]['bits']['width']+=boundary-previous
            else:segments.append(dict(bits=dict(lsb=previous,width=boundary-previous),factCount=count))
        count+=delta;previous=boundary
    assert count==0
    return dict(coveredBits=sum(s['bits']['width'] for s in segments),overlapBits=sum(s['bits']['width'] for s in segments if s['factCount']>1),maxMultiplicity=max([0,*[s['factCount'] for s in segments]]),segments=segments)


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert all(not v.is_valid(r) for v in old_validators)
    assert r['returnedFacts']==sum(len(p['response']['result']['items']) for p in r['pages'])<=r['limits']['maxFacts']
    assert len(r['instances'])<=r['limits']['maxInstances'] and len(r['signals'])<=r['limits']['maxSignals']
    assert r['work']<=r['limits']['maxWork']
    assert r['segmentCount']==sum(len(s['coverage']['segments']) for s in r['signals'] if 'coverage' in s)<=r['limits']['maxSegments']
    refs=[];flat=[f['ref'] for p in r['pages'] for f in p['response']['result']['items']]
    for fi,f in enumerate(r['facts']):
        p=r['pages'][f['page']];raw=p['response']['result']['items'][f['item']];s=r['signals'][f['signal']]
        assert fi in s['facts'] and p['instance']==s['instance'] and raw['signal']==s['object']['ref']
        assert raw['inst']==r['instances'][s['instance']]['info']['ref'];refs.append(raw['ref'])
    assert refs==flat[:len(refs)] and len(refs)==len(set(refs))
    for si,s in enumerate(r['signals']):
        assert len(s['facts'])==len(set(s['facts'])) and s['object']['inst']==r['instances'][s['instance']]['info']['ref']
        ranges=[]
        for i in s['facts']:
            f=r['facts'][i];assert f['signal']==si
            b=r['pages'][f['page']]['response']['result']['items'][f['item']]['bits'];ranges.append((b['lsb'],b['width']))
        if 'coverage' in s:assert measure(ranges)==s['coverage']
    def totals(signals):
        facts=[r['facts'][f] for s in signals for f in s['facts']]
        covered=[s for s in signals if 'coverage' in s]
        return dict(facts=len(facts),signals=len(signals),factBits=sum(r['pages'][f['page']]['response']['result']['items'][f['item']]['bits']['width'] for f in facts),summarizedFacts=sum(len(s['facts']) for s in covered),summarizedSignals=len(covered),coveredBits=sum(s['coverage']['coveredBits'] for s in covered),overlapBits=sum(s['coverage']['overlapBits'] for s in covered),maxMultiplicity=max([0,*[s['coverage']['maxMultiplicity'] for s in covered]]))
    assert r['totals']==totals(r['signals'])
    assert len({i['info']['ref'] for i in r['instances']})==len(r['instances'])
    for i,inst in enumerate(r['instances']):
        assert r['definitions'][inst['definition']]['ref']==inst['info']['def']
        assert inst['totals']==totals([s for s in r['signals'] if s['instance']==i])
        pages=[p for p in r['pages'] if p['instance']==i]
        if pages:
            assert pages[0]['cursor']==''
            assert all(x['response']['result'].get('next','')==y['cursor'] for x,y in zip(pages,pages[1:]))
            if inst['enumerated']:assert pages[-1]['response']['result'].get('next','')==''
    seen=[]
    for d in r['definitions']:
        seen.extend(d['instances']);assert all(r['instances'][i]['info']['def']==d['ref'] for i in d['instances'])
        assert d['totals']==totals([s for s in r['signals'] if s['instance'] in d['instances']])
    assert sorted(seen)==list(range(len(r['instances'])))
    if r['quality']['completeness']=='complete':
        assert not r['quality']['reasons'] and all(i['enumerated'] for i in r['instances'])
        assert len(r['facts'])==r['returnedFacts'] and all('coverage' in s for s in r['signals'])
        assert all(p['response']['completeness']['status']=='complete' for p in r['pages'])
    return r


def run(top,*extra,scope=None,code=0,statistics=True):
    argv=[gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,str(gen.inv.legacy.FIXTURE),str(ROOT/'tests/statistics.sv'),*(['--register-statistics'] if statistics else []),*extra]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=15)
    assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout);return verify(v) if statistics else v


class Statistics(unittest.TestCase):
    def test_parameterized_occurrences_and_definition_aggregation(self):
        r=run('stats_top','--recursive','--require-complete')
        self.assertEqual((r['totals']['facts'],r['totals']['signals'],r['totals']['factBits'],r['totals']['coveredBits']),(3,3,11,11))
        self.assertEqual(len(r['instances']),4);self.assertEqual(len(r['definitions']),2)
        d=next(d for d in r['definitions'] if d['name']=='stats_leaf')
        self.assertEqual(len(d['instances']),3);self.assertEqual(d['totals']['coveredBits'],11)

    def test_local_scope_and_nonrecursive_empty_parent(self):
        r=run('stats_top','--require-complete');self.assertEqual(r['totals']['coveredBits'],0)
        r=run('stats_top','--require-complete',scope='stats_top.b');self.assertEqual(r['totals']['coveredBits'],5)

    def test_holes_do_not_count_unwritten_declared_bits(self):
        r=run('stats_holes','--require-complete')
        self.assertEqual((r['totals']['factBits'],r['totals']['coveredBits'],r['totals']['overlapBits']),(6,6,0))
        self.assertEqual([(s['bits']['lsb'],s['bits']['width']) for s in r['signals'][0]['coverage']['segments']],[(0,2),(4,2),(8,2)])

    def test_overlap_is_counted_once_and_not_renamed_as_driver_error(self):
        r=run('stats_overlap','--require-complete','--fail-on-error')
        self.assertEqual((r['totals']['factBits'],r['totals']['coveredBits'],r['totals']['overlapBits'],r['totals']['maxMultiplicity']),(10,8,2,2))
        self.assertEqual(r['totals']['facts'],2)

    def test_real_pagination_and_adjacent_segments_merge(self):
        r=run('stats_many','--require-complete')
        self.assertEqual([len(p['response']['result']['items']) for p in r['pages']],[200,30])
        self.assertEqual((r['totals']['facts'],r['totals']['coveredBits'],r['segmentCount']),(230,230,1))

    def test_empty_and_blackbox_quality(self):
        self.assertEqual(run('empty','--require-complete')['totals']['facts'],0)
        r=run('with_blackbox','--recursive','--require-complete',code=4)
        self.assertIn('unmodeled_instance',r['quality']['reasons'])

    def test_fact_cap_is_a_lower_bound_and_preserves_page_prefix(self):
        r=run('stats_many','--max-statistics-facts','201','--require-complete',code=4)
        self.assertEqual((r['returnedFacts'],r['totals']['facts'],r['totals']['coveredBits']),(201,201,201))
        self.assertIn('budget_facts',r['quality']['reasons'])

    def test_instance_and_signal_caps(self):
        r=run('stats_top','--recursive','--max-statistics-instances','1','--require-complete',code=4)
        self.assertEqual(len(r['instances']),1);self.assertIn('budget_instances',r['quality']['reasons'])
        r=run('stats_top','--recursive','--max-statistics-signals','1','--require-complete',code=4)
        self.assertEqual(r['totals']['signals'],1);self.assertIn('budget_signals',r['quality']['reasons'])
        self.assertGreater(r['returnedFacts'],r['totals']['facts'])

    def test_atomic_signal_summary_and_work_cap(self):
        r=run('stats_holes','--max-statistics-segments','1','--require-complete',code=4)
        self.assertEqual(r['totals']['facts'],3);self.assertEqual(r['totals']['summarizedFacts'],0)
        self.assertNotIn('coverage',r['signals'][0]);self.assertIn('budget_segments',r['quality']['reasons'])
        r=run('stats_top','--recursive','--max-statistics-work','1','--require-complete',code=4)
        self.assertEqual(r['work'],1);self.assertIn('budget_work',r['quality']['reasons'])

    def test_scope_errors_and_fresh_reuse(self):
        r=run('stats_top',scope='stats_top.missing',code=3);self.assertEqual(r['error']['code'],'not_found')
        run('stats_top',scope='stats_top.c',code=2)
        self.assertEqual(run('stats_top','--recursive')['totals']['coveredBits'],11)

    def test_explicit_mode_and_budget_bounds(self):
        run('stats_top','--max-statistics-work','1',statistics=False,code=2)
        for extra in [['--logic'],['--source-inventory'],['--control-generation'],['--max-facts','1'],['--scenario','A'],['--register-statistics']]:run('stats_top',*extra,code=2)
        for option,high in [('facts',1000000),('instances',100000),('signals',100000),('segments',2000000),('work',10000000),('millis',60000)]:
            for value in [0,high+1]:run('stats_top','--max-statistics-'+option,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['statistics.py'])
