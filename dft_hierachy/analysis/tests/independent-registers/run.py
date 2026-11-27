#!/usr/bin/env python3
"""Finite B49 oracle: manual RTL and independent small per-bit sets, no implementation reads."""
import argparse,datetime,json,subprocess,time,traceback
from pathlib import Path
from collections import Counter,defaultdict
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
resources=[];schemas=[]
for p in [P/'protocol/schema/hier.schema.json',*sorted((P/'analysis/sequential').glob('*report.schema.json'))]:
 s=json.loads(p.read_text());resources.append((s['$id'],Resource.from_contents(s)))
 if p.name!='hier.schema.json':schemas.append(s)
registry=Registry().with_resources(resources);vs=[Draft202012Validator(s,registry=registry) for s in schemas];byalg={s['$defs']['Report']['properties']['algorithm']['const']:i for i,s in enumerate(schemas)};cases=[];calls=[]
def need(v,msg='contract assertion failed'):
 if not v:raise AssertionError(msg)
def key(v):return json.dumps(v,sort_keys=True)
def partial(d):need(d['quality']['completeness']=='partial' and d['quality']['reasons'],'explicit partial and reasons')
def stats(d):
 while 'analysis' in d:d=d['analysis']
 return d
def eventreport(d):
 while d['algorithm']!='rtl-register-event-groups-v1':d=d['analysis']
 return d
def fact(s,i):
 x=s['facts'][i];return s['pages'][x['page']]['response']['result']['items'][x['item']]
def bitset(bits):
 need(0<bits['width']<=207 and bits['lsb']+bits['width']<=208,'finite own oracle domain');return range(bits['lsb'],bits['lsb']+bits['width'])
def coverage(s,indices,cov):
 counts=Counter(b for i in indices for b in bitset(fact(s,i)['bits']));need(cov['coveredBits']==len(counts) and cov['overlapBits']==sum(v>1 for v in counts.values()) and cov['maxMultiplicity']==max(counts.values(),default=0),'independent per-bit coverage')
 actual={};ordered=sorted(cov['segments'],key=lambda x:x['bits']['lsb'])
 for seg in ordered:
  for b in bitset(seg['bits']):need(b not in actual,'coverage segments do not overlap');actual[b]=seg['factCount']
 need(actual==dict(counts),'segments retain holes and true fact multiplicity')
 for l,r in zip(ordered,ordered[1:]):need(l['bits']['lsb']+l['bits']['width']!=r['bits']['lsb'] or l['factCount']!=r['factCount'],'adjacent equal multiplicity coalesced')
def totals(s,signals):
 fs=[f for x in signals for f in x['facts']];done=[x for x in signals if 'coverage' in x]
 return dict(facts=len(fs),signals=len(signals),factBits=sum(fact(s,i)['bits']['width'] for i in fs),summarizedFacts=sum(len(x['facts']) for x in done),summarizedSignals=len(done),coveredBits=sum(x['coverage']['coveredBits'] for x in done),overlapBits=sum(x['coverage']['overlapBits'] for x in done),maxMultiplicity=max((x['coverage']['maxMultiplicity'] for x in done),default=0))
def attributed(d,s,known):
 allmap=defaultdict(lambda:defaultdict(set));assigned=defaultdict(set)
 for x in d['signals']:
  if not known(x['group']):continue
  for i in x['facts']:
   assigned[x['signal']].add(i)
   for b in bitset(fact(s,i)['bits']):allmap[x['signal']][b].add(x['group'])
 eligible={i for i,x in enumerate(s['signals']) if assigned[i]==set(x['facts'])};need(d['checkedSignals']<=len(eligible),'checked only fully assigned known signal')
 for at in d['attributions']:
  si=at['signal'];need(si in eligible);groups={g for b in allmap[si].values() for g in b};need(set(at['groups'])==groups and len(groups)>1);expected={b:gs for b,gs in allmap[si].items() if len(gs)>1};actual={}
  for seg in at['segments']:
   for b in bitset(seg['bits']):need(b not in actual);actual[b]=set(seg['groups'])
  need(actual==expected and at['crossGroupBits']==len(expected),'cross-group bit sets, not excess multiplicity')
 need(d['crossGroupBits']==sum(x['crossGroupBits'] for x in d['attributions']))
 if d['quality']['completeness']=='complete':
  need(d['checkedSignals']==len(s['signals']));need({x['signal'] for x in d['attributions']}=={si for si in eligible if len({g for gs in allmap[si].values() for g in gs})>1})
def validate(d):
 if 'error' in d:vs[byalg['rtl-structural-control-v1']].validate(d);return
 i=byalg[d['algorithm']];vs[i].validate(d)
 for j,v in enumerate(vs):
  if j!=i:need(not v.is_valid(d),'strict old/new mode rejection')
 if 'analysis' in d:validate(d['analysis'])
 s=stats(d);alg=d['algorithm']
 if alg=='rtl-register-statistics-v1':
  need(d['returnedFacts']==sum(len(p['response']['result']['items']) for p in d['pages']));need(d['totals']['facts']==len(d['facts'])<=d['limits']['maxFacts']);need(d['totals']['signals']==len(d['signals'])<=d['limits']['maxSignals']);need(len(d['instances'])<=d['limits']['maxInstances']);need(d['work']<=d['limits']['maxWork'] and d['segmentCount']<=d['limits']['maxSegments'])
  for fi,f in enumerate(d['facts']):
   raw=fact(d,fi);sig=d['signals'][f['signal']];need(fi in sig['facts'] and raw['signal']==sig['object']['ref']);need(raw['inst']==d['instances'][sig['instance']]['info']['ref'])
  for si,x in enumerate(d['signals']):
   need(len(set(x['facts']))==len(x['facts']) and all(d['facts'][f]['signal']==si for f in x['facts']))
   if 'coverage' in x:coverage(d,x['facts'],x['coverage'])
  need(d['totals']==totals(d,d['signals']),'global totals independent aggregation')
  for ii,inst in enumerate(d['instances']):
   need(inst['totals']==totals(d,[x for x in d['signals'] if x['instance']==ii]));need(inst['info']['def']==d['definitions'][inst['definition']]['ref'])
  for definition in d['definitions']:
   need(definition['totals']==totals(d,[x for x in d['signals'] if x['instance'] in definition['instances']]))
 elif alg=='rtl-register-event-groups-v1':
  need(d['inputFacts']==len(s['facts']) and d['inputSignals']==len(s['signals']));need(d['processedFacts']<=min(d['inputFacts'],d['limits']['maxMembers']));need(d['work']<=d['limits']['maxWork'] and d['segmentCount']<=d['limits']['maxSegments'] and d['overlapMembers']<=d['limits']['maxOverlapMembers']);need(len(d['groups'])<=d['limits']['maxGroups']);seen=set()
  for gi,g in enumerate(d['groups']):
   need('type' not in g['clock']);ss=[d['signals'][i] for i in g['signals']];need(g['totals']==totals(s,ss))
   for x in ss:
    need(x['group']==gi)
    for f in x['facts']:
     need(f not in seen);seen.add(f);raw=fact(s,f);need(s['facts'][f]['signal']==x['signal']);need(raw['clock']==g['clock'] and raw['async']==g['async'],'original ordered event tuple')
    if 'coverage' in x:coverage(s,x['facts'],x['coverage'])
   if not g['identityComplete']:need(g['totals']['facts']==1,'unknown identities do not merge')
  need(len(seen)==d['processedFacts']);attributed(d,s,lambda g:d['groups'][g]['identityComplete']);summary=d['summary'];need(summary['groups']==len(d['groups']) and summary['members']==len(seen) and summary['groupCoveredBits']==sum(g['totals']['coveredBits'] for g in d['groups']) and summary['crossGroupBits']==d['crossGroupBits'])
 elif alg=='rtl-register-control-profile-v1':
  e=d['analysis'];need(d['snapshotId']==s['snapshot']['snapshotId'] and d['scope']==s['scope']);need(d['processedGroups']<=len(e['groups']));need(d['work']<=d['options']['maxWork'] and d['attributedFacts']<=d['options']['maxMembers'] and d['segmentCount']<=d['options']['maxSegments']);need(len(d['checks'])<=d['options']['maxChecks']);need(d['traceNodes']<=d['options']['maxTraceNodes'] and d['traceEdges']<=d['options']['maxTraceEdges'] and d['logicWork']<=d['options']['maxLogicWork'])
  for m in d['groupControls']:
   g=e['groups'][m['group']]
   for ci,ev in [(m['clockCheck'],g['clock']),*zip(m['asyncChecks'],g['async'])]:
    if ci is not None:
     p=d['checks'][ci]['control']['point'];need(p['slice']['ref']==ev['signal'] and p['slice']['bits']==ev['bits'],'profile original event point')
   if m['cohort'] is not None:need(m['group'] in d['cohorts'][m['cohort']]['groups'])
  for ci,c in enumerate(d['cohorts']):
   ss=[d['signals'][i] for i in c['signals']];need(c['totals']==totals(s,ss))
   for gi in c['groups']:
    m=next(m for m in d['groupControls'] if m['group']==gi);need(m['cohort']==ci and d['checks'][m['clockCheck']]['source']==c['source'] and e['groups'][gi]['clock']['edge']==c['edge'])
   for x in ss:
    need(x['cohort']==ci)
    if 'coverage' in x:coverage(s,x['facts'],x['coverage'])
  summary=d['summary'];need(summary['cohorts']==len(d['cohorts']) and summary['checks']==len(d['checks']) and summary['cohortCoveredBits']==sum(c['totals']['coveredBits'] for c in d['cohorts']))
 elif alg=='rtl-register-resolved-events-v1':
  p=d['analysis'];e=p['analysis'];need(d['inputRawGroups']==len(e['groups']) and d['inputFacts']==len(s['facts']));need(d['processedRawGroups']==len(d['rows'])<=d['limits']['maxRows']);need(d['assignedFacts']<=d['limits']['maxMembers']);need(d['work']<=d['limits']['maxWork'] and d['segmentCount']<=d['limits']['maxSegments'] and d['overlapMembers']<=d['limits']['maxOverlapMembers']);need(len(d['groups'])<=d['limits']['maxGroups']);need([r['rawGroup'] for r in d['rows']]==list(range(len(d['rows']))),'rows are original group prefix')
  for row in d['rows']:
   if row['resolvedGroup'] is None:need(row['reasons'])
   else:need(row['rawGroup'] in d['groups'][row['resolvedGroup']]['rawGroups'])
  for gi,g in enumerate(d['groups']):
   ss=[d['signals'][i] for i in g['signals']];need(g['totals']==totals(s,ss));need('type' not in g['clock'])
   allowed=set()
   for ri in g['rawGroups']:
    raw=e['groups'][ri];m=next(x for x in p['groupControls'] if x['group']==ri);need(g['clock']['edge']==raw['clock']['edge'] and g['clock']['source']==p['checks'][m['clockCheck']]['source']);need(len(g['async'])==len(raw['async']))
    for ev,old,check in zip(g['async'],raw['async'],m['asyncChecks']):need(ev['edge']==old['edge'] and ev['type']==old['type'] and ev['source']==p['checks'][check]['source'],'complete ordered async evidence')
    allowed.update(f for x in e['signals'] if x['group']==ri for f in x['facts'])
   for x in ss:
    need(x['group']==gi and set(x['facts'])<=allowed)
    if 'coverage' in x:coverage(s,x['facts'],x['coverage'])
  need(d['assignedFacts']==sum(len(x['facts']) for x in d['signals']));attributed(d,s,lambda g:True);summary=d['summary'];need(summary['resolvedRows']==sum(r['resolvedGroup'] is not None for r in d['rows']) and summary['unresolvedRows']==sum(r['resolvedGroup'] is None for r in d['rows']) and summary['groupCoveredBits']==sum(g['totals']['coveredBits'] for g in d['groups']))
 if 'analysis' in d and d['analysis']['quality']['completeness']=='partial':partial(d)
def call(top,flags,extra=(),scope=None,code=0,logic=False):
 argv=[a.binary,'--top',top,'--scope',scope or top,str(H/'design.sv'),*flags,*(['--logic'] if logic else []),*extra];n=f'cli-{len(calls):03d}';start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60);c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=n+'.stdout',stderr=n+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);(O/(n+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');calls.append(c);need(r.returncode==code,f'exit{r.returncode} expected{code}');d=json.loads(r.stdout);validate(d);return d
def test(id):
 def dec(f):
  try:f();cases.append(dict(id=id,passed=True))
  except Exception as e:cases.append(dict(id=id,passed=False,error=str(e),traceback=traceback.format_exc()))
  return f
 return dec
S=['--register-statistics'];E=S+['--register-event-groups'];PFLAGS=E+['--register-control-profile'];R=PFLAGS+['--register-resolved-events']
@test('S01 interval multiplicity and holes')
def _():
 d=call('R_ranges',S);t=d['totals'];need((t['facts'],t['signals'],t['factBits'],t['coveredBits'],t['overlapBits'],t['maxMultiplicity'])==(3,1,14,11,3,2))
@test('S02 parameter widths, shared definition instances and empty scope')
def _():
 d=call('R_tree',S,['--recursive']);need(len(d['instances'])==5 and d['totals']['facts']==3 and d['totals']['coveredBits']==11);need(sorted(x['coverage']['coveredBits'] for x in d['signals'])==[3,3,5]);d=call('R_tree',S);need(len(d['instances'])==1 and d['totals']['facts']==0)
@test('S03 207 original facts in two pages, adjacent coverage coalesces')
def _():
 d=call('R_pages',S);need(d['totals']['facts']==207 and d['returnedFacts']==207 and len(d['pages'])==2 and len(d['signals'])==1);need(d['totals']['coveredBits']==207 and len(d['signals'][0]['coverage']['segments'])==1)
@test('S04 empty complete and blackbox partial retain positive local facts')
def _():
 d=call('R_empty',S);need(d['quality']['completeness']=='complete' and d['totals']['coveredBits']==0)
 d=call('R_blackbox',S,['--recursive','--require-complete'],code=4);partial(d);need(d['totals']['coveredBits']==1)
@test('S05 statistics prefixes and atomic whole-signal coverage')
def _():
 for top,name in [('R_pages','facts'),('R_tree','instances'),('R_tree','signals'),('R_ranges','segments'),('R_ranges','work')]:
  d=call(top,S,['--recursive','--max-statistics-'+name,'1','--require-complete'],code=4);partial(d)
@test('E01 within-group overlap is not cross-group overlap')
def _():
 d=call('R_ranges',E);need(len(d['groups'])==2 and d['crossGroupBits']==0 and d['checkedSignals']==1 and len(d['attributions'])==1)
@test('E02 three partly overlapping raw groups count each bit once')
def _():
 d=call('R_cross',E);need(len(d['groups'])==3 and d['summary']['groupCoveredBits']==14 and d['crossGroupBits']==4 and stats(d)['totals']['coveredBits']==8)
@test('E03 instance identity, edges and original async ordering')
def _():
 d=call('R_tree',E,['--recursive']);need(len(d['groups'])==3 and d['summary']['groupCoveredBits']==11)
 d=call('R_edges',E);need(len(d['groups'])==4)
 d=call('R_order',E);need(len(d['groups'])==2 and d['groups'][0]['async']!=d['groups'][1]['async'])
@test('E04 event limits retain prefixes and do not publish false zero overlap')
def _():
 for flag in ['--max-event-groups','--max-event-group-members','--max-event-group-segments','--max-event-group-overlap-members','--max-event-group-work']:
  d=call('R_cross',E,[flag,'1','--require-complete'],code=4);partial(d)
@test('P01 aliases resolve to one clock cohort with fresh bit union')
def _():
 d=call('R_alias',PFLAGS,logic=True);need(len(d['analysis']['groups'])==2 and len(d['cohorts'])==1 and d['summary']['cohortCoveredBits']==8 and d['cohorts'][0]['totals']['overlapBits']==2)
@test('P02 reset identity and type do not split clock-only cohorts')
def _():
 for top in ['R_diffreset','R_roles']:
  d=call(top,PFLAGS,logic=True);need(len(d['analysis']['groups'])==2 and len(d['cohorts'])==1 and all(x['eventsComplete'] for x in d['groupControls']))
@test('P03 inversion and original edge do not become edge equivalence')
def _():
 d=call('R_edges',PFLAGS,logic=True);need(len(d['cohorts'])==4 and {(x['edge'],x['source']['inverted']) for x in d['cohorts']}=={('posedge',False),('negedge',False),('posedge',True),('negedge',True)})
@test('P04 static input contexts, explicit roots and gate uncertainty')
def _():
 for v in [0,1,0]:
  d=call('R_mode',PFLAGS,['--clock-root','R_mode.r0','0','--input-value','R_mode.sel','0',str(v)],logic=True);need(len(d['cohorts'])==1);need((d['cohorts'][0]['source']['point']==d['clockRoots'][0]['point'])==(v==0))
 d=call('R_gate',PFLAGS,['--clock-root','R_gate.c','0'],logic=True);partial(d);need(not d['cohorts']);d=call('R_gate',PFLAGS,['--clock-root','R_gate.c','0','--input-value','R_gate.en','0','1'],logic=True);need(len(d['cohorts'])==1)
@test('P05 source kinds and independent async unknown')
def _():
 for top,scope,kind in [('R_const',None,'constant'),('R_float',None,'undriven'),('R_generated','R_generated.u','generated')]:
  d=call(top,PFLAGS,scope=scope,logic=True);need(len(d['cohorts'])==1 and d['cohorts'][0]['source']['kind']==kind)
 d=call('R_async_unknown',PFLAGS,logic=True);partial(d);need(len(d['cohorts'])==1)
@test('P06 profile check/work/member/segment/logic budgets')
def _():
 for flag in ['--max-checks','--max-register-control-work','--max-register-control-members','--max-register-control-segments','--max-logic-work']:
  top='R_mode' if flag=='--max-logic-work' else 'R_cross'
  extra=['--input-value','R_mode.sel','0','0'] if top=='R_mode' else []
  d=call(top,PFLAGS,[flag,'1','--require-complete',*extra],code=4,logic=True);partial(d)
@test('R01 complete alias tuples merge, different async/type do not')
def _():
 d=call('R_alias',R,logic=True);need(len(d['groups'])==1 and d['summary']['groupCoveredBits']==8 and d['crossGroupBits']==0 and len(d['groups'][0]['rawGroups'])==2)
 for top in ['R_diffreset','R_roles']:
  d=call(top,R,logic=True);need(len(d['groups'])==2 and d['crossGroupBits']==2 and d['summary']['groupCoveredBits']==10)
@test('R02 full ordered async tuple and inversion/edge preserved')
def _():
 d=call('R_order',R,logic=True);need(len(d['groups'])==2)
 d=call('R_edges',R,logic=True);need(len(d['groups'])==4)
@test('R03 resolved groups count exact distinct-group bit sets')
def _():
 d=call('R_cross',R,logic=True);need(len(d['groups'])==3 and d['crossGroupBits']==4 and d['summary']['groupCoveredBits']==14 and d['checkedSignals']==1)
@test('R04 unknown async, mux and gate never borrow clock cohort proof')
def _():
 for top,extra in [('R_async_unknown',[]),('R_mode',[]),('R_gate',['--clock-root','R_gate.c','0'])]:
  d=call(top,R,extra,logic=True);partial(d);need(not d['groups'] and d['summary']['unresolvedRows']>0)
@test('R05 resolved bounded prefixes and incomplete attribution')
def _():
 for name in ['rows','groups','members','segments','overlap-members','work']:
  d=call('R_cross',R,['--max-resolved-event-'+name,'1','--require-complete'],code=4,logic=True);partial(d)
@test('X01 illegal modes, limits and missing target remain error-only')
def _():
 for flags,extra in [(S,['--logic']),(S,['--max-facts','1']),(S,['--max-statistics-facts','0']),(S,['--max-statistics-signals','100001']),([],['--max-statistics-work','1']),(['--register-event-groups'],[]),(S,['--max-event-groups','1']),(E,['--max-event-group-members','0']),(E,['--register-control-profile','--scenario','a','--scenario','b']),(PFLAGS,['--clock-usage']),(PFLAGS,['--max-register-control-work','0']),(E,['--register-resolved-events']),(PFLAGS,['--max-resolved-event-work','1']),(R,['--max-resolved-event-rows','0']),(R,['--max-resolved-event-groups','100001'])]:call('R_empty',flags,extra,code=2)
 call('R_empty',S,scope='absent',code=3)
@test('X02 strict nested schemas, fail-on-error without DRC findings')
def _():
 d=call('R_const',R,['--fail-on-error'],logic=True);need(d['algorithm']=='rtl-register-resolved-events-v1' and d['analysis']['analysis']['analysis']['algorithm']=='rtl-register-statistics-v1' and len(d['groups'])==1)
 d=call('R_blackbox',R,['--recursive','--require-complete','--fail-on-error'],code=4,logic=True);partial(d)
summary=dict(planned=22,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls);(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped']}));raise SystemExit(bool(summary['failed']))
