"""Dependency gap timing through configuration, coverage and assessment."""
import copy,json,subprocess,sys,tempfile,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-gap-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
for s in schemas:Draft202012Validator.check_schema(s)
def file(name,data):
 p=OUT/name;p.write_text(json.dumps(data));return str(p)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-timing-v1')].validate(d);return d
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests']
assignments=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']]
def edge(a,b,gap):return dict(before=a,after=b,minimumGapPicoseconds=gap)
config=dict(formatVersion=1,kind='memory-test-config',assignments=assignments,planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),dependencies=[edge('a','b',1000),edge('b','c',2000)]),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
def execute(cfg,name='config.json',extra=[],code=0):return call([*base,'--test-config',file(name,cfg),'--schedule-tests','--time-tests',*extra],code)
try:
 d=execute(config,extra=['--require-complete']);t=d['timeline'];assert t['durationPicoseconds']==67028 and t['dependencyWaitPicoseconds']==3000 and t['work']==7 and 'resourceWaitPicoseconds' not in t
 assert [w['startPicoseconds'] for w in t['waves']]==[0,16007,33014,51021]
 df=file('dependencies.json',dict(formatVersion=1,kind='memory-schedule-dependencies',dependencies=config['scheduling']['dependencies']))
 args=[*base,'--test-max-parallel','2',*[v for a in assignments for v in ['--test-instance',a['instancePath'],a['clockDomain'],'']],'--schedule-tests','--schedule-max-power','1000000','--schedule-dependencies',df,'--time-tests','--time-wave-overhead','7',*[v for q in 'abcd' for v in ['--test-clock',q,'1000']]]
 assert clean(call(args))==clean(d)
 rule=args.copy();start=rule.index('--test-instance');end=rule.index('--schedule-tests');rule[start:end]=['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')];byrule=call(rule);assert byrule['timeline']==t and byrule['source']['schedule']==d['source']['schedule']
 zero=copy.deepcopy(config)
 for e in zero['scheduling']['dependencies']:e['minimumGapPicoseconds']=0
 z=execute(zero,'zero.json');assert z['timeline']['work']==5 and z['timeline']['durationPicoseconds']==64028 and 'dependencyWaitPicoseconds' not in z['timeline'];assert clean(z['source'])==clean({**d['source'],'schedule':{**d['source']['schedule'],'request':z['source']['schedule']['request']}})
 omitted=copy.deepcopy(zero)
 for e in omitted['scheduling']['dependencies']:e.pop('minimumGapPicoseconds')
 assert clean(execute(omitted,'omitted.json'))==clean(z)
 multi=copy.deepcopy(config);multi['scheduling']['dependencies']=[edge('a','c',1000),edge('b','c',20000)];m=execute(multi,'multi.json');assert m['timeline']['durationPicoseconds']==52014 and m['timeline']['waves'][2]['dependencyWait']==dict(durationPicoseconds=3993,dependencies=[0,1])
 shared=copy.deepcopy(config);shared['scheduling']['dependencies']=[edge('b','a',1000)];shared['planning']['policy']['maxMemoriesPerController']=2;s=execute(shared,'shared.json');assert s['timeline']['work']==6 and s['timeline']['durationPicoseconds']==33014
 mixed=copy.deepcopy(config);mixed['scheduling']['resources']=[dict(name='rail',maxParallelControllers=4,clockDomains=list('abcd'),recoveryPicoseconds=1500)];mx=execute(mixed,'mixed.json');assert mx['timeline']['durationPicoseconds']==69028 and mx['timeline']['resourceWaitPicoseconds']==4500 and mx['timeline']['dependencyWaitPicoseconds']==500 and mx['timeline']['work']==11
 for cap in range(1,8):
  c=copy.deepcopy(config);c['timing']['limits']=dict(maxWork=cap);p=execute(c,'work'+str(cap)+'.json',['--require-complete'],0 if cap==7 else 4);assert p['timeline']['work']==cap and len(p['timeline']['waves'])==(0 if cap<2 else 1 if cap<3 else 2 if cap<5 else 3 if cap<7 else 4);assert p['timeline'].get('dependencyWaitPicoseconds',0)==(0 if cap<5 else 1000 if cap<7 else 3000)
 for limit in [33013,49020,67027,67028]:
  c=copy.deepcopy(config);c['timing']['policy']['maxDurationPicoseconds']=limit;p=execute(c,'duration'+str(limit)+'.json',['--require-complete'],0 if limit==67028 else 4);assert len(p['timeline']['waves'])==(2 if limit<49021 else 3 if limit<67028 else 4)
 cov=execute(config,'config.json',['--test-coverage']);assert cov['coverage']['timedInstances']==8 and cov['coverage']['rows'][4]['timing']['startPicoseconds']==33021 and cov['coverage']['rows'][6]['timing']['startPicoseconds']==51028
 xf=file('clocks.json',dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain=q,sources=[dict(path='schedule_top.clk',bit=0,edge='posedge')]) for q in 'abcd']))
 ass=execute(config,'config.json',['--assess-tests',xf]);assert ass['assessment']['verdict']=='pass' and ass['assessment']['complete']
 blocked=copy.deepcopy(config);blocked['scheduling']['resources']=[dict(name='block',maxParallelControllers=4,clockDomains=['a'],maxPowerMicrowatts=1)];bl=execute(blocked,'blocked.json',['--assess-tests',xf]);assert bl['assessment']['verdict']=='fail' and not bl['assessment']['complete']
 cf=file('config.json',config);zf=file('zero.json',zero);cmp=[*base,'--schedule-tests','--time-tests','--compare-test-config','zero',zf,'--compare-test-config','gap',cf];c=call(cmp);assert c['rows'][1]['delta']['dependencyWaitPicoseconds']==3000 and 'dependencyWaitPicoseconds' not in c['rows'][0]['delta'];rev=call([*base,'--schedule-tests','--time-tests','--compare-test-config','gap',cf,'--compare-test-config','zero',zf]);assert rev['rows'][0]['delta']['dependencyWaitPicoseconds']==0 and rev['rows'][1]['delta']['dependencyWaitPicoseconds']==-3000
 joint=call([*cmp,'--compare-clock-expectations','zero',xf,'--compare-clock-expectations','gap',xf]);assert joint['complete'] and joint['rows'][1]['delta']==dict(satisfiedInstances=0,blockedInstances=0,pendingInstances=0)
 pc=copy.deepcopy(config);pc['timing']['limits']=dict(maxWork=4);partial=call([*base,'--schedule-tests','--time-tests','--compare-test-config','zero',zf,'--compare-test-config','partial',file('partial.json',pc)]);assert not partial['complete'] and 'delta' not in partial['rows'][1]
 # Independent max-plus timing from unchanged schedule/declared step cycles.
 rng=random.Random(22028)
 for case in range(24):
  c=copy.deepcopy(config);names=rng.sample(list('abcd'),4);c['scheduling']['dependencies']=[edge(names[i],names[j],rng.choice([0,1,1000,20000,100000])) for i in range(4) for j in range(i+1,4) if rng.random()<0.4];rs=[dict(name='r'+str(i),maxParallelControllers=rng.choice([1,2,4]),clockDomains=rng.sample(list('abcd'),rng.randint(1,4)),recoveryPicoseconds=rng.choice([0,500,30000])) for i in range(rng.randint(0,3))];c['scheduling']['resources']=rs
  x=execute(c,'random'+str(case)+'.json');schedule=x['source']['schedule'];controllers=x['source']['source']['plan']['controllers'];ends={};resourceEnds={};previous=0;work=0;rw=0;dw=0
  for sw,tw in zip(schedule['waves'],x['timeline']['waves']):
   domains={controllers[e['controller']]['clockDomain'] for e in sw['entries']};used=[i for i,r in enumerate(rs) if r['recoveryPicoseconds'] and domains.intersection(r['clockDomains'])];edges=[i for i,e in enumerate(c['scheduling']['dependencies']) if e['minimumGapPicoseconds'] and e['after'] in domains];rr={i:resourceEnds[i]+rs[i]['recoveryPicoseconds'] for i in used if i in resourceEnds};dr={i:ends[c['scheduling']['dependencies'][i]['before']]+c['scheduling']['dependencies'][i]['minimumGapPicoseconds'] for i in edges};resourceStart=max([previous,*rr.values()]);start=max([resourceStart,*dr.values()]);duration=7+max(controllers[e['controller']]['steps'][e['step']]['cycles']*1000 for e in sw['entries']);assert (tw['startPicoseconds'],tw['durationPicoseconds'],tw['endPicoseconds'])==(start,duration,start+duration)
   assert tw.get('resourceWait')==(dict(durationPicoseconds=resourceStart-previous,resources=[i for i,v in rr.items() if v>previous]) if resourceStart>previous else None)
   assert tw.get('dependencyWait')==(dict(durationPicoseconds=start-resourceStart,dependencies=[i for i,v in dr.items() if v>resourceStart]) if start>resourceStart else None)
   rw+=resourceStart-previous;dw+=start-resourceStart;previous=start+duration;work+=len(sw['entries'])+len(used)+len(edges)
   for q in domains:ends[q]=previous
   for i in used:resourceEnds[i]=previous
  assert x['timeline']['complete'] and x['timeline']['work']==work and x['timeline']['durationPicoseconds']==previous and x['timeline'].get('resourceWaitPicoseconds',0)==rw and x['timeline'].get('dependencyWaitPicoseconds',0)==dw
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-dependency-gap.sv'
 for i,v in enumerate([-1,1000000000001,1.5,None,True,'1000',[],{}]):
  c=copy.deepcopy(config);c['scheduling']['dependencies'][-1]['minimumGapPicoseconds']=v;bad=call([*absent,'--test-config',file('bad'+str(i)+'.json',c),'--schedule-tests','--time-tests'],2);assert 'absent-dependency-gap' not in bad['error']['message'];call([*absent,'--schedule-tests','--schedule-dependencies',file('bad-deps'+str(i)+'.json',dict(formatVersion=1,kind='memory-schedule-dependencies',dependencies=c['scheduling']['dependencies'])),'--time-tests'],2)
 maximum=copy.deepcopy(config);maximum['scheduling']['dependencies']=[edge('a','b',1000000000000)];hi=execute(maximum,'maximum.json');assert hi['timeline']['dependencyWaitPicoseconds']==1000000000000
 negatives=[]
 for kind in ['missing','empty','index','duplicate','zero','unknown','total']:
  x=copy.deepcopy(d);w=x['timeline']['waves'][2]['dependencyWait']
  if kind=='missing':w.pop('durationPicoseconds')
  elif kind=='empty':w['dependencies']=[]
  elif kind=='index':w['dependencies']=[4096]
  elif kind=='duplicate':w['dependencies']=[0,0]
  elif kind=='zero':w['durationPicoseconds']=0
  elif kind=='unknown':w['resources']=[0]
  else:x['timeline']['dependencyWaitPicoseconds']=-1
  negatives.append(x)
 for x in negatives:assert not validators['rtl-memory-test-timing-v1'].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
