#!/usr/bin/env python3
"""B48 finite DESIGN7.5.6-8 oracle; handwritten RTL, public Schema only."""
import argparse,datetime,json,subprocess,time,traceback
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
names=['report','logic-report','usage-report','gates-report','values-report','scenarios-report','inventory-report','generation-report','generation-comparison-report'];resources=[];schemas=[]
for p in [P/'protocol/schema/hier.schema.json',*[P/'analysis/sequential'/(n+'.schema.json') for n in names]]:
 s=json.loads(p.read_text());resources.append((s['$id'],Resource.from_contents(s)))
 if p.name!='hier.schema.json':schemas.append(s)
registry=Registry().with_resources(resources);vs=[Draft202012Validator(s,registry=registry) for s in schemas];cases=[];calls=[]
def need(v,msg='contract assertion failed'):
 if not v:raise AssertionError(msg)
def key(v):return json.dumps(v,sort_keys=True)
def part(d):need(d['quality']['completeness']=='partial' and d['quality']['reasons'],'must retain explicit partial')
def reportmap(d):
 while 'analysis' in d:d=d['analysis']
 if 'scenarios' in d:return {i:s['report'] for i,s in enumerate(d['scenarios']) if s['status']=='reported'}
 return {None:d}
def validate(d):
 alg=d.get('algorithm');idx=next(i for i,s in enumerate(schemas) if s['$defs']['Report']['properties']['algorithm']['const']==alg);vs[idx].validate(d)
 for j,v in enumerate(vs):
  if j!=idx:need(not v.is_valid(d),'old/new strict format rejection')
 if 'analysis' in d:validate(d['analysis'])
 rs=reportmap(d)
 if 'inventories' in d:
  counts=[0,0,0]
  for inv in d['inventories']:
   r=rs[inv['scenario']];need(inv['scope']==r['scope'] and inv['snapshotId']==r['snapshot']['snapshotId']);need(inv['inputChecks']==len(r['checks']) and inv['inputFacts']==len(r['registers']));need(inv['processedChecks']<=inv['inputChecks']);need(inv['visitedEvents']<=inv['inputEvents']);need(inv['work']<=d['limits']['maxWork']);need(len(inv['groups'])<=d['limits']['maxGroups']);seen=set()
   for g in inv['groups']:
    for c in g['checks']:need(c<len(r['checks']))
    for m in g['members']:
     rec=r['registers'][m['record']];ci=rec['clockCheck'] if m['role']=='clock' else rec['asyncChecks'][m['asyncIndex']];need(ci==m['check'] and ci in g['checks'],'member original event/check');tok=(m['record'],m['role'],m['asyncIndex']);need(tok not in seen,'no lost/duplicate event identity');seen.add(tok)
   need(len(seen)<=d['limits']['maxMembers'])
   if inv['quality']['completeness']=='complete':need(len(seen)==inv['inputEvents'] and inv['visitedEvents']==inv['inputEvents'] and inv['processedChecks']==inv['inputChecks'])
   counts[0]+=len(inv['groups']);counts[1]+=len(seen);counts[2]+=len(inv['unresolved'])
  need(d['summary']==dict(inventories=len(d['inventories']),groupEntries=counts[0],memberEntries=counts[1],unresolvedChecks=counts[2]))
 if 'graphs' in d:
  for g in d['graphs']:
   r=rs[g['scenario']];need(g['snapshotId']==r['snapshot']['snapshotId'] and g['scope']==r['scope']);need(g['inputChecks']==len(r['checks']));need(len({key(n['point']) for n in g['nodes']})==len(g['nodes']),'unique full control identity');need(len({z['fact']['ref'] for z in g['generators']})==len(g['generators']))
   for s in g['seeds']:need(g['nodes'][s['node']]['point']==r['checks'][s['check']]['point'])
   for n in g['nodes']:
    if n['originalCheck'] is not None:need(n['point']==r['checks'][n['originalCheck']]['point'])
    if n['generator'] is not None:need(n['source']['kind']=='generated' and n['generator']<len(g['generators']))
   for z in g['generators']:
    page=g['registerPages'][z['lookup']['page']];need(page['response']['result']['items'][z['lookup']['item']]==z['fact'],'exact original page/item fact')
    for n in [z['clockNode'],*z['asyncNodes']]:need(n is None or n<len(g['nodes']))
    if z['expanded']:need(z['clockNode'] is not None and len(z['asyncNodes'])==len(z['fact']['async']) and all(n is not None for n in z['asyncNodes']))
   for c in g['cycles']:
    need(c['generators'][0]==c['generators'][-1] and len(c['generators'])==len(c['controls'])+1,'closed cycle')
    for j,n in enumerate(c['controls']):
     z=g['generators'][c['generators'][j]];need(n in [z['clockNode'],*z['asyncNodes']] and g['nodes'][n]['generator']==c['generators'][j+1],'cycle event/generator edges')
   for field,lim in [('work','maxWork'),('traceNodes','maxTraceNodes'),('traceEdges','maxTraceEdges'),('logicWork','maxLogicWork')]:need(g[field]<=d['limits'][lim],field+' budget')
   need(len(g['nodes'])<=d['limits']['maxControls'] and len(g['generators'])<=d['limits']['maxGenerators']);need(g['registerFacts']<=d['limits']['maxRegisterFacts'])
  need(d['summary']==dict(graphs=len(d['graphs']),nodeEntries=sum(len(g['nodes']) for g in d['graphs']),generatorEntries=sum(len(g['generators']) for g in d['graphs']),cycleEntries=sum(len(g['cycles']) for g in d['graphs'])))
 if alg=='rtl-generation-comparison-v1':
  gs={g['scenario']:g for g in d['analysis']['graphs']};cs={c['scenario']:c for c in d['contexts']};statuses=[]
  for c in d['contexts']:
   for cone in c['cones']:
    r=rs[c['scenario']];g=gs[c['scenario']];need(cone['check']<len(r['checks']))
    if cone['node'] is not None:need(g['nodes'][cone['node']]['point']==r['checks'][cone['check']]['point'])
    need(all(n<len(g['nodes']) for n in cone['nodes']))
  for z in d['comparisons']:
   need(z['baseline']==0)
   for row in z['controls']:
    statuses.append(row['status'])
    for sid,f in [(0,'baselineCone'),(z['scenario'],'scenarioCone')]:
     if row[f] is not None:need(rs[sid]['checks'][cs[sid]['cones'][row[f]]['check']]['point']==row['point'])
  s=d['summary'];need(s['rows']==len(statuses));need(all(s[k]==statuses.count(k) for k in ['changed','unchanged','unresolved']));need(s['members']==d['memberEntries']==sum(len(cone['nodes']) for c in d['contexts'] for cone in c['cones']));need(s['cones']==d['processedCones']==sum(len(c['cones']) for c in d['contexts']));need(d['processedCones']<=d['inputCones']);need(d['work']<=d['limits']['maxWork']);need(s['rows']<=d['limits']['maxRows'] and s['cones']<=d['limits']['maxCones'] and s['members']<=d['limits']['maxMembers'])
def call(top,extra=(),scope=None,code=0,logic=True):
 argv=[a.binary,'--top',top,'--scope',scope or top,str(H/'design.sv'),*(['--logic'] if logic else []),*extra];i=len(calls);start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=60);n=f'cli-{i:03d}';(O/(n+'.stdout')).write_bytes(r.stdout);(O/(n+'.stderr')).write_bytes(r.stderr);c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=n+'.stdout',stderr=n+'.stderr');calls.append(c);(O/(n+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');need(r.returncode==code,f'exit{r.returncode} expected{code}');d=json.loads(r.stdout)
 if code in [2,3,5]:need(set(d)=={'error'});vs[1].validate(d)
 else:validate(d)
 return d
def test(id):
 def deco(f):
  try:f();cases.append(dict(id=id,passed=True))
  except Exception as e:cases.append(dict(id=id,passed=False,error=str(e),traceback=traceback.format_exc()))
  return f
 return deco
def scenarios(top,field='sel',values=(0,1)):
 return [x for i,v in enumerate(values) for x in ['--scenario','CTX'+str(i),'--input-value',top+'.'+field,'0',str(v)]]
I=['--source-inventory'];G=['--control-generation'];C=[*G,'--compare-generation']
@test('I01 full identity, inversion and multi-role original events')
def _():
 d=call('H_events',I);v=d['inventories'][0];need(len(v['groups'])==2 and sum(len(g['members']) for g in v['groups'])==4);need(sorted(len(g['members']) for g in v['groups'])==[1,3]);need({g['source']['inverted'] for g in v['groups']}=={False,True})
@test('I02 constants grouped by four-state value not physical sources')
def _():
 d=call('H_consts',I+['--fail-on-error'],code=1);v=d['inventories'][0];need(len(v['groups'])==2 and sorted(len(g['members']) for g in v['groups'])==[1,2]);need({g['source']['value'] for g in v['groups']}=={'0','1'})
@test('I03 empty and separate shared-body instances')
def _():
 d=call('H_empty',I);need(d['quality']['completeness']=='complete' and d['summary']['groupEntries']==0)
 d=call('H_twins',I+['--recursive']);need(d['summary']['groupEntries']==2 and d['summary']['memberEntries']==2)
@test('I04 unknown and gated are unresolved')
def _():
 d=call('H_gate',I+['--recursive','--clock-root','H_gate.root','0']);part(d);need(d['summary']['unresolvedChecks']==1 and d['summary']['groupEntries']==0)
 d=call('H_mixed',I+['--recursive']);part(d);need(d['summary']['groupEntries']==1 and d['summary']['unresolvedChecks']==1)
@test('I05 group/member/work truncation keeps prefixes and prior findings')
def _():
 for name in ['groups','members','work']:
  d=call('H_events',I+['--max-inventory-'+name,'1','--require-complete'],code=4);part(d);v=d['inventories'][0]
  if name=='groups':need(len(v['groups'])==1 and len(v['groups'][0]['members'])>=1)
@test('I06 inventories remain separate in same snapshot scenarios')
def _():
 d=call('H_modes',I+scenarios('H_modes'),scope='H_modes.u');need(len(d['inventories'])==2 and d['summary']['groupEntries']==2 and [v['scenario'] for v in d['inventories']]==[0,1])
@test('G01 generating dependencies extend beyond scope and preserve original finding')
def _():
 d=call('H_chain',G+['--fail-on-error'],scope='H_chain.u',code=1);g=d['graphs'][0];r=reportmap(d)[None];need(len(r['checks'])==1 and len(g['generators'])==2 and len(g['nodes'])==3 and g['quality']['completeness']=='complete');need(r['scope']=='H_chain.u' and [f['rule'] for f in r['findings']]==['CLK-GEN']);need(all(z['expanded'] for z in g['generators']))
@test('G02 two writer bits never merge by signal name')
def _():
 d=call('H_bits',G,scope='H_bits.u');g=d['graphs'][0];need(len(g['generators'])==2);need({z['fact']['bits']['lsb'] for z in g['generators']}=={0,1});need(g['quality']['completeness']=='complete')
@test('G03 cycles have a closed original-event witness')
def _():
 d=call('H_cycle',G+['--require-complete'],scope='H_cycle.u',code=4);g=d['graphs'][0];part(d);need(len(g['generators'])==2 and g['cycles'])
@test('G04 independent bounded graph prefixes')
def _():
 for name,val in [('depth',0),('controls',1),('generators',1),('facts',1),('work',1),('trace-nodes',1),('logic-work',1)]:
  d=call('H_chain',G+['--max-generation-'+name,str(val),'--require-complete'],scope='H_chain.u',code=4);part(d)
@test('G05 gate context remains conditional and no Q-value inference')
def _():
 d=call('H_gate',G+['--clock-root','H_gate.root','0'],scope='H_gate.u');part(d);need(not d['graphs'][0]['generators'])
 d=call('H_chain',G+['--input-value','H_chain.root','0','0'],scope='H_chain.u');need(len(d['graphs'][0]['generators'])==2 and reportmap(d)[None]['checks'][0]['verdict']=='generated')
@test('C01 unchanged direct source, deeper source changes and return-to-baseline')
def _():
 d=call('H_modes',C+scenarios('H_modes',values=(0,1,0))+['--fail-on-error'],scope='H_modes.u',code=1);need(d['summary']['changed']==1 and d['summary']['unchanged']==1 and d['summary']['unresolved']==0);s=d['analysis']['analysis'];need(s['summary']['changed']==0 and s['summary']['unchanged']==2);need(d['quality']['completeness']=='complete')
@test('C02 async source and generator event polarity are structural')
def _():
 for top in ['H_async','H_polarity']:
  d=call(top,C+scenarios(top),scope=top+'.u');need(d['summary']['changed']==1 and d['summary']['unresolved']==0);need(d['analysis']['analysis']['summary']['unchanged']==1)
@test('C03 local complete proof survives unrelated partial')
def _():
 d=call('H_mixed',C+['--recursive',*scenarios('H_mixed','unused'),'--require-complete'],code=4);part(d);need(d['summary']['unchanged']==1 and d['summary']['unresolved']==1)
@test('C04 cycle and unexpanded generator are unresolved')
def _():
 for top,extra in [('H_cycle',[]),('H_modes',['--max-generation-depth','0'])]:
  # Cycle has no selector; two named no-value contexts suffice.
  sc=['--scenario','ONE','--scenario','TWO'] if top=='H_cycle' else scenarios(top)
  d=call(top,C+extra+sc+['--require-complete'],scope=top+'.u',code=4);part(d);need(d['summary']['unresolved']==1 and d['summary']['unchanged']==0)
@test('C05 comparison limits apply to total batch, not each context')
def _():
 for name in ['cones','members','rows','work']:
  d=call('H_twins',C+['--recursive','--scenario','ONE','--scenario','TWO','--max-generation-comparison-'+name,'1','--require-complete'],code=4);part(d)
@test('X01 invalid flags and zero/out-of-range budgets return only valid errors')
def _():
 for extra in [['--max-inventory-work','1'],I+['--max-inventory-groups','0'],I+['--max-inventory-members','1000001'],G+['--max-generation-depth','1001'],G+['--max-generation-trace-nodes','0'],['--max-generation-work','1'],['--compare-generation','--scenario','a','--scenario','b'],C,C+['--scenario','a','--scenario','b','--max-generation-comparison-rows','0'],['--max-generation-comparison-work','1']]:call('H_empty',extra,code=2)
 call('H_chain',G,logic=False,code=2)
@test('X02 combined wrappers retain original reports and partial-before-error policy')
def _():
 d=call('H_modes',I+C+scenarios('H_modes')+['--fail-on-error'],scope='H_modes.u',code=1);need(d['analysis']['analysis']['algorithm']=='rtl-control-inventory-v1');need(d['summary']['changed']==1)
 d=call('H_chain',I+G+['--max-generation-work','1','--require-complete','--fail-on-error'],scope='H_chain.u',code=4);part(d);need([f['rule'] for f in reportmap(d)[None]['findings']]==['CLK-GEN'])
summary=dict(planned=18,executed=len(cases),passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases),skipped=0,cases=cases,calls=calls);(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped']}));raise SystemExit(bool(summary['failed']))
