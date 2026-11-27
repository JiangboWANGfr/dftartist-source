"""Physical source-byte oracle and original evidence links; no new source inference."""
import hashlib,importlib.util,json,subprocess,unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_evidence',Path(__file__).with_name('source-range-evidence.py'));evidence=importlib.util.module_from_spec(spec);spec.loader.exec_module(evidence)
ROOT=evidence.ROOT;BIN=evidence.BIN
resources=[]
for f in [evidence.selection.ranges.matrix.hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(f.read_text());resources.append((s['$id'],Resource.from_contents(s)))
s=json.loads((ROOT/'sequential/source-evidence-locations-report.schema.json').read_text());Draft202012Validator.check_schema(s);validator=Draft202012Validator(s,registry=Registry().with_resources(resources))

def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    old=evidence.verify(r['analysis']);assert r['snapshotId']==old['snapshotId'] and r['scope']==old['scope'] and r['query']==old['query']
    assert r['inputFacts']==len(old['facts']) and r['inputComplete']==(old['quality']['completeness']=='complete') and r['sourcesComplete']==old['sourcesComplete']
    expected=[];keys=[]
    for i,row in enumerate(r['rows']):
        f=old['facts'][i];info=f['info'];ids=[]
        for key in [(info['signal'],'definition'),(info['process'],'statement')]:
            if key not in keys:keys.append(key)
            ids.append(keys.index(key))
        expected.append(dict(fact=i,statisticsFact=f['fact'],ref=info['ref'],inst=info['inst'],signalLocation=ids[0],processLocation=ids[1]))
    assert r['rows']==expected and [(x['ref'],x['kind']) for x in r['locations']]==keys
    assert r['missing']==sum(x['status']=='not_found' for x in r['locations'])
    for x in r['locations']:
        if x['status']=='not_found':assert 'span' not in x;continue
        span=x['span'];raw=Path(span['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==span['contentHash']
        start,end=span['start'],span['end'];assert 0<=start['offset']<end['offset']<=len(raw)
        for pos in [start,end]:
            prefix=raw[:pos['offset']];assert pos['line']==prefix.count(b'\n')+1 and pos['column']==len(prefix.rsplit(b'\n',1)[-1])+1
        tokens=raw[start['offset']:end['offset']]
        assert b'q0' in tokens or b'q1' in tokens or b'LOC_WRITE' in tokens or b'q' in tokens
        if x['kind']=='statement':assert b'always' in tokens or b'`LOC_WRITE' in tokens
    assert len(r['rows'])<=r['limits']['maxFacts'] and len(r['locations'])<=r['limits']['maxLocations'] and r['queries']<=r['limits']['maxQueries'] and r['work']<=r['limits']['maxWork']
    if r['quality']['completeness']=='complete':assert len(r['rows'])==len(old['facts']) and not r['missing'] and r['inputComplete']
    return r

def run(*extra,top='locations_top',code=0,locate=True,explain=True):
    args=[BIN,'--top',top,'--scope',top,'--recursive',*(str(ROOT/'tests'/f) for f in ['design.sv','source-evidence-locations.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--source-hierarchy-summary','--source-hierarchy-matrix','--source-hierarchy-ranges','--select-source-ranges',*(['--explain-source-ranges'] if explain else []),*(['--locate-source-evidence'] if locate else []),'--scenario','BASE','--scenario','REPEAT',*extra]
    p=subprocess.run(args,capture_output=True,text=True,timeout=35);assert p.returncode==code,(args,p.returncode,p.stdout[:1200],p.stderr)
    r=json.loads(p.stdout)
    return verify(r) if locate else evidence.verify(r)

class Locations(unittest.TestCase):
    def test_original_physical_positions_and_shared_process(self):
        r=run('--require-complete');self.assertEqual((len(r['rows']),len(r['locations']),r['queries'],r['work'],r['missing']),(4,6,7,12,0))
        self.assertEqual(r['rows'][0]['processLocation'],r['rows'][1]['processLocation']);self.assertNotEqual(r['rows'][0]['processLocation'],r['rows'][2]['processLocation'])
        a,b=[r['locations'][r['rows'][i]['processLocation']] for i in [0,2]];self.assertNotEqual(a['ref'],b['ref']);self.assertEqual(a['span'],b['span'])
    def test_macro_source_is_physical_invocation(self):
        r=run('--require-complete',top='locations_macro');self.assertEqual(len(r['rows']),1)
        span=r['locations'][r['rows'][0]['processLocation']]['span'];tokens=Path(span['path']).read_bytes()[span['start']['offset']:span['end']['offset']];self.assertIn(b'`LOC_WRITE',tokens)
    def test_atomic_caps_and_exact_limits(self):
        r=run('--max-source-location-facts','1','--require-complete',code=4);self.assertEqual((len(r['rows']),len(r['locations'])),(1,2))
        for key,value in [('locations','1'),('queries','2'),('work','2')]:
            r=run('--max-source-location-'+key,value,'--require-complete',code=4);self.assertEqual((len(r['rows']),len(r['locations']),r['missing']),(0,0,0))
        run('--max-source-location-facts','4','--max-source-location-locations','6','--max-source-location-queries','7','--max-source-location-work','12','--require-complete')
        r=run('--max-source-location-locations','3','--require-complete',code=4);self.assertEqual((len(r['rows']),len(r['locations']),r['queries']),(2,3,4))
    def test_selection_and_original_partial(self):
        r=run('--select-node','locations_top.left','--require-complete');self.assertEqual(len(r['rows']),2)
        r=run('--max-source-evidence-rows','1','--require-complete',code=4);self.assertFalse(r['inputComplete'])
        r=run('--max-source-hierarchy-range-work','1','--require-complete',code=4);self.assertEqual((r['rows'],r['locations'],r['queries'],r['work']),([],[],1,0))
        r=run('--require-complete',top='empty');self.assertEqual((r['rows'],r['locations'],r['queries'],r['work']),([],[],1,0))
    def test_dependency_budgets_and_legacy(self):
        run(explain=False,code=2);run('--max-source-location-queries','1',locate=False,code=2)
        self.assertEqual(run(locate=False)['algorithm'],'rtl-register-source-range-evidence-v1')
        for key,cap in [('facts',200000),('locations',400000),('queries',400001),('work',10000000),('millis',60000)]:
            for value in [0,cap+1]:run('--max-source-location-'+key,str(value),code=2)

if __name__=='__main__':unittest.main(argv=['source-evidence-locations.py'])
