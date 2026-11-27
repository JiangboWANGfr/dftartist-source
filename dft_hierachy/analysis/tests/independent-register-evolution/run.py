#!/usr/bin/env python3
"""B50 finite DESIGN7.5.13-15 oracle; own RTL, public interfaces and bit-set arithmetic."""
import argparse,datetime,json,subprocess,time,traceback
from pathlib import Path
from collections import Counter
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False);res=[];schemas=[]
for p in [P/'protocol/schema/hier.schema.json',*sorted((P/'analysis/sequential').glob('*report.schema.json'))]:
 s=json.loads(p.read_text());res.append((s['$id'],Resource.from_contents(s)))
 if p.name!='hier.schema.json':schemas.append(s)
registry=Registry().with_resources(res);vs=[Draft202012Validator(s,registry=registry) for s in schemas];byalg={s['$defs']['Report']['properties']['algorithm']['const']:i for i,s in enumerate(schemas)};cases=[];calls=[]
def need(v,msg='contract assertion failed'):
 if not v:raise AssertionError(msg)
def key(x):return json.dumps(x,sort_keys=True)
def partial(d):need(d['quality']['completeness']=='partial' and d['quality']['reasons'],'partial reasons retained')
def schema(d):
 if 'error' in d:vs[byalg['rtl-structural-control-v1']].validate(d);return
 i=byalg[d['algorithm']];vs[i].validate(d)
 for j,v in enumerate(vs):
  if j!=i:need(not v.is_valid(d),'strict success mode boundary')
def statistics(d):
 while 'analysis' in d:d=d['analysis']
 return d
def fact(s,i):
 f=s['facts'][i];return s['pages'][f['page']]['response']['result']['items'][f['item']]
def coverage(s,indices,cov):
 counts=Counter()
 for i in indices:
  b=fact(s,i)['bits'];need(0<b['width']<=211 and b['lsb']+b['width']<=211,'finite own domain');counts.update(range(b['lsb'],b['lsb']+b['width']))
 actual={}
 for seg in cov['segments']:
  b=seg['bits']
  for bit in range(b['lsb'],b['lsb']+b['width']):need(bit not in actual);actual[bit]=seg['factCount']
 need(actual==dict(counts),'independent changed bit multiplicity');need(cov['coveredBits']==len(counts) and cov['overlapBits']==sum(v>1 for v in counts.values()) and cov['maxMultiplicity']==max(counts.values(),default=0))
def changed(s,comp,allowed):
 signals=comp['changedSignals'];seen=set()
 for sig in signals:
  need(len(set(sig['facts']))==len(sig['facts']))
  for f in sig['facts']:need(f in allowed and f not in seen and s['facts'][f]['signal']==sig['signal']);seen.add(f)
  if 'coverage' in sig:coverage(s,sig['facts'],sig['coverage'])
 done=[x for x in signals if 'coverage' in x];t=dict(facts=len(seen),signals=len(signals),factBits=sum(fact(s,i)['bits']['width'] for i in seen),summarizedFacts=sum(len(x['facts']) for x in done),summarizedSignals=len(done),coveredBits=sum(x['coverage']['coveredBits'] for x in done),overlapBits=sum(x['coverage']['overlapBits'] for x in done),maxMultiplicity=max((x['coverage']['maxMultiplicity'] for x in done),default=0));need(comp['changedTotals']==t,'per-comparison changed totals')
 if comp['quality']['completeness']=='complete':need(seen==allowed)
def rawFacts(events,group):return {f for x in events['signals'] if x['group']==group for f in x['facts']}
def scenes(d):
 shared=d['analysis'];schema(shared);s=statistics(shared);need(d['snapshotId']==s['snapshot']['snapshotId'] and d['scope']==s['scope']);full=[]
 for item in d['scenarios']:
  p=r=None
  if 'profile' in item:
   need('analysis' not in item['profile']);p={**item['profile'],'analysis':shared};schema(p);need(p['snapshotId']==d['snapshotId'])
  if 'resolved' in item:
   need('analysis' not in item['resolved'] and p is not None);r={**item['resolved'],'analysis':p};schema(r)
  if item['status']=='not_run':need(p is None and r is None and item['reasons'])
  elif item['status']=='profile_only':need(p is not None and r is None and item['reasons'])
  else:need(p is not None and r is not None)
  full.append((p,r))
 statuses=[];members=0;rows=0
 for c in d['comparisons']:
  need(c['baseline']==0 and c['inputGroups']==len(shared['groups']) and c['processedGroups']==len(c['rows']));need([r['rawGroup'] for r in c['rows']]==list(range(len(c['rows']))));allowed=set()
  for row in c['rows']:
   b=full[0][1];r=full[c['scenario']][1];groups=[]
   for rr,label in [(b,'baselineGroup'),(r,'scenarioGroup')]:
    original=None if rr is None else next((x['resolvedGroup'] for x in rr['rows'] if x['rawGroup']==row['rawGroup']),None);need(row[label]==original,'resolved group belongs to same rawGroup');groups.append(None if original is None else rr['groups'][original])
   if None in groups:need(row['status']=='unresolved')
   else:
    same=key([groups[0]['clock'],groups[0]['async']])==key([groups[1]['clock'],groups[1]['async']]);need(row['status']==('unchanged' if same else 'changed'),'compare proven identities, not group numbering')
   if row['status']=='changed':allowed.update(rawFacts(shared,row['rawGroup']))
   statuses.append(row['status'])
  changed(s,c,allowed);members+=sum(len(x['facts']) for x in c['changedSignals']);rows+=len(c['rows'])
 need(d['comparisonRows']==rows<=d['limits']['maxComparisons'] and d['memberFacts']==members<=d['limits']['maxMembers']);need(d['work']<=d['limits']['maxWork'] and d['segmentCount']<=d['limits']['maxSegments'])
 for name in ['changed','unchanged','unresolved']:need(d['summary'][name]==statuses.count(name))
 need(d['summary']['profiled']==sum(p is not None for p,r in full) and d['summary']['resolved']==sum(r is not None for p,r in full));return shared,full
def generation(d,p):
 g=d['graph'];events=p['analysis'];s=statistics(p);need(g['scenario'] is None and g['snapshotId']==s['snapshot']['snapshotId'] and g['scope']==s['scope']);need(g['inputChecks']==len(p['checks']));need(len({key(n['point']) for n in g['nodes']})==len(g['nodes']))
 seeds={x['check']:x['node'] for x in g['seeds']}
 for check,node in seeds.items():need(g['nodes'][node]['point']==p['checks'][check]['control']['point'])
 need(len({z['fact']['ref'] for z in g['generators']})==len(g['generators']))
 for z in g['generators']:
  page=g['registerPages'][z['lookup']['page']];need(page['response']['result']['items'][z['lookup']['item']]==z['fact'],'exact public lookup page/item')
  for n in [z['clockNode'],*z['asyncNodes']]:need(n is None or n<len(g['nodes']))
  if z['expanded']:need(z['clockNode'] is not None and len(z['asyncNodes'])==len(z['fact']['async']) and all(n is not None for n in z['asyncNodes']))
 for cy in g['cycles']:
  need(cy['generators'][0]==cy['generators'][-1] and len(cy['generators'])==len(cy['controls'])+1)
  for j,n in enumerate(cy['controls']):
   z=g['generators'][cy['generators'][j]];need(n in [z['clockNode'],*z['asyncNodes']] and g['nodes'][n]['generator']==cy['generators'][j+1])
 order=[(i,j) for i,raw in enumerate(events['groups']) for j in [None,*range(len(raw['async']))]];need(d['inputEvents']==len(order));need(len(d['events'])<=d['limits']['maxEvents'] and d['work']==len(d['events'])<=d['limits']['maxWork'])
 for row,expected in zip(d['events'],order):
  need((row['rawGroup'],row['asyncIndex'])==expected and row['role']==('clock' if expected[1] is None else 'async'),'raw-group clock-then-async prefix');m=next((x for x in p['groupControls'] if x['group']==row['rawGroup']),None);ci=None if m is None else (m['clockCheck'] if expected[1] is None else (m['asyncChecks'][expected[1]] if expected[1]<len(m['asyncChecks']) else None));need(row['check']==ci and row['node']==seeds.get(ci))
  if row['check'] is None or row['node'] is None:need(row['reasons'])
 if d['mappingComplete']:need(len(d['events'])==len(order) and all(x['check'] is not None and x['node'] is not None for x in d['events']))
 lim=d['limits']['generation'];need(len(g['nodes'])<=lim['maxControls'] and len(g['generators'])<=lim['maxGenerators']);need(g['registerFacts']<=lim['maxRegisterFacts'] and g['work']<=lim['maxWork']);need(g['traceNodes']<=lim['maxTraceNodes'] and g['traceEdges']<=lim['maxTraceEdges'] and g['logicWork']<=lim['maxLogicWork']);need(d['summary']['eventRows']==len(d['events']) and d['summary']['generators']==len(g['generators']))
 if g['quality']['completeness']=='partial' or not d['mappingComplete'] or p['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 alg=d['algorithm']
 if alg=='rtl-register-scenarios-v1':scenes(d)
 elif alg=='rtl-register-control-generation-v1':schema(d['analysis']);generation(d,d['analysis'])
 elif alg=='rtl-register-generation-scenarios-v1':
  schema(d['analysis']);shared,full=scenes(d['analysis']);s=statistics(shared);gs={}
  for item in d['scenarios']:
   if 'generation' not in item:need(item['status']=='not_run' and item['reasons']);continue
   sid=item['scenario'];need('analysis' not in item['generation'] and full[sid][0] is not None);gen={**item['generation'],'analysis':full[sid][0]};schema(gen);generation(gen,full[sid][0]);gs[sid]=gen['graph']
  structure=d['structure'];need('analysis' not in structure)
  contexts={c['scenario']:c for c in structure['contexts']}
  for c in structure['contexts']:
   for cone in c['cones']:
    need(cone['check']<len(full[c['scenario']][0]['checks']))
    for ni in cone['nodes']:need(ni<len(gs[c['scenario']]['nodes']))
    if cone['node'] is not None:need(gs[c['scenario']]['nodes'][cone['node']]['point']==full[c['scenario']][0]['checks'][cone['check']]['control']['point'])
  statuses=[];members=0;rows=0;entries=0
  for impact in d['impacts']:
   comp=next((x for x in structure['comparisons'] if x['baseline']==impact['baseline'] and x['scenario']==impact['scenario']),None);allowed=set()
   for row in impact['rows']:
    raw=shared['groups'][row['rawGroup']];evs=[raw['clock'],*raw['async']];need(len(row['events'])==len(evs),'whole-group event references atomic');sub=[]
    for idx,event in zip(row['events'],evs):
     if idx is None:sub.append('unresolved');continue
     need(comp is not None);control=comp['controls'][idx];point=control['point'];need(point['slice']['ref']==event['signal'] and point['slice']['bits']==event['bits'],'structure row for original event');sub.append(control['status'])
    expected='unresolved' if 'unresolved' in sub else ('changed' if 'changed' in sub else 'unchanged');need(row['status']==expected)
    if expected=='changed':allowed.update(rawFacts(shared,row['rawGroup']))
    statuses.append(row['status']);entries+=len(row['events'])
   changed(s,impact,allowed);rows+=len(impact['rows']);members+=sum(len(x['facts']) for x in impact['changedSignals'])
  need(d['rows']==rows<=d['limits']['maxRows'] and d['eventEntries']==entries<=d['limits']['maxEvents']);need(d['memberFacts']==members<=d['limits']['maxMembers'] and d['segmentCount']<=d['limits']['maxSegments'] and d['work']<=d['limits']['maxWork'])
  for name in ['changed','unchanged','unresolved']:need(d['summary'][name]==statuses.count(name))
def call(top,flags,extra=(),scope=None,code=0):
 argv=[a.binary,'--top',top,'--scope',scope or top,str(H/'design.sv'),*flags,*extra];n=f'cli-{len(calls):03d}';start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90);c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=n+'.stdout',stderr=n+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);(O/(n+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');calls.append(c);need(r.returncode==code,f'exit{r.returncode} expected{code}');d=json.loads(r.stdout);validate(d);return d
def test(id):
 def dec(f):
  try:f();cases.append(dict(id=id,passed=True))
  except Exception as e:cases.append(dict(id=id,passed=False,error=str(e),traceback=traceback.format_exc()))
  return f
 return dec
BASE=['--register-statistics','--register-event-groups','--register-control-profile','--logic'];S=BASE+['--register-resolved-events','--compare-register-scenarios'];G=BASE+['--register-control-generation'];D=S+['--compare-register-generation']
def sc(top,values=(0,1)):return [x for i,v in enumerate(values) for x in ['--scenario','CTX'+str(i),'--input-value',top+'.mode','0',str(v)]]
@test('S01 original-group changes and per-comparison bit union, return to baseline')
def _():
 d=call('T_direct',S,sc('T_direct',(0,1,0)),scope='T_direct.u');need(d['summary']['changed']==2 and d['summary']['unchanged']==2);t=d['comparisons'][0]['changedTotals'];need((t['facts'],t['factBits'],t['coveredBits'],t['overlapBits'])==(2,13,9,4));need(d['comparisons'][1]['changedTotals']['facts']==0)
@test('S02 resolved group numbering never substitutes for original-group identity')
def _():
 d=call('T_swap',S,sc('T_swap'),scope='T_swap.u');need(d['summary']['changed']==2)
 d=call('T_merge',S,sc('T_merge'),scope='T_merge.u');need(d['summary']['changed']==1 and d['summary']['unchanged']==1)
@test('S03 complete async and effective inversion changes')
def _():
 for top,scope in [('T_async','T_async.u'),('T_polarity',None)]:
  d=call(top,S,sc(top),scope=scope);need(d['summary']['changed']==1 and d['comparisons'][0]['changedTotals']['coveredBits']==6)
@test('S04 known local source change survives unrelated unknown')
def _():
 d=call('T_partial',S,sc('T_partial')+['--require-complete'],code=4);partial(d);need(d['summary']['changed']==1 and d['summary']['unresolved']==1 and d['comparisons'][0]['changedTotals']['coveredBits']==6)
@test('S05 direct comparison budgets and atomic signal coverage')
def _():
 for flag in ['--max-comparisons','--max-register-scenario-work','--max-register-scenario-members','--max-register-scenario-segments']:
  d=call('T_direct',S,sc('T_direct',(0,1,0))+[flag,'1','--require-complete'],scope='T_direct.u',code=4);partial(d)
@test('S06 shared two-page statistics and compact reconstructible contexts')
def _():
 d=call('T_pages',S,sc('T_pages'));need(statistics(d)['totals']['facts']==211 and len(statistics(d)['pages'])==2);need(d['comparisons'][0]['changedTotals']['coveredBits']==211)
@test('S07 empty batch, 2..8 names and UTF8 byte boundaries')
def _():
 d=call('T_empty',S,['--scenario','ONE','--scenario','TWO']);need(d['quality']['completeness']=='complete' and d['comparisonRows']==0)
 call('T_empty',S,[x for i in range(8) for x in ['--scenario',str(i)]])
 for names in [['same','same'],['only'],['名'*43,'ok'],[str(i) for i in range(9)]]:call('T_empty',S,[x for name in names for x in ['--scenario',name]],code=2)
 call('T_empty',S,['--scenario','名'*42+'ab','--scenario','ok'])
@test('G01 cross-scope clock/async network and original lookup evidence')
def _():
 d=call('T_network',G,scope='T_network.u');need(d['mappingComplete'] and d['inputEvents']==2 and len(d['graph']['generators'])==3 and d['quality']['completeness']=='complete');need([x['role'] for x in d['events']]==['clock','async'])
@test('G02 one generating fact shared by aliases, writer bits stay separate')
def _():
 d=call('T_fanout',G,scope='T_fanout.u');need(len(d['graph']['generators'])==1)
 d=call('T_bits',G,scope='T_bits.u');need(len(d['graph']['generators'])==2 and {z['fact']['bits']['lsb'] for z in d['graph']['generators']}=={0,1})
@test('G03 mapping complete is independent of proven sources or cycles')
def _():
 d=call('T_cycle',G,['--require-complete'],scope='T_cycle.u',code=4);need(d['graph']['cycles'] and d['mappingComplete']);partial(d)
 d=call('T_partial',G,['--require-complete'],code=4);need(d['mappingComplete']);partial(d)
@test('G04 graph and mapping prefixes, missing check is null with reasons')
def _():
 for flag,val in [('--max-register-generation-events',1),('--max-register-generation-work',1),('--max-checks',1),('--max-generation-depth',0),('--max-generation-controls',1),('--max-generation-generators',1),('--max-generation-facts',1)]:
  d=call('T_network',G,[flag,str(val),'--require-complete'],scope='T_network.u',code=4);partial(d)
  if flag=='--max-checks':need(any(x['check'] is None and x['node'] is None and x['reasons'] for x in d['events']))
@test('D01 same direct sources but changed deeper sources, exact impact union')
def _():
 d=call('T_deep',D,sc('T_deep',(0,1,0)),scope='T_deep.u');need(d['analysis']['summary']['changed']==0 and d['analysis']['summary']['unchanged']==4);need(d['summary']['changed']==2 and d['summary']['unchanged']==2 and d['summary']['unresolved']==0);t=d['impacts'][0]['changedTotals'];need((t['facts'],t['factBits'],t['coveredBits'],t['overlapBits'])==(2,13,9,4))
@test('D02 generating async and polarity changes preserve original direct result')
def _():
 for top in ['T_deep_async','T_deep_polarity']:
  d=call(top,D,sc(top),scope=top+'.u');need(d['analysis']['summary']['unchanged']==1 and d['summary']['changed']==1 and d['impacts'][0]['changedTotals']['coveredBits']==6)
@test('D03 identical cycles/unexpanded unknown are unresolved; local positive proof kept')
def _():
 for top,extra in [('T_cycle',[]),('T_deep',['--max-generation-depth','0'])]:
  d=call(top,D,sc(top)+extra+['--require-complete'],scope=top+'.u',code=4);partial(d);need(d['summary']['unresolved']>0 and d['summary']['unchanged']==0)
 d=call('T_partial',D,sc('T_partial')+['--require-complete'],code=4);need(d['summary']['changed']==1 and d['summary']['unresolved']==1 and d['impacts'][0]['changedTotals']['coveredBits']==6)
@test('D04 staged graph/map/cone/impact budgets, whole event group atomic')
def _():
 for flag in ['--max-generation-controls','--max-register-generation-events','--max-generation-comparison-cones','--max-register-impact-rows','--max-register-impact-work','--max-register-impact-members','--max-register-impact-segments']:
  d=call('T_deep',D,sc('T_deep')+[flag,'1','--require-complete'],scope='T_deep.u',code=4);partial(d)
 d=call('T_network',D,sc('T_network')+['--max-register-impact-events','1','--require-complete'],scope='T_network.u',code=4);need(d['rows']==0 and d['eventEntries']==0);partial(d)
@test('X01 invalid dependencies, budgets, exclusivity and missing scope')
def _():
 for flags,extra in [(BASE,['--compare-register-scenarios','--scenario','a','--scenario','b']),(G,['--register-resolved-events']),([],['--max-register-generation-work','1']),(G,['--max-register-generation-events','0']),(S,['--compare-register-generation','--register-control-generation']),(S,['--max-register-scenario-work','0']),(S,['--max-register-impact-work','1']),(D,['--max-register-impact-events','0']),(D,['--max-register-impact-rows','100001']),(D,['--max-register-impact-millis','60001'])]:call('T_empty',flags,extra,code=2)
 call('T_empty',S,['--scenario','a','--scenario','b'],scope='absent',code=3)
@test('X02 no global override and second-context error returns only Error')
def _():
 call('T_empty',S,['--input-value','T_empty.mode','0','0','--scenario','a','--scenario','b'],code=2)
 call('T_empty',S,['--scenario','a','--scenario','b','--input-value','T_empty.missing','0','0'],code=3)
 call('T_empty',D,['--scenario','a','--scenario','a'],code=2)
@test('X03 strict compact wrappers and no new finding for fail-on-error')
def _():
 call('T_empty',D,['--scenario','ONE','--scenario','TWO','--fail-on-error'])
 call('T_direct',S,sc('T_direct')+['--fail-on-error'],scope='T_direct.u')
summary=dict(planned=18,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls);(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped']}));raise SystemExit(bool(summary['failed']))
