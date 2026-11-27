"""Author oracle expands original matrix evidence to finite per-role bit sets and re-compresses independently."""
import importlib.util
import json
import subprocess
import unittest
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
spec=importlib.util.spec_from_file_location('author_matrix',Path(__file__).with_name('source-hierarchy-matrix.py'))
matrix=importlib.util.module_from_spec(spec);spec.loader.exec_module(matrix);ROOT=matrix.ROOT
resources=[]
for path in [matrix.hierarchy.impact.transitions.attribution.deltas.matrix.sources.fanout.gen.inv.legacy.CORE_SCHEMA,*sorted((ROOT/'sequential').glob('*schema.json'))]:
    v=json.loads(path.read_text());resources.append((v['$id'],Resource.from_contents(v)))
schema=json.loads((ROOT/'sequential/register-source-hierarchy-ranges-report.schema.json').read_text());Draft202012Validator.check_schema(schema)
validator=Draft202012Validator(schema,registry=Registry().with_resources(resources))


def canonical(bits):
    out=[]
    for bit in sorted(bits):
        if out and out[-1]['lsb']+out[-1]['width']==bit:out[-1]['width']+=1
        else:out.append(dict(lsb=bit,width=1))
    return out


def verify(r):
    validator.validate(r)
    if 'error' in r:return r
    assert not matrix.validator.is_valid(r);m=matrix.verify(r['analysis']);a=m['analysis']['analysis']['analysis']['analysis'];s=matrix.hierarchy.impact.statistics(r)
    rows=signals=ranges=members=0;stopped=False
    for ci,(c,mc) in enumerate(zip(r['comparisons'],m['comparisons'])):
        assert c['scenario']==mc['scenario'] and c['inputRows']==len(mc['rows']) and c['inputComplete']==(mc['state']=='complete') and c['sourcesComplete']==mc['sourcesComplete']
        if c['state']=='not_run':stopped=True
        else:assert not stopped
        assert [v['matrixRow'] for v in c['rows']]==list(range(len(c['rows'])))
        for row in c['rows']:
            original=mc['rows'][row['matrixRow']];expected={}
            for mi,member in enumerate(original['members']):
                old=a['comparisons'][ci]['rows'][member['row']];seg=old['segments'][member['segment']];e=expected.setdefault(old['signal'],dict(members=[],added=set(),removed=set(),retained=set()));e['members'].append(mi)
                e[member['role']].update(range(seg['bits']['lsb'],seg['bits']['lsb']+seg['bits']['width']))
            assert [v['signal'] for v in row['signals']]==sorted(expected)
            total=dict(baselineBits=0,scenarioBits=0,addedBits=0,removedBits=0,retainedBits=0)
            for signal in row['signals']:
                e=expected[signal['signal']];assert signal['signal']<len(s['signals']) and signal['members']==e['members']
                for role in ['added','removed','retained']:assert signal[role]==canonical(e[role]);ranges+=len(signal[role])
                counts=dict(baselineBits=len(e['removed']|e['retained']),scenarioBits=len(e['added']|e['retained']),addedBits=len(e['added']),removedBits=len(e['removed']),retainedBits=len(e['retained']))
                assert signal['counts']==counts
                for key,value in counts.items():total[key]+=value
                signals+=1;members+=len(signal['members'])
            assert total==original['counts'];rows+=1
        if c['state']=='complete':assert c['inputComplete'] and len(c['rows'])==len(mc['rows'])
    assert (r['rows'],r['signals'],r['ranges'],r['members'])==(rows,signals,ranges,members)
    for f,l in [('rows','maxRows'),('signals','maxSignals'),('ranges','maxRanges'),('members','maxMembers'),('work','maxWork')]:assert r[f]<=r['limits'][l]
    if r['quality']['completeness']=='complete':assert m['quality']['completeness']=='complete' and all(c['state']=='complete' for c in r['comparisons'])
    return r


def run(top='hierarchy_root',*extra,code=0,scope=None,levels=(0,1,0),ranges=True,with_matrix=True):
    argv=[matrix.BIN,'--top',top,'--scope',scope or top,'--recursive',*(str(ROOT/'tests'/n) for n in ['design.sv','generation.sv','register-generation-scenarios.sv','source-scenarios.sv','source-deltas.sv','source-attribution.sv','source-transitions.sv','source-impact.sv','source-hierarchy.sv','source-hierarchy-ranges.sv']),'--register-statistics','--register-event-groups','--register-control-profile','--register-resolved-events','--logic','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--source-hierarchy-summary',*(['--source-hierarchy-matrix'] if with_matrix else []),*(['--source-hierarchy-ranges'] if ranges else []),*extra]
    for i,level in enumerate(levels):
        argv+=['--scenario','S'+str(i)]
        if level is not None:argv+=['--input-value',top+('.mode' if top.startswith(('impact_','hierarchy_')) else '.sel'),'0',str(level)]
    p=subprocess.run(argv,capture_output=True,text=True,timeout=35);assert p.returncode in (code if isinstance(code,tuple) else (code,)),(argv,p.returncode,p.stdout,p.stderr)
    v=json.loads(p.stdout)
    if 'error' not in v and '--require-complete' in extra:assert p.returncode==(4 if v['quality']['completeness']=='partial' else 0)
    return verify(v) if ranges else matrix.verify(v)


class Ranges(unittest.TestCase):
    def test_multilevel_ranges_keep_original_signal_and_member_identity(self):
        r=run('hierarchy_root','--require-complete');self.assertEqual((r['rows'],r['signals'],r['ranges'],r['members']),(21,38,38,38));self.assertEqual(r['analysis']['analysis']['queries'],9)
        r=run('hierarchy_root','--require-complete',scope='hierarchy_root.left');self.assertEqual(len(r['comparisons'][0]['rows']),6)
    def test_adjacent_role_ranges_merge_without_losing_proof_members(self):
        r=run('ranges_adjacent','--require-complete');c=r['comparisons'][0]
        sig=next(v['signals'][0] for v in c['rows'] if v['signals'][0]['counts']['retainedBits']==8)
        self.assertEqual(sig['retained'],[dict(lsb=0,width=8)]);self.assertEqual(len(sig['members']),2)
        self.assertEqual((r['rows'],r['signals'],r['ranges'],r['members']),(5,5,5,7))
    def test_holes_and_touching_different_roles_are_not_merged(self):
        r=run('ranges_holes','--require-complete');self.assertTrue(any(v['removed']==[dict(lsb=0,width=2),dict(lsb=6,width=2)] for row in r['comparisons'][0]['rows'] for v in row['signals']))
        r=run('ranges_roles','--require-complete');self.assertTrue(all(v['counts']['addedBits']==4 and v['counts']['removedBits']==4 and not v['retained'] for row in r['comparisons'][0]['rows'] for v in row['signals']))
        run('transitions_multi_sources','--require-complete')
    def test_pair_atomic_caps_and_canonical_range_admission(self):
        full=run('hierarchy_root','--require-complete')['comparisons'][0]['rows']
        r=run('hierarchy_root','--max-source-hierarchy-range-rows','1','--require-complete',code=4);self.assertEqual(r['comparisons'][0]['rows'],full[:1]);self.assertEqual(r['comparisons'][1]['state'],'not_run')
        for flag in ['signals','ranges','members','work']:
            r=run('hierarchy_root','--max-source-hierarchy-range-'+flag,'1','--require-complete',code=4);self.assertEqual((r['rows'],r['signals'],r['ranges'],r['members']),(0,0,0,0))
        r=run('ranges_adjacent','--max-source-hierarchy-range-ranges','1','--require-complete',code=4);self.assertEqual((r['rows'],r['ranges'],r['members']),(1,1,2))
    def test_partial_empty_unknown_and_contexts(self):
        r=run('hierarchy_root','--max-source-hierarchy-matrix-rows','1','--require-complete',code=4);self.assertFalse(r['comparisons'][0]['inputComplete']);self.assertEqual(r['rows'],1)
        r=run('sources_move','--max-register-source-rows','1','--require-complete',code=4);self.assertEqual(r['rows'],0)
        self.assertEqual(run('empty','--require-complete',levels=(None,None))['rows'],0)
        run('generation_unknown','--require-complete',scope='generation_unknown.u',levels=(None,None),code=4)
        r=run('hierarchy_root','--require-complete',levels=(0,1,0,1,0,1,0,1));self.assertEqual(len(r['comparisons']),7);self.assertEqual(r['analysis']['analysis']['queries'],9)
    def test_public_empty_prefix_keeps_resource_exit_policy(self):
        for require_complete in [False,True]:
            r=run('E_wide',str(ROOT/'tests/independent-source-hierarchy/empty-prefix-wide.sv'),'--max-statistics-millis','1',*(['--require-complete'] if require_complete else []),scope='E_wide.row[3071].r',levels=(None,None),code=(0,4) if require_complete else 0)
            st=matrix.hierarchy.impact.statistics(r);h=r['analysis']['analysis']
            if not st['instances']:
                self.assertEqual(r['quality']['completeness'],'partial');self.assertNotIn('scope',h);self.assertEqual((h['queries'],r['rows'],r['signals'],r['ranges'],r['members']),(0,0,0,0,0))
    def test_dependencies_limits_and_old_matrix(self):
        run('hierarchy_root',with_matrix=False,code=2);run('hierarchy_root','--max-source-hierarchy-range-work','1',ranges=False,code=2)
        self.assertEqual(run('hierarchy_root',ranges=False)['algorithm'],'rtl-register-source-hierarchy-matrix-v1')
        for flag,hi in [('rows',100000),('signals',1000000),('ranges',2000000),('members',2000000),('work',10000000),('millis',60000)]:
            for n in [0,hi+1]:run('hierarchy_root','--max-source-hierarchy-range-'+flag,str(n),code=2)
        run('hierarchy_root','--input-value','hierarchy_root.mode','0','0',code=2)


if __name__=='__main__':unittest.main(argv=['source-hierarchy-ranges.py'])
