"""Author checks use independent per-bit differences, not the endpoint sweep."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_source_matrix',Path(__file__).with_name('source-scenarios.py'))
matrix=importlib.util.module_from_spec(spec);spec.loader.exec_module(matrix);ROOT=matrix.ROOT
resources=[]
for path in [matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-deltas-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))

def bits(ranges):
    out=set();last=-1
    for r in ranges:
        assert r['width']>0 and r['lsb']>last
        out.update(range(r['lsb'],r['lsb']+r['width']));last=r['lsb']+r['width']
    return out

def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not matrix.validator.is_valid(r);a=matrix.verify(r['analysis']);n=len(a['scenarios']);contexts=[]
    for c in a['scenarios']:contexts.append(c.get('sources'))
    assert (r['inputRows'],r['inputComparisons'])==(len(a['rows']),len(a['rows'])*(n-1))
    assert [(v['matrixRow'],v['scenario']) for v in r['rows']]==[(i,j) for i in range(len(a['rows'])) for j in range(1,n)][:len(r['rows'])]
    signals=ranges=intervals=0;counts=dict(rows=len(r['rows']),changed=0,unchanged=0,unresolved=0)
    for row in r['rows']:
        source=a['rows'][row['matrixRow']];j=row['scenario'];assert row['status']==source['status'][j-1];counts[row['status']]+=1
        if row['status']=='unresolved':assert 'delta' not in row;continue
        unions=[]
        for si in [0,j]:
            gi=source['groups'][si];value=matrix.coverage(contexts[si]['groups'][gi]) if gi is not None else {};unions.append(value)
            intervals+=sum(sum(bit-1 not in bs for bit in bs) for bs in value.values())
        delta=row['delta'];assert [v['signal'] for v in delta['signals']]==sorted(set(unions[0])|set(unions[1]));total=dict(baselineBits=0,scenarioBits=0,addedBits=0,removedBits=0,retainedBits=0)
        for v in delta['signals']:
            si=v['signal'];old=unions[0].get(si,set());new=unions[1].get(si,set());added=bits(v['added']);removed=bits(v['removed']);retained=bits(v['retained'])
            assert (added,removed,retained)==(new-old,old-new,old&new)
            expected=dict(baselineBits=len(old),scenarioBits=len(new),addedBits=len(added),removedBits=len(removed),retainedBits=len(retained));assert v['counts']==expected
            for k,x in expected.items():total[k]+=x
            signals+=1;ranges+=sum(len(v[k]) for k in ['added','removed','retained'])
        assert delta['totals']==total and (row['status']=='changed')==bool(total['addedBits'] or total['removedBits'])
    assert r['summary']==counts and (r['signals'],r['ranges'],r['intervals'])==(signals,ranges,intervals)
    for field,limit in [('signals','maxSignals'),('ranges','maxRanges'),('intervals','maxIntervals'),('work','maxWork')]:assert r[field]<=r['limits'][limit]
    assert len(r['rows'])<=r['limits']['maxRows']
    if r['quality']['completeness']=='complete':assert a['quality']['completeness']=='complete' and len(r['rows'])==r['inputComparisons'] and not counts['unresolved']
    return r


def run(top,*extra,scope=None,code=0,levels=(0,1,0),delta=True,with_matrix=True):
    argv=[matrix.sources.fanout.gen.inv.legacy.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/name) for name in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation',*(['--compare-register-sources'] if with_matrix else []),*(['--source-coverage-deltas'] if delta else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+'.sel','0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=25);assert p.returncode==code,(argv,p.returncode,p.stdout,p.stderr)
    value=json.loads(p.stdout);return verify(value) if delta else matrix.verify(value)


class Deltas(unittest.TestCase):
    def test_added_removed_retained_and_returned_empty_source(self):
        r=run('sources_move','--require-complete');self.assertEqual(len(r['rows']),4)
        self.assertEqual(r['rows'][0]['delta']['totals'],dict(baselineBits=9,scenarioBits=6,addedBits=0,removedBits=3,retainedBits=6))
        self.assertEqual(r['rows'][0]['delta']['signals'][0]['removed'],[dict(lsb=1,width=3)])
        self.assertEqual(r['rows'][2]['delta']['totals']['addedBits'],7);self.assertEqual(r['rows'][3]['delta']['signals'],[])
    def test_holes_and_partial_overlap(self):
        r=run('deltas_holes','--require-complete');v=r['rows'][0]['delta']['signals'][0]
        self.assertEqual(v['removed'],[dict(lsb=3,width=6)]);self.assertEqual(v['retained'],[dict(lsb=0,width=3),dict(lsb=10,width=3)])
    def test_same_union_ignores_multiplicity_and_polarity_is_distinct(self):
        r=run('sources_multiplicity','--require-complete');self.assertTrue(all(v['delta']['totals']['addedBits']==v['delta']['totals']['removedBits']==0 for v in r['rows']))
        r=run('sources_polarity','--require-complete');self.assertEqual([r['rows'][i]['delta']['totals']['removedBits'] for i in [0,2]],[4,0]);self.assertEqual(r['rows'][2]['delta']['totals']['addedBits'],4)
    def test_deep_sources_and_partial_matrix_positive_rows(self):
        run('deep_top','--require-complete',scope='deep_top.u')
        r=run('sources_move','--max-register-source-scenario-rows','1','--require-complete',code=4);self.assertTrue(r['rows']);self.assertTrue(all('delta' in v for v in r['rows']))
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertTrue(all('delta' not in v and v['status']=='unresolved' for v in r['rows']))
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None,None),code=4)
    def test_each_budget_is_a_whole_row_prefix(self):
        for flag in ['rows','signals','ranges','intervals','work']:
            r=run('sources_move','--max-source-delta-'+flag,'1','--require-complete',code=4)
            if flag in ['ranges','intervals','work']:self.assertEqual((r['rows'],r['signals'],r['ranges'],r['intervals']),([],0,0,0))
    def test_empty_and_eight_contexts(self):
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['rows'],[])
        r=run('sources_move','--require-complete',levels=(0,1,0,1,0,1,0,1));self.assertEqual(r['inputComparisons'],14)
    def test_dependencies_limit_ranges_and_legacy_mode(self):
        run('sources_move',with_matrix=False,code=2)
        r=run('sources_move',delta=False);self.assertEqual(r['algorithm'],'rtl-register-source-scenarios-v1')
        run('sources_move','--max-source-delta-work','1',delta=False,code=2)
        for flag in ['--register-control-sources','--register-control-fanout','--source-inventory']:run('sources_move',flag,code=2)
        for flag,hi in [('rows',100000),('signals',1000000),('ranges',2000000),('intervals',2000000),('work',10000000),('millis',60000)]:
            for value in [0,hi+1]:run('sources_move','--max-source-delta-'+flag,str(value),code=2)


if __name__=='__main__':unittest.main(argv=['source-deltas.py'])
