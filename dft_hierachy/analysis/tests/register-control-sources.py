"""Author RTL checks: proven source identity, original fact unions, and bit attribution."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('author_fanout',Path(__file__).with_name('register-fanout.py'))
fanout=importlib.util.module_from_spec(spec);spec.loader.exec_module(fanout)
ROOT=fanout.ROOT
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
resources=[]
for path in [fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(path.read_text());resources.append((s['$id'],Resource.from_contents(s)))
schema=json.loads((ROOT/'sequential/register-control-sources-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not fanout.validator.is_valid(r)
    f=fanout.verify(r['analysis']);g=f['analysis'];p=g['analysis'];e=p['analysis'];s=e['analysis'];graph=g['graph'];limits=r['limits']
    assert (r['snapshotId'],r['scope'],r['inputNodes'])==(f['snapshotId'],f['scope'],len(f['nodes']))
    assert [v['node'] for v in r['rows']]==list(range(len(r['rows']))) and len(r['rows'])<=limits['maxRows']
    identities=set()
    for row in r['rows']:
        n=graph['nodes'][f['nodes'][row['node']]['node']];kind=n.get('source',{}).get('kind','unresolved');assert row['kind']==kind
        if row['group'] is not None:assert r['groups'][row['group']]['source']==n['source'] and row['node'] in r['groups'][row['group']]['nodes']
    facts=[s['pages'][v['page']]['response']['result']['items'][v['item']] for v in s['facts']]
    owner={fi:gi for gi,group in enumerate(e['groups']) for si in group['signals'] for fi in e['signals'][si]['facts']}
    members={};group_segments=0
    for gi,group in enumerate(r['groups']):
        key=json.dumps(group['source'],sort_keys=True);assert key not in identities;identities.add(key)
        assert group['nodes']==[v['node'] for v in r['rows'] if v['group']==gi]
        expected=sorted({n for ni in group['nodes'] for n in f['nodes'][ni]['rawGroups']})
        assert group['rawGroups']==sorted(set(group['rawGroups'])) and set(group['rawGroups'])<=set(expected)
        got=set();sigs=set();done=[]
        for signal in group['signals']:
            si=signal['signal'];assert si not in sigs;sigs.add(si)
            for fi in signal['facts']:
                assert fi not in got and s['facts'][fi]['signal']==si and owner[fi] in group['rawGroups'];got.add(fi)
                members.setdefault(si,[]).append((gi,fi))
            if 'coverage' in signal:
                assert signal['coverage']==fanout.generation.profile.stats.measure([(facts[fi]['bits']['lsb'],facts[fi]['bits']['width']) for fi in signal['facts']]);done.append(signal);group_segments+=len(signal['coverage']['segments'])
        assert group['totals']==dict(facts=len(got),signals=len(group['signals']),factBits=sum(facts[fi]['bits']['width'] for fi in got),summarizedFacts=sum(len(v['facts']) for v in done),summarizedSignals=len(done),coveredBits=sum(v['coverage']['coveredBits'] for v in done),overlapBits=sum(v['coverage']['overlapBits'] for v in done),maxMultiplicity=max([0,*[v['coverage']['maxMultiplicity'] for v in done]]))
        if group['membersComplete']:
            assert group['rawGroups']==expected and got=={fi for fi,raw in owner.items() if raw in expected} and len(done)==len(group['signals'])
            assert all(f['nodes'][ni]['membersComplete'] for ni in group['nodes'])
    assert len(r['groups'])<=limits['maxSources'] and r['memberFacts']==sum(v['totals']['facts'] for v in r['groups'])<=limits['maxMembers']
    attrs=set();overlap_segments=0;overlap_members=0;cross=0
    for attr in r['attributions']:
        si=attr['signal'];assert si not in attrs;attrs.add(si);points={}
        for gi,fi in members[si]:
            b=facts[fi]['bits']
            for bit in range(b['lsb'],b['lsb']+b['width']):points.setdefault(bit,set()).add(gi)
        expected=[]
        for bit,ids in sorted(points.items()):
            if len(ids)<2:continue
            ids=sorted(ids)
            if expected and expected[-1]['bits']['lsb']+expected[-1]['bits']['width']==bit and expected[-1]['groups']==ids:expected[-1]['bits']['width']+=1
            else:expected.append(dict(bits=dict(lsb=bit,width=1),groups=ids))
        assert attr['segments']==expected and attr['groups']==sorted({gi for gi,fi in members[si]})
        assert attr['crossGroupBits']==sum(v['bits']['width'] for v in expected)
        overlap_segments+=len(expected);overlap_members+=sum(len(v['groups']) for v in expected);cross+=attr['crossGroupBits']
    assert r['crossGroupBits']==cross and r['overlapMembers']==overlap_members<=limits['maxOverlapMembers']
    assert r['segmentCount']==group_segments+overlap_segments<=limits['maxSegments'] and r['work']<=limits['maxWork']
    assert r['checkedSignals']<=r['attributionSignals']<=len(members)
    if r['attributionsComplete']:
        assert r['checkedSignals']==r['attributionSignals']==len(members) and all(v['membersComplete'] for v in r['groups'])
        assert attrs=={si for si,rows in members.items() if len({gi for gi,fi in rows})>1}
    assert r['summary']==dict(rows=len(r['rows']),terminalNodes=sum(v['group'] is not None for v in r['rows']),generatedNodes=sum(v['kind']=='generated' for v in r['rows']),unresolvedNodes=sum(v['kind']=='unresolved' for v in r['rows']),sources=len(r['groups']),partialSources=sum(not v['membersComplete'] for v in r['groups']),sourceSignals=sum(len(v['signals']) for v in r['groups']),summarizedSourceSignals=sum(v['totals']['summarizedSignals'] for v in r['groups']),attributions=len(r['attributions']))
    if r['quality']['completeness']=='complete':assert f['quality']['completeness']=='complete' and len(r['rows'])==r['inputNodes'] and r['attributionsComplete']
    return r


def run(top,*extra,scope=None,code=0,source=True,with_fanout=True):
    argv=[fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation.sv','register-profile.sv','statistics.sv','register-fanout.sv','register-control-sources.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--logic','--register-control-generation',*(['--register-control-fanout'] if with_fanout else []),*(['--register-control-sources'] if source else []),*extra]
    v=subprocess.run(argv,capture_output=True,text=True,timeout=20);assert v.returncode==code,(argv,v.returncode,v.stdout,v.stderr)
    return verify(json.loads(v.stdout)) if source else fanout.verify(json.loads(v.stdout))


class Sources(unittest.TestCase):
    def test_alias_identity_merges_and_retains_original_events(self):
        r=run('sources_alias','--require-complete');self.assertEqual(len(r['groups']),1);v=r['groups'][0]
        self.assertEqual((len(v['nodes']),v['totals']['facts'],v['totals']['factBits'],v['totals']['coveredBits'],v['totals']['overlapBits']),(2,2,13,9,4))
        self.assertEqual(r['crossGroupBits'],0)
    def test_polarity_separates_sources_and_overlap_is_unique(self):
        r=run('sources_invert','--require-complete');self.assertEqual(len(r['groups']),2)
        self.assertEqual({v['source']['inverted'] for v in r['groups']},{False,True});self.assertEqual(r['crossGroupBits'],4)
        self.assertEqual(r['attributions'][0]['segments'],[dict(bits=dict(lsb=4,width=4),groups=[0,1])])
    def test_one_fact_can_depend_on_clock_and_reset_sources(self):
        r=run('sources_roles','--require-complete');self.assertEqual([v['totals']['facts'] for v in r['groups']],[1,1]);self.assertEqual(r['crossGroupBits'],10)
        r=run('fanout_roles','--require-complete');self.assertEqual((len(r['groups']),r['groups'][0]['totals']['facts'],r['crossGroupBits']),(1,1,0))
    def test_multilevel_paths_instances_and_terminal_classification(self):
        r=run('rg_top','--require-complete',scope='rg_top.u');self.assertEqual((r['summary']['generatedNodes'],len(r['groups']),r['crossGroupBits']),(3,2,4))
        r=run('sources_instances','--require-complete');self.assertEqual((len(r['groups']),r['groups'][0]['totals']['signals'],r['groups'][0]['totals']['coveredBits']),(1,2,8))
        for top,kind in [('profile_constant','constant'),('profile_undriven','undriven')]:self.assertEqual(run(top,'--require-complete')['groups'][0]['source']['kind'],kind)
    def test_partial_unknown_cycle_and_captured_input_domain(self):
        r=run('generation_self','--require-complete',code=4);self.assertEqual(r['groups'],[]);self.assertEqual(r['summary']['generatedNodes'],1)
        run('generation_unknown','--require-complete',scope='generation_unknown.u',code=4)
        r=run('sources_alias','--max-register-fanout-members','1','--require-complete',code=4);self.assertFalse(r['groups'][0]['membersComplete'])
        r=run('sources_roles','--max-register-fanout-origins','1','--require-complete',code=4);self.assertEqual(len(r['groups']),1)
        self.assertEqual(run('empty')['rows'],[])
    def test_post_budgets_keep_rows_and_whole_signal_attributions(self):
        for flag,top in [('rows','sources_alias'),('sources','sources_invert'),('members','sources_alias'),('segments','sources_alias'),('work','sources_alias'),('overlap-members','sources_invert')]:
            run(top,'--max-register-source-'+flag,'1','--require-complete',code=4)
        r=run('sources_invert','--max-register-source-segments','2','--require-complete',code=4);self.assertEqual(r['attributions'],[]);self.assertFalse(r['attributionsComplete'])
        r=run('sources_alias','--max-register-source-members','1','--require-complete',code=4);self.assertEqual(r['groups'][0]['totals']['coveredBits'],6)
    def test_dependencies_and_all_limit_ranges(self):
        run('sources_alias',with_fanout=False,code=2)
        legacy=run('sources_alias',source=False);self.assertEqual(legacy['algorithm'],'rtl-register-control-fanout-v1')
        run('sources_alias','--max-register-source-work','1',source=False,code=2)
        for flag in ['--register-resolved-events','--compare-register-scenarios','--compare-register-generation','--source-inventory']:run('sources_alias',flag,code=2)
        for flag,high in [('rows',10000),('sources',10000),('members',1000000),('segments',2000000),('overlap-members',1000000),('work',10000000),('millis',60000)]:
            for value in [0,high+1]:run('sources_alias','--max-register-source-'+flag,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['register-control-sources.py'])
