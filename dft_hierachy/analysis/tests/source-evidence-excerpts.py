"""Independent physical-line windows, original FileRef links and unique text dictionary oracle."""
import bisect,hashlib,importlib.util,json,subprocess,unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_locations',Path(__file__).with_name('source-evidence-locations.py'));locations=importlib.util.module_from_spec(spec);spec.loader.exec_module(locations)
ROOT=locations.ROOT;BIN=locations.BIN
resources=[]
for f in [locations.evidence.selection.ranges.matrix.hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(f.read_text());resources.append((s['$id'],Resource.from_contents(s)))
s=json.loads((ROOT/'sequential/source-evidence-excerpts-report.schema.json').read_text());Draft202012Validator.check_schema(s);validator=Draft202012Validator(s,registry=Registry().with_resources(resources))

def window(raw,span,context):
    lines=raw.splitlines(keepends=True);starts=[0]
    for line in lines:starts.append(starts[-1]+len(line))
    first=bisect.bisect_right(starts,span['start']['offset'])-1;last=bisect.bisect_right(starts,span['end']['offset']-1)-1
    begin=max(0,first-context);end=min(len(lines),last+1+context)
    return starts[begin],starts[end],begin+1

def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    old=r['analysis'];locations.validator.validate(old);source=locations.evidence.verify(old['analysis'])
    assert old['snapshotId']==source['snapshotId'] and old['scope']==source['scope'] and old['query']==source['query']
    for i,row in enumerate(old['rows']):
        fact=source['facts'][i];info=fact['info'];assert row['fact']==i and row['statisticsFact']==fact['fact'] and row['ref']==info['ref'] and row['inst']==info['inst']
        for key,field,kind in [('signal','signalLocation','definition'),('process','processLocation','statement')]:
            location=old['locations'][row[field]];assert location['ref']==info[key] and location['kind']==kind
    assert r['snapshotId']==old['snapshotId'] and r['scope']==old['scope'] and r['query']==old['query']
    assert r['inputComplete']==(old['quality']['completeness']=='complete') and r['sourcesComplete']==old['sourcesComplete'] and r['inputLocations']==len(old['locations'])
    files=[];snippets=[];expected=[];keys=[];filekeys=[];raws={}
    for i,row in enumerate(r['rows']):
        original=old['locations'][i]
        if original['status']=='not_found':expected.append(dict(location=i,state='location_unavailable'));continue
        span=original['span'];raw=Path(span['path']).read_bytes();file=span['file']
        if file not in filekeys:
            filekeys.append(file);files.append(dict(file=file,path=span['path'],snapshotHash=span['contentHash'],state='read',contentHash=hashlib.sha256(raw).hexdigest(),matchesSnapshot=True));raws[file]=raw
        fi=filekeys.index(file);begin,end,line=window(raw,span,r['limits']['contextLines']);key=(fi,begin,end)
        if key not in keys:
            keys.append(key);snippets.append(dict(file=fi,startOffset=begin,endOffset=end,startLine=line,text=raw[begin:end].decode('utf-8')))
        expected.append(dict(location=i,state='available',file=fi,snippet=keys.index(key)))
    assert r['rows']==expected and r['files']==files and r['snippets']==snippets
    assert r['bytes']==sum(len(s['text'].encode('utf-8')) for s in snippets) and r['cachedBytes']==sum(len(raws[f]) for f in filekeys)
    assert r['readBytes']>=r['cachedBytes'] and r['queries']>=1+len(files)
    assert len(r['rows'])<=r['limits']['maxLocations'] and len(files)<=r['limits']['maxFiles'] and r['queries']<=r['limits']['maxQueries'] and r['bytes']<=r['limits']['maxBytes'] and r['cachedBytes']<=r['limits']['maxCachedBytes'] and r['work']<=r['limits']['maxWork']
    assert all(len(s['text'].encode('utf-8'))<=r['limits']['maxSnippetBytes'] for s in snippets)
    if r['quality']['completeness']=='complete':assert len(r['rows'])==len(old['locations']) and r['inputComplete']
    return r

def run(*extra,top='excerpt_top',code=0,excerpts=True,locate=True):
    args=[BIN,'--top',top,'--scope',top,'--recursive',*(str(ROOT/'tests'/f) for f in ['design.sv','source-evidence-locations.sv','source-evidence-excerpts.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--source-hierarchy-summary','--source-hierarchy-matrix','--source-hierarchy-ranges','--select-source-ranges','--explain-source-ranges',*(['--locate-source-evidence'] if locate else []),*(['--source-evidence-excerpts'] if excerpts else []),'--scenario','BASE','--scenario','REPEAT',*extra]
    p=subprocess.run(args,capture_output=True,text=True,timeout=35);assert p.returncode==code,(args,p.returncode,p.stdout[:1400],p.stderr)
    r=json.loads(p.stdout);return verify(r) if excerpts else (locations.validator.validate(r) or r)

class Excerpts(unittest.TestCase):
    def test_original_windows_files_and_shared_text(self):
        r=run('--source-excerpt-context-lines','0','--require-complete');self.assertEqual((len(r['rows']),len(r['files']),len(r['snippets']),r['queries']),(8,2,5,3))
        self.assertLess(len(r['snippets']),len(r['rows']))
        for context in [1,2,20]:run('--source-excerpt-context-lines',str(context),'--require-complete')
    def test_macro_window_is_physical_invocation(self):
        r=run('--source-excerpt-context-lines','0','--require-complete',top='locations_macro');texts=[s['text'] for s in r['snippets']];self.assertTrue(any('`LOC_WRITE' in s for s in texts))
    def test_atomic_budget_prefixes_and_exact_unique_bytes(self):
        base=run('--source-excerpt-context-lines','0','--require-complete')
        for key,value in [('queries',1),('bytes',1),('snippet-bytes',1),('cached-bytes',1),('work',1)]:
            r=run('--source-excerpt-context-lines','0','--max-source-excerpt-'+key,str(value),'--require-complete',code=4);self.assertEqual((r['rows'],r['files'],r['snippets'],r['bytes'],r['cachedBytes']),([],[],[],0,0))
        r=run('--source-excerpt-context-lines','0','--max-source-excerpt-locations','1','--require-complete',code=4);self.assertEqual((len(r['rows']),len(r['files']),len(r['snippets'])),(1,1,1))
        r=run('--source-excerpt-context-lines','0','--max-source-excerpt-files','1','--require-complete',code=4);self.assertEqual((len(r['files']),r['queries']),(1,2))
        run('--source-excerpt-context-lines','0','--max-source-excerpt-locations','8','--max-source-excerpt-files','2','--max-source-excerpt-queries','3','--max-source-excerpt-bytes',str(base['bytes']),'--max-source-excerpt-cached-bytes',str(base['cachedBytes']),'--max-source-excerpt-work',str(base['work']),'--require-complete')
    def test_selected_upstream_partial_and_empty(self):
        r=run('--select-node','excerpt_top.left','--require-complete');self.assertEqual((len(r['rows']),len(r['files'])),(3,1))
        r=run('--max-source-location-facts','1','--require-complete',code=4);self.assertFalse(r['inputComplete'])
        r=run('--max-source-hierarchy-range-work','1','--require-complete',code=4);self.assertEqual((r['rows'],r['files'],r['snippets'],r['queries'],r['readBytes'],r['work']),([],[],[],1,0,0))
        run('--require-complete',top='empty')
    def test_dependencies_and_invalid_limits(self):
        run(locate=False,code=2);run('--source-excerpt-context-lines','0',excerpts=False,code=2);self.assertEqual(run(excerpts=False)['algorithm'],'rtl-source-evidence-locations-v1')
        run('--source-excerpt-context-lines','21',code=2)
        for key,cap in [('locations',400000),('files',10000),('queries',10001),('bytes',16*1024*1024),('snippet-bytes',1024*1024),('cached-bytes',64*1024*1024),('work',10000000),('millis',60000)]:
            for value in [0,cap+1]:run('--max-source-excerpt-'+key,str(value),code=2)

if __name__=='__main__':unittest.main(argv=['source-evidence-excerpts.py'])
