"""Independent original-group/fact interval oracle; production does not enumerate bits."""
import importlib.util,json,subprocess,unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_selection',Path(__file__).with_name('source-range-selection.py'));selection=importlib.util.module_from_spec(spec);spec.loader.exec_module(selection)
ROOT=selection.ROOT;BIN=selection.BIN
resources=[]
for f in [selection.ranges.matrix.hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(f.read_text());resources.append((s['$id'],Resource.from_contents(s)))
s=json.loads((ROOT/'sequential/source-range-evidence-report.schema.json').read_text());Draft202012Validator.check_schema(s);validator=Draft202012Validator(s,registry=Registry().with_resources(resources))

def bitset(b):return set(range(b['lsb'],b['lsb']+b['width']))
def interval(bits):return dict(lsb=min(bits),width=len(bits))
def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    chosen=selection.verify(r['analysis']);ranges=chosen['analysis'];matrix=ranges['analysis'];ci=chosen['query']['scenario']-1;a=ranges;source=ranges
    for _ in range(5):a=a['analysis']
    for _ in range(7):source=source['analysis']
    stats=selection.ranges.matrix.hierarchy.impact.statistics(r)
    assert r['snapshotId']==stats['snapshot']['snapshotId'] and r['scope']==stats['scope'] and r['query']==chosen['query'] and r['inputRows']==len(chosen['rows'])
    assert r['inputComplete']==(chosen['quality']['completeness']=='complete') and r['sourcesComplete']==chosen['sourcesComplete']
    expected=[];facts=[];dictionary={};proofs=contexts=entries=0
    for ri,row in enumerate(chosen['rows'][:len(r['rows'])]):
        original=ranges['comparisons'][ci]['rows'][row['rangeRow']];mr=matrix['comparisons'][ci]['rows'][original['matrixRow']];state=stats['signals'][row['value']['signal']]
        value=dict(selectionRow=ri,source=source['rows'][mr['source']]['source'],node=matrix['analysis']['comparisons'][ci]['nodes'][mr['node']]['info'],owner=stats['instances'][state['instance']]['info'],signal=state['object'],proofs=[])
        for mi in row['value']['members']:
            member=mr['members'][mi];old=a['comparisons'][ci]['rows'][member['row']]['segments'][member['segment']]['bits'];piece=bitset(old)
            if 'bits' in r['query']:piece={b for b in piece if r['query']['bits']['lsb']<=b<r['query']['bits']['lsb']+r['query']['bits']['width']}
            assert piece;proof=dict(member=mi,role=member['role'],bits=interval(piece),contexts=[])
            for context in ([0] if member['role']=='removed' else [r['query']['scenario']] if member['role']=='added' else [0,r['query']['scenario']]):
                gi=source['rows'][mr['source']]['groups'][context];group=source['scenarios'][context]['sources']['groups'][gi]
                signal=next(x for x in group['signals'] if x['signal']==row['value']['signal']);cv=dict(scenario=context,group=gi,facts=[])
                for fact in signal['facts']:
                    ref=stats['facts'][fact];info=stats['pages'][ref['page']]['response']['result']['items'][ref['item']];overlap=piece&bitset(info['bits'])
                    if not overlap:continue
                    if fact not in dictionary:dictionary[fact]=len(facts);facts.append(dict(fact=fact,info=info))
                    cv['facts'].append(dict(fact=dictionary[fact],bits=interval(overlap)));entries+=1
                assert cv['facts'];proof['contexts'].append(cv);contexts+=1
            value['proofs'].append(proof);proofs+=1
        expected.append(value)
    assert r['rows']==expected and r['facts']==facts and (r['proofs'],r['contexts'],r['factEntries'])==(proofs,contexts,entries)
    assert len(r['rows'])<=r['limits']['maxRows'] and proofs<=r['limits']['maxProofs'] and entries<=r['limits']['maxFacts'] and r['work']<=r['limits']['maxWork']
    if r['quality']['completeness']=='complete':assert chosen['quality']['completeness']=='complete' and len(r['rows'])==len(chosen['rows'])
    return r

def run(top='hierarchy_root',*extra,code=0,explain=True,select=True,levels=(0,1,0)):
    args=[BIN,'--top',top,'--scope',top,'--recursive',*(str(ROOT/'tests'/f) for f in ['design.sv','source-hierarchy.sv','source-hierarchy-ranges.sv','source-range-evidence.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--source-hierarchy-summary','--source-hierarchy-matrix','--source-hierarchy-ranges',*(['--select-source-ranges'] if select else []),*(['--explain-source-ranges'] if explain else []),*extra]
    for i,level in enumerate(levels):
        args+=['--scenario','S'+str(i)]
        if level is not None:args+=['--input-value',top+('.mode' if top=='hierarchy_root' else '.sel'),'0',str(level)]
    p=subprocess.run(args,capture_output=True,text=True,timeout=35);assert p.returncode in (code if isinstance(code,tuple) else (code,)),(args,p.returncode,p.stdout[:1000],p.stderr)
    r=json.loads(p.stdout)
    if 'error' not in r and '--require-complete' in extra:assert p.returncode==(4 if r['quality']['completeness']=='partial' else 0)
    return verify(r) if explain else selection.verify(r)

class Evidence(unittest.TestCase):
    def test_original_metadata_groups_facts_and_dictionary(self):
        r=run('hierarchy_root','--require-complete');self.assertEqual((len(r['rows']),r['proofs'],r['contexts'],r['factEntries'],len(r['facts'])),(25,25,26,26,5))
        self.assertTrue(any(x['owner']['ref']!=x['node']['ref'] for x in r['rows']))
        run('hierarchy_root','--select-node','hierarchy_root.left','--select-role','removed','--require-complete')
    def test_clipped_proof_boundaries_and_shared_fact_metadata(self):
        r=run('ranges_adjacent','--select-role','retained','--select-lsb','2','--select-width','4','--require-complete');self.assertEqual((r['proofs'],r['contexts'],r['factEntries'],len(r['facts'])),(2,4,4,1))
        self.assertEqual([p['bits'] for p in r['rows'][0]['proofs']],[dict(lsb=2,width=2),dict(lsb=4,width=2)])
    def test_overlapping_writers_and_role_contexts(self):
        r=run('evidence_overlap','--select-role','retained','--select-lsb','1','--select-width','6','--require-complete');self.assertEqual((r['proofs'],r['contexts'],r['factEntries'],len(r['facts'])),(3,6,12,2))
        for role,ctx in [('added',1),('removed',0)]:
            r=run('evidence_overlap','--select-role',role,'--require-complete');self.assertEqual((r['proofs'],r['contexts'],r['factEntries'],len(r['facts'])),(1,1,1,1));self.assertEqual(r['rows'][0]['proofs'][0]['contexts'][0]['scenario'],ctx)
    def test_atomic_caps_include_new_dictionary(self):
        r=run('hierarchy_root','--max-source-evidence-rows','1','--require-complete',code=4);self.assertEqual(len(r['rows']),1)
        for key in ['proofs','facts','work']:
            r=run('ranges_adjacent','--select-role','retained','--max-source-evidence-'+key,'1','--require-complete',code=4);self.assertEqual((r['proofs'],r['contexts'],r['factEntries'],len(r['facts']),len(r['rows'])),(0,0,0,0,0))
        run('ranges_adjacent','--select-role','retained','--max-source-evidence-facts','4','--require-complete')
    def test_empty_partial_and_later_contexts(self):
        self.assertFalse(run('empty','--require-complete',levels=(None,None))['rows'])
        r=run('hierarchy_root','--max-source-selection-rows','1','--require-complete',code=4);self.assertFalse(r['inputComplete']);self.assertEqual(len(r['rows']),1)
        r=run('hierarchy_root','--max-source-hierarchy-range-work','1','--require-complete',code=4);self.assertFalse(r['rows']);self.assertFalse(r['inputComplete'])
        run('hierarchy_root','--select-scenario','2','--require-complete')
    def test_dependencies_limits_and_legacy(self):
        run(select=False,code=2);run('hierarchy_root','--max-source-evidence-work','1',explain=False,code=2)
        self.assertEqual(run(explain=False)['algorithm'],'rtl-register-source-range-selection-v1')
        for key,hi in [('rows',100000),('proofs',1000000),('facts',2000000),('work',10000000),('millis',60000)]:
            for n in [0,hi+1]:run('hierarchy_root','--max-source-evidence-'+key,str(n),code=2)

if __name__=='__main__':unittest.main(argv=['source-range-evidence.py'])
