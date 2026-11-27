"""Per-resource power ceilings, atomic scheduling and downstream contracts."""
import copy,json,subprocess,sys,tempfile,os,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-power-cli-'));calls=[]
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


def resource(power,domains=list('abcd'),cap=4,name='rail',recovery=0):return dict(name=name,maxParallelControllers=cap,clockDomains=domains,maxPowerMicrowatts=power,recoveryPicoseconds=recovery)
def spec(rs):return dict(formatVersion=1,kind='memory-schedule-resources',resources=rs)
config=dict(formatVersion=1,kind='memory-test-config',assignments=assignments,planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),resources=[resource(300000)]),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
def execute(cfg,name='config.json',extra=[],code=0):return call([*base,'--test-config',file(name,cfg),'--schedule-tests',*extra],code)
try:
 cf=file('config.json',config);rf=file('resources.json',spec(config['scheduling']['resources']));inputValidator.validate(spec(config['scheduling']['resources']));d=execute(config,extra=['--require-complete']);assert waves(d)==[[0,2],[0,3],[1]] and d['schedule']['work']==16
 via=call([*base,*options,'--schedule-resources',rf]);assert clean(via)==clean(d)
 byrule=call([*base,'--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),'--test-max-parallel','2','--schedule-tests','--schedule-max-power','1000000','--schedule-resources',rf]);assert byrule['schedule']==d['schedule']
 zero=copy.deepcopy(config);zero['scheduling']['resources'][0]['maxPowerMicrowatts']=0;z=execute(zero,'zero.json');assert waves(z)==[[0,1,2,3],[0]] and z['schedule']['work']==10 and 'maxPowerMicrowatts' not in z['schedule']['request']['resources'][0]
 omitted=copy.deepcopy(zero);omitted['scheduling']['resources'][0].pop('maxPowerMicrowatts');assert clean(execute(omitted,'omitted.json'))==clean(z);assert clean(d['source'])==clean(z['source'])
 exact=copy.deepcopy(config);exact['scheduling']['resources'][0]['maxPowerMicrowatts']=200000;x=execute(exact,'exact.json');assert waves(x)==[[0],[0],[1],[2,3]] and x['schedule']['work']==26
 blocked=copy.deepcopy(config);blocked['scheduling']['resources'][0]['maxPowerMicrowatts']=199999;bf=file('blocked.json',blocked);b=execute(blocked,'blocked.json',['--require-complete'],4);assert waves(b)==[[2],[3]] and b['schedule']['work']==10
 for c in b['schedule']['controllers'][:2]:assert c==dict(nextStep=0,status='blocked',reason='resource_power_exceeded',resource=0)
 cov=call([*base,'--test-config',bf,'--schedule-tests','--time-tests','--test-coverage','--require-complete'],4);assert cov['coverage']['blockedInstances']==6 and cov['coverage']['timedInstances']==2
 assert [v.get('reason') for v in cov['coverage']['rows']]==['resource_power_exceeded']*2+['prior_step_blocked']*2+['resource_power_exceeded']*2+[None]*2
 dep=copy.deepcopy(blocked);dep['scheduling']['dependencies']=[edge('a','b'),edge('b','c')];x=execute(dep,'dependent.json');assert waves(x)==[[3]] and x['schedule']['work']==14 and x['schedule']['controllers'][1]['reason']=='dependency_blocked' and x['schedule']['controllers'][2]['dependency']==1
 globalcap=copy.deepcopy(blocked);globalcap['scheduling']['policy']['maxPowerMicrowatts']=150000;x=execute(globalcap,'global.json');assert x['schedule']['work']==7 and x['schedule']['controllers'][0]==dict(nextStep=0,status='blocked',reason='step_power_exceeded')
 overlap=copy.deepcopy(config);overlap['scheduling']['resources']=[resource(200000,['b','d'],name='early'),resource(200000,['a','b'],name='late')];x=execute(overlap,'overlap.json');assert waves(x)==[[0,2,3],[0],[1]] and x['schedule']['work']==16
 overlap['scheduling']['resources'][1]['maxPowerMicrowatts']=100000;x=execute(overlap,'late-block.json');assert waves(x)==[[2,3]] and x['schedule']['controllers'][1]['resource']==1 and x['schedule']['work']==8
 for cap in range(1,17):
  cfg=copy.deepcopy(config);cfg['scheduling']['limits']=dict(maxWork=cap);x=execute(cfg,'work'+str(cap)+'.json',['--require-complete'],0 if cap==16 else 4);assert x['schedule']['work']==cap and len(waves(x))==(0 if cap<8 else 1 if cap<14 else 2 if cap<16 else 3)
 for cap in [7,8]:
  cfg=copy.deepcopy(blocked);cfg['scheduling']['limits']=dict(maxWork=cap);x=execute(cfg,'block-work'+str(cap)+'.json');assert ('resource' in x['schedule']['controllers'][0])==(cap==8) and len(waves(x))==(1 if cap==8 else 0)
 recovery=copy.deepcopy(config);recovery['scheduling']['resources'][0]['recoveryPicoseconds']=1000;rcf=file('recovery.json',recovery);timed=execute(recovery,'recovery.json',['--time-tests']);assert timed['timeline']['durationPicoseconds']==50021 and timed['timeline']['resourceWaitPicoseconds']==2000
 expectations=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain=q,sources=[dict(path='schedule_top.clk',bit=0,edge='posedge')]) for q in 'abcd']);xf=file('clocks.json',expectations)
 passed=call([*base,'--test-config',rcf,'--schedule-tests','--time-tests','--assess-tests',xf]);assert passed['assessment']['verdict']=='pass'
 failed=call([*base,'--test-config',bf,'--schedule-tests','--time-tests','--assess-tests',xf]);assert failed['assessment']['verdict']=='fail' and not failed['assessment']['complete'] and failed['assessment']['blockedInstances']==6
 ff=file('zero.json',zero);compare=[*base,'--schedule-tests','--time-tests','--compare-test-config','zero',ff,'--compare-test-config','limited',rcf];c=call(compare);assert c['rows'][1]['delta']['scheduledWaves']==1 and c['rows'][1]['delta']['durationPicoseconds']==18007 and c['rows'][1]['delta']['resourceWaitPicoseconds']==2000
 jc=call([*compare,'--compare-clock-expectations','zero',xf,'--compare-clock-expectations','limited',xf]);assert jc['complete'] and jc['rows'][1]['delta']==dict(satisfiedInstances=0,blockedInstances=0,pendingInstances=0)
 partial=call([*base,'--schedule-tests','--time-tests','--compare-test-config','zero',ff,'--compare-test-config','blocked',bf,'--compare-clock-expectations','zero',xf,'--compare-clock-expectations','blocked',xf]);assert not partial['complete'] and 'delta' not in partial['rows'][1]
 # Published waves independently respect all capacities and declared power sums.
 rng=random.Random(21927)
 for n in range(24):
  cfg=copy.deepcopy(config);rs=[resource(rng.choice([0,100000,150000,200000,300000,1000000000000]),rng.sample(list('abcd'),rng.randrange(1,5)),rng.choice([1,2,4]),'r'+str(i)) for i in range(rng.randrange(1,5))];cfg['scheduling']['resources']=rs;x=execute(cfg,'random'+str(n)+'.json');cs=x['source']['plan']['controllers'];seen=set()
  for w in x['schedule']['waves']:
   for e in w['entries']:assert (e['controller'],e['step']) not in seen;seen.add((e['controller'],e['step']))
   for r in rs:
    entries=[e for e in w['entries'] if cs[e['controller']]['clockDomain'] in r['clockDomains']];assert len(entries)<=r['maxParallelControllers'];power=sum(cs[e['controller']]['steps'][e['step']]['powerMicrowatts'] for e in entries);assert not r['maxPowerMicrowatts'] or power<=r['maxPowerMicrowatts']
  for ci,p in enumerate(x['schedule']['controllers']):
   if p['status']=='blocked':
    r=rs[p['resource']];assert p['reason']=='resource_power_exceeded' and cs[ci]['clockDomain'] in r['clockDomains'] and cs[ci]['steps'][p['nextStep']]['powerMicrowatts']>r['maxPowerMicrowatts']>0
   else:assert p['status']=='complete' and len([key for key in seen if key[0]==ci])==len(cs[ci]['steps'])
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-resource-power.sv'
 for n,value in enumerate([-1,1000000000001,1.5,None,True,'300000',[],{}]):
  cfg=copy.deepcopy(config);cfg['scheduling']['resources'][0]['maxPowerMicrowatts']=value;x=call([*absent,'--test-config',file('invalid-config'+str(n)+'.json',cfg),'--schedule-tests'],2);assert 'absent-resource-power' not in x['error']['message'];call([*absent,*options,'--schedule-resources',file('invalid-resource'+str(n)+'.json',spec(cfg['scheduling']['resources']))],2)
 duplicate=OUT/'duplicate.json';duplicate.write_bytes(b'{"formatVersion":1,"kind":"memory-schedule-resources","resources":[{"name":"x","maxParallelControllers":1,"clockDomains":["a"],"maxPowerMicrowatts":1,"maxPowerMicrowatt\\u0073":2}]}');call([*absent,*options,'--schedule-resources',str(duplicate)],2)
 maximum=copy.deepcopy(config);maximum['scheduling']['resources'][0]['maxPowerMicrowatts']=1000000000000;assert waves(execute(maximum,'maximum.json'))==waves(z)
 negatives=[]
 for change in ['missing','wrongIndex','extraDependency','wrongReason','pendingIndex','invalidPower']:
  x=copy.deepcopy(b);c=x['schedule']['controllers'][0]
  if change=='missing':c.pop('resource')
  elif change=='wrongIndex':c['resource']=1024
  elif change=='extraDependency':c['dependency']=0
  elif change=='wrongReason':c['reason']='step_power_exceeded'
  elif change=='pendingIndex':c['status']='pending';c.pop('reason')
  else:x['schedule']['request']['resources'][0]['maxPowerMicrowatts']=1000000000001
  negatives.append(x)
 for x in negatives:assert not validators['rtl-memory-test-schedule-v1'].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
