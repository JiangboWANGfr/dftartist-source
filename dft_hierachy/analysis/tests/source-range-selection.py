"""Independent finite-bit/window oracle over original range/proof identities."""
import importlib.util,json,subprocess,unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_ranges',Path(__file__).with_name('source-hierarchy-ranges.py'));ranges=importlib.util.module_from_spec(spec);spec.loader.exec_module(ranges)
ROOT=ranges.ROOT;BIN=ranges.matrix.BIN
resources=[]
for f in [ranges.matrix.hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    s=json.loads(f.read_text());resources.append((s['$id'],Resource.from_contents(s)))
s=json.loads((ROOT/'sequential/register-source-range-selection-report.schema.json').read_text());Draft202012Validator.check_schema(s)
validator=Draft202012Validator(s,registry=Registry().with_resources(resources))

def expected(r):
    original=r['analysis'];q=r['query'];ci=q['scenario']-1;c=original['comparisons'][ci];m=original['analysis'];a=original
    for _ in range(5):a=a['analysis']
    result=[]
    def bits(values):return {b for v in values for b in range(v['lsb'],v['lsb']+v['width'])}
    def intersect(values):
        b=bits(values)
        if 'bits' in q:return {v for v in b if q['bits']['lsb']<=v<q['bits']['lsb']+q['bits']['width']}
        return b
    for ri,row in enumerate(c['rows']):
        mr=m['comparisons'][ci]['rows'][row['matrixRow']];node=m['analysis']['comparisons'][ci]['nodes'][mr['node']]
        if 'source' in q and q['source']!=mr['source']:continue
        if 'node' in q and q['node']!=node['info']['pathText']:continue
        for si,signal in enumerate(row['signals']):
            if 'signal' in q and q['signal']!=signal['signal']:continue
            chosen={role:intersect(signal[role]) if q.get('role',role)==role else set() for role in ['added','removed','retained']}
            if not any(chosen.values()):continue
            members=[]
            for mi in signal['members']:
                member=mr['members'][mi];old=a['comparisons'][ci]['rows'][member['row']]['segments'][member['segment']]['bits']
                if intersect([old]) & chosen[member['role']]:members.append(mi)
            counts=dict(baselineBits=len(chosen['removed']|chosen['retained']),scenarioBits=len(chosen['added']|chosen['retained']),addedBits=len(chosen['added']),removedBits=len(chosen['removed']),retainedBits=len(chosen['retained']))
            result.append(dict(rangeRow=ri,rangeSignal=si,value=dict(signal=signal['signal'],**{role:ranges.canonical(v) for role,v in chosen.items()},counts=counts,members=members)))
    return result

def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    ranges.verify(r['analysis']);assert not ranges.validator.is_valid(r)
    e=expected(r);assert r['rows']==e[:len(r['rows'])]
    c=r['analysis']['comparisons'][r['query']['scenario']-1]
    assert r['inputRows']==len(c['rows']) and r['inputComplete']==(c['state']=='complete') and r['sourcesComplete']==c['sourcesComplete'] and r['visitedRows']<=r['inputRows']
    assert r['ranges']==sum(len(row['value'][role]) for row in r['rows'] for role in ['added','removed','retained']) and r['members']==sum(len(row['value']['members']) for row in r['rows'])
    assert len(r['rows'])<=r['limits']['maxRows'] and r['ranges']<=r['limits']['maxRanges'] and r['members']<=r['limits']['maxMembers'] and r['work']<=r['limits']['maxWork']
    if r['quality']['completeness']=='complete':assert r['analysis']['quality']['completeness']=='complete' and r['rows']==e and r['visitedRows']==r['inputRows']
    return r

def run(top='hierarchy_root',*extra,code=0,select=True,with_ranges=True,levels=(0,1,0)):
    args=[BIN,'--top',top,'--scope',top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','source-hierarchy.sv','source-hierarchy-ranges.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--source-hierarchy-summary','--source-hierarchy-matrix',*(['--source-hierarchy-ranges'] if with_ranges else []),*(['--select-source-ranges'] if select else []),*extra]
    for i,level in enumerate(levels):
        args+=['--scenario','S'+str(i)]
        if level is not None:args+=['--input-value',top+('.mode' if top=='hierarchy_root' else '.sel'),'0',str(level)]
    p=subprocess.run(args,capture_output=True,text=True,timeout=35);assert p.returncode in (code if isinstance(code,tuple) else (code,)),(args,p.returncode,p.stdout,p.stderr)
    r=json.loads(p.stdout)
    if 'error' not in r and '--require-complete' in extra:assert p.returncode==(4 if r['quality']['completeness']=='partial' else 0)
    return verify(r) if select else ranges.verify(r)

class Selection(unittest.TestCase):
    def test_all_signals_exact_node_and_composed_indices(self):
        r=run('hierarchy_root','--require-complete');self.assertEqual((len(r['rows']),r['ranges'],r['members']),(25,25,25))
        r=run('hierarchy_root','--select-node','hierarchy_root.left','--require-complete');self.assertEqual(len(r['rows']),4)
        one=r['rows'][0];mr=r['analysis']['analysis']['comparisons'][0]['rows'][r['analysis']['comparisons'][0]['rows'][one['rangeRow']]['matrixRow']]
        r=run('hierarchy_root','--select-node','hierarchy_root.left','--select-source-index',str(mr['source']),'--select-signal-index',str(one['value']['signal']),'--require-complete');self.assertEqual(len(r['rows']),1)
        self.assertFalse(run('hierarchy_root','--select-node','hierarchy_root.lef','--require-complete')['rows'])
    def test_window_clips_counts_and_only_intersecting_proofs(self):
        r=run('ranges_adjacent','--select-role','retained','--select-lsb','2','--select-width','4','--require-complete');self.assertEqual((r['ranges'],r['members']),(1,2));self.assertEqual(r['rows'][0]['value']['retained'],[dict(lsb=2,width=4)])
        r=run('ranges_adjacent','--select-role','retained','--select-lsb','4','--select-width','4','--require-complete');self.assertEqual((r['ranges'],r['members']),(1,1))
        self.assertFalse(run('ranges_adjacent','--select-role','retained','--select-lsb','8','--select-width','1','--require-complete')['rows'])
    def test_holes_role_boundaries_and_scenario(self):
        self.assertFalse(run('ranges_holes','--select-lsb','2','--select-width','4','--require-complete')['rows'])
        r=run('ranges_holes','--select-role','removed','--select-lsb','1','--select-width','6','--require-complete');self.assertEqual(r['rows'][0]['value']['removed'],[dict(lsb=1,width=1),dict(lsb=6,width=1)])
        r=run('ranges_roles','--select-role','added','--select-lsb','2','--select-width','4','--require-complete');self.assertTrue(all(v['value']['counts']['removedBits']==0 and v['value']['counts']['addedBits']==2 for v in r['rows']))
        self.assertEqual(len(run('hierarchy_root','--select-scenario','2','--require-complete')['rows']),13)
        run('hierarchy_root','--select-scenario','7','--require-complete',levels=(0,1,0,1,0,1,0,1))
    def test_atomic_caps_and_original_partial(self):
        r=run('hierarchy_root','--max-source-selection-rows','1','--require-complete',code=4);self.assertEqual(len(r['rows']),1)
        for top,extra in [('ranges_holes',['--max-source-selection-ranges','1']),('ranges_adjacent',['--select-role','retained','--max-source-selection-members','1']),('hierarchy_root',['--max-source-selection-work','1'])]:
            r=run(top,*extra,'--require-complete',code=4);self.assertEqual((len(r['rows']),r['ranges'],r['members']),(0,0,0))
        r=run('hierarchy_root','--max-source-hierarchy-range-rows','1','--require-complete',code=4);self.assertFalse(r['inputComplete'])
    def test_empty_partial_and_valid_no_match(self):
        self.assertFalse(run('empty','--require-complete',levels=(None,None))['rows'])
        self.assertFalse(run('hierarchy_root','--select-source-index','999','--require-complete')['rows'])
        r=run('hierarchy_root','--max-source-hierarchy-range-work','1','--select-signal-index','999','--require-complete',code=4);self.assertFalse(r['rows']);self.assertFalse(r['inputComplete'])
    def test_dependencies_invalid_query_limits_and_legacy(self):
        run(with_ranges=False,code=2);run('hierarchy_root','--select-role','added',select=False,code=2)
        self.assertEqual(run(select=False)['algorithm'],'rtl-register-source-hierarchy-ranges-v1')
        for name,hi in [('rows',100000),('ranges',2000000),('members',2000000),('work',10000000),('millis',60000)]:
            for n in [0,hi+1]:run('hierarchy_root','--max-source-selection-'+name,str(n),code=2)
        for flags in [['--select-scenario','0'],['--select-scenario','3'],['--select-scenario','8'],['--select-role','unknown'],['--select-node',''],['--select-node','\udcff'],['--select-lsb','0'],['--select-width','1'],['--select-lsb','0','--select-width','0'],['--select-lsb',str(2**64-1),'--select-width','1']]:run('hierarchy_root',*flags,code=2)
        self.assertFalse(run('hierarchy_root','--select-lsb',str(2**64-2),'--select-width','1','--require-complete')['rows'])

if __name__=='__main__':unittest.main(argv=['source-range-selection.py'])
