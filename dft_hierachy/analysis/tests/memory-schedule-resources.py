"""Resource occupancy on real controller plans, file/CLI/config/downstream equivalence."""
import copy,json,subprocess,sys,tempfile,os
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-resources-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
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
def spec(resources):return dict(formatVersion=1,kind='memory-schedule-resources',resources=resources)
def resource(name,cap,domains):return dict(name=name,maxParallelControllers=cap,clockDomains=domains)
resources=[resource('bus',1,['a','b']),resource('port',1,['a','c'])];rf=file('resources.json',spec(resources));inputValidator.validate(spec(resources))
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests']
assignments=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']]
assign=[v for a in assignments for v in ['--test-instance',a['instancePath'],a['clockDomain'],a['partition']]]
schedule=['--schedule-tests','--schedule-max-parallel','4','--schedule-max-power','1000000']
clocks=[v for d in 'abcd' for v in ['--test-clock',d,'1000']];timing=['--time-tests','--time-wave-overhead','7',*clocks]
options=['--test-max-parallel','2',*assign,*schedule];withResource=[*options,'--schedule-resources',rf]
def verify(d):
 s=d['schedule'];plan=d['source'].get('report',d['source'])['plan'];nextSteps=[0]*len(plan['controllers']);waves=[]
 for w in s['waves']:
  cs=[];power=0
  for e in w['entries']:
   ci=e['controller'];assert ci not in cs and e['step']==nextSteps[ci];nextSteps[ci]+=1;cs.append(ci);power+=plan['controllers'][ci]['steps'][e['step']]['powerMicrowatts']
  assert power==w['powerMicrowatts']<=s['request']['policy']['maxPowerMicrowatts'];assert len(cs)<=s['request']['policy']['maxParallelControllers']
  for r in s['request'].get('resources',[]):assert sum(plan['controllers'][ci]['clockDomain'] in r['clockDomains'] for ci in cs)<=r['maxParallelControllers']
  waves.append(cs)
 assert nextSteps==[c['nextStep'] for c in s['controllers']];return waves
try:
 original=call([*base,*options]);limited=call([*base,*withResource,'--require-complete']);assert verify(limited)==[[0,3],[0],[1,2]];assert limited['schedule']['work']==19;assert clean(original['source'])==clean(limited['source'])
 empty=call([*base,*options,'--schedule-resources',file('empty.json',spec([]))]);assert clean(empty)==clean(original)
 config=dict(formatVersion=1,kind='memory-test-config',assignments=assignments,planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),resources=resources),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
 cf=file('config.json',config);via=call([*base,'--test-config',cf,'--schedule-tests']);assert clean(via)==clean(limited)
 byRule=call([*base,'--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),'--test-max-parallel','2',*schedule,'--schedule-resources',rf]);assert byRule['schedule']==limited['schedule'];verify(byRule)
 timed=call([*base,*withResource,*timing]);assert timed['timeline']['durationPicoseconds']==48021 and len(timed['timeline']['waves'])==3;assert clean(timed['source'])==clean(limited)
 plainTime=call([*base,*options,*timing]);assert plainTime['timeline']['durationPicoseconds']==32014
 cfgTime=call([*base,'--test-config',cf,'--schedule-tests','--time-tests']);assert clean(timed)==clean(cfgTime)
 coverage=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--test-coverage']);assert clean(coverage['source'])==clean(timed)
 expectations=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain=d,sources=[dict(path='schedule_top.clk',bit=0,edge='posedge')]) for d in 'abcd']);ef=file('clocks.json',expectations)
 assessment=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--assess-tests',ef]);assert assessment['assessment']['verdict']=='pass' and assessment['assessment']['satisfiedInstances']==8;assert clean(assessment['source'])==clean(coverage)
 free=copy.deepcopy(config);free['scheduling'].pop('resources');ff=file('free.json',free);compare=[*base,'--schedule-tests','--time-tests','--compare-test-config','free',ff,'--compare-test-config','limited',cf]
 compared=call(compare);assert compared['rows'][1]['delta']['scheduledWaves']==1 and compared['rows'][1]['delta']['durationPicoseconds']==16007
 joint=call([*compare,'--compare-clock-expectations','free',ef,'--compare-clock-expectations','limited',ef]);assert joint['complete'] and joint['rows'][1]['delta']==dict(satisfiedInstances=0,blockedInstances=0,pendingInstances=0);assert clean(joint['source'])==clean(compared)
 for capacity in [1,2,3,4,1024]:
  path=file('capacity'+str(capacity)+'.json',spec([resource('shared',capacity,list('abcd'))]));d=call([*base,*options,'--schedule-resources',path]);assert len(verify(d))=={1:5,2:3,3:2,4:2,1024:2}[capacity]
 # A late resource conflict must not reserve the earlier available resource.
 late=[resource('first',1,['b','c']),resource('second',1,['a','b'])]
 path=file('late-conflict.json',spec(late));d=call([*base,*options,'--schedule-resources',path]);assert verify(d)==[[0,2,3],[0],[1]]
 # Reordering declarations changes resource-check order/work only, not admission.
 path=file('reverse.json',spec(resources[::-1]));d=call([*base,*options,'--schedule-resources',path]);assert verify(d)==verify(limited)
 for cap in [1,2,3,7,8,9,11,15,18,19,20]:
  d=call([*base,*withResource,'--schedule-max-work',str(cap),'--require-complete'],0 if cap>=19 else 4);verify(d);assert d['schedule']['work']==min(cap,19)
  if cap<8:assert d['schedule']['waves']==[]
  if cap==8:assert len(d['schedule']['waves'])==1
  if cap==15:assert len(d['schedule']['waves'])==2
 for power in [1,99999,100000,199999,200000,300000]:
  flags=[*options];flags[flags.index('1000000')]=str(power);d=call([*base,*flags,'--schedule-resources',rf,'--require-complete'],4 if power<200000 else 0);verify(d)
 # Input validation before missing RTL, and before all comparison cases execute.
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-resource-design.sv'
 invalid=[]
 for key,val in [('name',''),('name','x\0y'),('name','x'*4097),('maxParallelControllers',0),('maxParallelControllers',1025),('maxParallelControllers',1.5),('maxParallelControllers',True),('clockDomains',[]),('clockDomains',['a','a']),('clockDomains',['']),('clockDomains',[1])]:
  obj=spec(copy.deepcopy(resources));obj['resources'][0][key]=val;invalid.append(obj)
 obj=spec([resources[0],resources[0]]);invalid.append(obj)
 obj=spec(copy.deepcopy(resources));obj['resources'][0]['unknown']=1;invalid.append(obj)
 obj=spec([resource(str(i),1,[str(j) for j in range(1024)]) for i in range(5)]);invalid.append(obj)
 invalid.extend([spec([resource(str(i),1,['a']) for i in range(1025)]),dict(formatVersion=2,kind='memory-schedule-resources',resources=[]),dict(formatVersion=1,kind='bad',resources=[])])
 for n,obj in enumerate(invalid):
  bad=file('bad'+str(n)+'.json',obj);d=call([*absent,*options,'--schedule-resources',bad],2);assert 'absent-resource-design' not in d['error']['message']
  badconfig=copy.deepcopy(config);badconfig['scheduling']['resources']=obj.get('resources',[])
  if n<15:call([*absent,'--test-config',file('bad-config'+str(n)+'.json',badconfig),'--schedule-tests'],2)
 for name,data in [('duplicate.json',b'{"formatVersion":1,"formatVersion":1,"kind":"memory-schedule-resources","resources":[]}'),('invalid-utf8.json',b'\xff'),('large.json',b' '*(1048577)),('broken.json',b'{')]:
  p=OUT/name;p.write_bytes(data);call([*absent,*options,'--schedule-resources',str(p)],2)
 for path in [OUT,OUT/'missing.json'] :call([*absent,*options,'--schedule-resources',str(path)],2)
 fifo=OUT/'fifo';os.mkfifo(fifo);call([*absent,*options,'--schedule-resources',str(fifo)],2)
 link=OUT/'link.json';link.symlink_to(rf);linked=call([*base,*options,'--schedule-resources',str(link)]);assert clean(linked)==clean(limited)
 call([*base,'--schedule-resources',rf],2);call([*base,*options,'--schedule-resources',rf,'--schedule-resources',rf],2)
 call([*base,'--test-config',cf,'--schedule-tests','--schedule-resources',rf],2);call([*compare,'--schedule-resources',rf],2)
 badconfig=copy.deepcopy(config);badconfig['scheduling']['resources'][0]['maxParallelControllers']=0;bc=file('compare-bad.json',badconfig);call([*absent,'--schedule-tests','--time-tests','--compare-test-config','good',cf,'--compare-test-config','bad',bc],2)
 negatives=[]
 for change in ['empty','missingName','badCapacity','duplicateDomain','extra']:
  d=copy.deepcopy(limited);rows=d['schedule']['request']['resources']
  if change=='empty':rows.clear()
  elif change=='missingName':rows[0].pop('name')
  elif change=='badCapacity':rows[0]['maxParallelControllers']=0
  elif change=='duplicateDomain':rows[0]['clockDomains']=['a','a']
  else:rows[0]['extra']=1
  negatives.append(d)
 for d in negatives:assert not validators['rtl-memory-test-schedule-v1'].is_valid(d)
 for obj in invalid[:11]:assert not inputValidator.is_valid(obj)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives)+11,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
