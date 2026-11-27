"""Resource recovery intervals, timing budgets and downstream contracts."""
import copy,json,subprocess,sys,tempfile,os,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-recovery-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
inputValidator=Draft202012Validator(next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:memory-schedule-resources-input:1'),registry=reg)
for s in schemas:Draft202012Validator.check_schema(s)
def file(name,data):
 p=OUT/name;p.write_text(json.dumps(data));return str(p)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-schedule-v1')].validate(d);return d
def edge(a,b):return dict(before=a,after=b)
def spec(edges):return dict(formatVersion=1,kind='memory-schedule-dependencies',dependencies=edges)
def waves(d):return [[e['controller'] for e in w['entries']] for w in d['schedule']['waves']]
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests']
assignments=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']]
assign=[v for a in assignments for v in ['--test-instance',a['instancePath'],a['clockDomain'],a['partition']]]
options=['--test-max-parallel','2',*assign,'--schedule-tests','--schedule-max-parallel','4','--schedule-max-power','1000000']
timing=['--time-tests','--time-wave-overhead','7',*[v for d in 'abcd' for v in ['--test-clock',d,'1000']]]

def resource(delay,domains=list('abcd'),cap=1,name='bus'):return dict(name=name,maxParallelControllers=cap,clockDomains=domains,recoveryPicoseconds=delay)
def resources(rs):return dict(formatVersion=1,kind='memory-schedule-resources',resources=rs)
config=dict(formatVersion=1,kind='memory-test-config',assignments=assignments,planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),resources=[resource(1000)]),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
def execute(cfg,name='config.json',extra=[],code=0):return call([*base,'--test-config',file(name,cfg),'--schedule-tests','--time-tests',*extra],code)
try:
 cf=file('config.json',config);rf=file('resources.json',resources(config['scheduling']['resources']));inputValidator.validate(resources(config['scheduling']['resources']))
 d=execute(config,extra=['--require-complete']);t=d['timeline'];assert (t['durationPicoseconds'],t['resourceWaitPicoseconds'],t['work'])==(84035,4000,10)
 for i,w in enumerate(t['waves']):
  assert (w['startPicoseconds'],w['durationPicoseconds'],w['endPicoseconds'])==(i*17007,16007,i*17007+16007)
  assert w.get('resourceWait')==(dict(durationPicoseconds=1000,resources=[0]) if i else None)
 via=call([*base,*options,'--schedule-resources',rf,*timing]);assert clean(via)==clean(d)
 byrule=call([*base,'--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),'--test-max-parallel','2','--schedule-tests','--schedule-max-power','1000000','--schedule-resources',rf,*timing]);assert byrule['timeline']==t
 zero=copy.deepcopy(config);zero['scheduling']['resources'][0]['recoveryPicoseconds']=0;z=execute(zero,'zero.json');assert z['timeline']['durationPicoseconds']==80035 and z['timeline']['work']==5 and 'resourceWaitPicoseconds' not in z['timeline']
 omitted=copy.deepcopy(zero);omitted['scheduling']['resources'][0].pop('recoveryPicoseconds');assert clean(execute(omitted,'omitted.json'))==clean(z)
 assert clean(d['source']['source'])==clean(z['source']['source'])
 for cap in range(1,11):
  cfg=copy.deepcopy(config);cfg['timing']['limits']=dict(maxWork=cap);x=execute(cfg,'work'+str(cap)+'.json',['--require-complete'],0 if cap==10 else 4)['timeline'];n=cap//2;assert len(x['waves'])==n and x['work']==cap and x.get('resourceWaitPicoseconds',0)==max(0,n-1)*1000
 for cap in [16006,16007,33014,84034,84035]:
  cfg=copy.deepcopy(config);cfg['timing']['policy']['maxDurationPicoseconds']=cap;x=execute(cfg,'duration'+str(cap)+'.json',['--require-complete'],0 if cap==84035 else 4)['timeline'];assert x['durationPicoseconds']<=cap
  if cap==16007:assert len(x['waves'])==1 and 'resourceWaitPicoseconds' not in x and x['stop']['reason']=='duration_limit'
 cov=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--test-coverage']);assert cov['coverage']['timedInstances']==8 and cov['coverage']['rows'][2]['timing']['startPicoseconds']==17014
 expectations=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain=q,sources=[dict(path='schedule_top.clk',bit=0,edge='posedge')]) for q in 'abcd']);xf=file('clocks.json',expectations)
 assessed=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--assess-tests',xf]);assert assessed['assessment']['verdict']=='pass'
 ff=file('zero.json',zero);compare=[*base,'--schedule-tests','--time-tests','--compare-test-config','recovery',cf,'--compare-test-config','zero',ff]
 compared=call(compare);assert compared['rows'][0]['metrics']['resourceWaitPicoseconds']==4000 and compared['rows'][0]['delta']['resourceWaitPicoseconds']==0 and compared['rows'][1]['delta']['resourceWaitPicoseconds']==-4000 and compared['rows'][1]['delta']['durationPicoseconds']==-4000
 joint=call([*compare,'--compare-clock-expectations','recovery',xf,'--compare-clock-expectations','zero',xf]);assert joint['complete'] and joint['rows'][1]['delta']==dict(satisfiedInstances=0,blockedInstances=0,pendingInstances=0)
 short=copy.deepcopy(config);short['timing']['policy']['maxDurationPicoseconds']=16007;sf=file('short.json',short)
 partial=call([*base,'--test-config',sf,'--schedule-tests','--time-tests','--test-coverage','--require-complete'],4);assert partial['coverage']['timedInstances']==2 and partial['coverage']['pendingInstances']==6 and partial['coverage']['rows'][2]['reason']=='duration_limit'
 pc=call([*base,'--schedule-tests','--time-tests','--compare-test-config','full',cf,'--compare-test-config','short',sf]);assert not pc['complete'] and 'delta' not in pc['rows'][1]
 # Independently sum earliest feasible starts from the published schedule and declarations.
 rng=random.Random(21926)
 for n in range(24):
  cfg=copy.deepcopy(config);rs=[resource(rng.choice([0,1000,30000,40000]),rng.sample(list('abcd'),rng.randrange(1,5)),rng.randrange(1,5),'r'+str(i)) for i in range(rng.randrange(1,5))];cfg['scheduling']['resources']=rs
  periods=[rng.randrange(1,5)*1000 for _ in 'abcd'];cfg['timing']['clocks']=[dict(clockDomain=q,periodPicoseconds=v) for q,v in zip('abcd',periods)]
  if n%2:cfg['scheduling']['dependencies']=[edge('a','b'),edge('b','c'),edge('c','d')]
  x=execute(cfg,'random'+str(n)+'.json');cs=x['source']['source']['plan']['controllers'];end=0;ends={};waitsum=0;work=0
  for w,sw in zip(x['timeline']['waves'],x['source']['schedule']['waves']):
   domains=[cs[e['controller']]['clockDomain'] for e in sw['entries']];used=[i for i,r in enumerate(rs) if r['recoveryPicoseconds'] and any(q in r['clockDomains'] for q in domains)];ready={i:ends[i]+rs[i]['recoveryPicoseconds'] for i in used if i in ends};start=max([end,*ready.values()]);wait=start-end;duration=7+max(cs[e['controller']]['steps'][e['step']]['cycles']*periods['abcd'.index(cs[e['controller']]['clockDomain'])] for e in sw['entries'])
   assert (w['startPicoseconds'],w['durationPicoseconds'],w['endPicoseconds'])==(start,duration,start+duration)
   assert w.get('resourceWait')==(dict(durationPicoseconds=wait,resources=[i for i in used if ready.get(i,0)>end]) if wait else None)
   end=start+duration;ends.update({i:end for i in used});waitsum+=wait;work+=len(domains)+len(used)
  assert (x['timeline']['durationPicoseconds'],x['timeline'].get('resourceWaitPicoseconds',0),x['timeline']['work'])==(end,waitsum,work)
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-recovery-design.sv'
 for n,value in enumerate([-1,1000000000001,1.5,None,True,'1000',[],{}]):
  cfg=copy.deepcopy(config);cfg['scheduling']['resources'][0]['recoveryPicoseconds']=value
  bad=file('bad-config'+str(n)+'.json',cfg);x=call([*absent,'--test-config',bad,'--schedule-tests','--time-tests'],2);assert 'absent-recovery-design' not in x['error']['message']
  bad=file('bad-resources'+str(n)+'.json',resources(cfg['scheduling']['resources']));call([*absent,*options,'--schedule-resources',bad,*timing],2)
 for name,data in [('duplicate.json',b'{"formatVersion":1,"kind":"memory-schedule-resources","resources":[{"name":"bus","maxParallelControllers":1,"clockDomains":["a"],"recoveryPicoseconds":1,"recoveryPicosecond\\u0073":2}]}'),('fraction.json',b'{"formatVersion":1,"kind":"memory-schedule-resources","resources":[{"name":"bus","maxParallelControllers":1,"clockDomains":["a"],"recoveryPicoseconds":1e-2}]}')]:
  p=OUT/name;p.write_bytes(data);call([*absent,*options,'--schedule-resources',str(p),*timing],2)
 maximum=copy.deepcopy(config);maximum['scheduling']['resources'][0]['recoveryPicoseconds']=1000000000000;assert execute(maximum,'maximum.json')['timeline']['durationPicoseconds']==4000000080035
 negatives=[]
 for change in ['zeroWait','emptyResources','extraWait','badIndex','zeroTotal']:
  x=copy.deepcopy(d)
  if change=='zeroTotal':x['timeline']['resourceWaitPicoseconds']=0
  elif change=='zeroWait':x['timeline']['waves'][1]['resourceWait']['durationPicoseconds']=0
  elif change=='emptyResources':x['timeline']['waves'][1]['resourceWait']['resources']=[]
  elif change=='extraWait':x['timeline']['waves'][1]['resourceWait']['extra']=1
  else:x['timeline']['waves'][1]['resourceWait']['resources']=[1024]
  negatives.append(x)
 for x in negatives:assert not validators['rtl-memory-test-timing-v1'].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
