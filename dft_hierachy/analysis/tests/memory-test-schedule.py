"""Actual controller plans to globally power-limited execution batches."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-schedule-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
for s in schemas:Draft202012Validator.check_schema(s)
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--test-max-parallel','2']
assign=[x for n in ['a0','a1','a2','a3','b0','b1','c0','d0'] for x in ['--test-instance','schedule_top.'+n,n[0],'']]
rules=['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')]
options=['--schedule-tests','--schedule-max-parallel','2','--schedule-max-power','300000']
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-schedule-v1')].validate(d);return d
def verify(d):
 s=d['schedule'];source=d['source'];report=source.get('report',source);plan=report['plan'];controllers=plan['controllers'];progress=[0]*len(controllers);memories=set();steps=power=capacity=0
 for wave in s['waves']:
  assert 1<=len(wave['entries'])<=s['request']['policy']['maxParallelControllers'];seen=set();power=0
  for e in wave['entries']:
   ci,si=e['controller'],e['step'];assert ci not in seen and si==progress[ci];seen.add(ci);progress[ci]+=1;steps+=1;ctrl=controllers[ci];step=ctrl['steps'][si];power+=step['powerMicrowatts'];model=report['investigation']['mapping']['request']['models'][ctrl['model']]
   for m in step['memories']:assert m not in memories;memories.add(m);capacity+=model['words']*model['dataBits']
  assert power==wave['powerMicrowatts']<=s['request']['policy']['maxPowerMicrowatts']
 assert (steps,len(memories),capacity)==(s['scheduledSteps'],s['scheduledInstances'],int(s['scheduledCapacityBits']))
 for ci,state in enumerate(s['controllers']):
  assert state['nextStep']==progress[ci];assert (state['status']=='complete')==(progress[ci]==len(controllers[ci]['steps']))
  if state['status']=='blocked':assert state['reason']=='step_power_exceeded' and controllers[ci]['steps'][progress[ci]]['powerMicrowatts']>s['request']['policy']['maxPowerMicrowatts']
  else:assert 'reason' not in state
 if s['complete']:assert plan['complete'] and s['reasons']==[] and all(x['status']=='complete' for x in s['controllers'])
 assert not any(x in s for x in ['cycles','runtime','duration','peakPowerMicrowatts'])
 return [[(x['controller'],x['step']) for x in w['entries']] for w in s['waves']]
try:
 originals=[]
 for allocation in [assign,rules]:
  original=call([*base,*allocation]);d=call([*base,*allocation,*options,'--require-complete']);assert clean(d['source'])==clean(original);originals.append(d);assert verify(d)==[[(0,0),(2,0)],[(0,1),(3,0)],[(1,0)]];assert d['schedule']['work']==7
 assert originals[0]['schedule']==originals[1]['schedule'];original=originals[0]
 for parallel in [1,2,4]:
  for power in [1,99999,100000,199999,200000,300000,500000]:
   d=call([*base,*assign,'--schedule-tests','--schedule-max-parallel',str(parallel),'--schedule-max-power',str(power),'--require-complete'],0 if power>=200000 else 4);verify(d)
   if power<100000:assert not d['schedule']['waves'] and d['schedule']['work']==4
   elif power<200000:assert d['schedule']['scheduledInstances']==2
   else:assert d['schedule']['scheduledInstances']==8 and d['schedule']['scheduledSteps']==5
 for work in [1,2,3,4,6,7,8]:
  d=call([*base,*assign,*options,'--schedule-max-work',str(work),'--require-complete'],0 if work>=7 else 4);verify(d)
  if work<3:assert d['schedule']['waves']==[] and all(c['nextStep']==0 for c in d['schedule']['controllers'])
  if work==3:assert d['schedule']['scheduledInstances']==3 and len(d['schedule']['waves'])==1
 for waves in [1,2,3,4]:
  d=call([*base,*rules,*options,'--schedule-max-waves',str(waves),'--require-complete'],0 if waves>=3 else 4);verify(d);assert len(d['schedule']['waves'])==min(waves,3)
 for flags in [['--test-max-work','2'],['--max-macros','2'],['--map-max-macros','2']]:
  d=call([*base,*assign,*options,*flags,'--require-complete'],4);verify(d);assert d['schedule']['reasons'][0]=='plan_partial'
 empty=base.copy();empty.remove('--recursive');d=call([*empty,*options,'--require-complete']);verify(d);assert d['schedule']['complete'] and not d['schedule']['controllers']
 d=call([*base,*options,'--require-complete'],4);verify(d);assert d['schedule']['reasons']==['plan_partial'] and not d['schedule']['waves']
 # Invalid scheduling must be rejected before the invalid design is opened.
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-before-schedule-validation.sv'
 for key,values in [('parallel',['0','1025']),('power',['0','1000000000001']),('waves',['0','10001']),('work',['0','10000001']),('millis',['0','60001'])]:
  for value in values:
   d=call([*absent,*assign,'--schedule-tests','--schedule-max-'+key,value],2);assert 'Invalid memory schedule' in d['error']['message']
 call([*base,*assign,'--schedule-max-work','1'],2)
 without=base.copy();without.remove('--plan-tests');call([*without,*assign,'--schedule-tests'],2)
 call([*base,*assign,'--schedule-tests','--schedule-tests'],2);call([*base,*assign,'--schedule-tests','--schedule-max-work','1','--schedule-max-work','2'],2)
 # Cross-controller batching retains the original incomplete explicit pin library.
 bb=json.loads((ROOT/'tests/memory-test-schedule-library.json').read_text());bb['models'][0]['definitionName']='missing_ram';bb['testProfiles'][0]['definitionName']='missing_ram';bb['library']=dict(source='schedule-test-declaration',cells=[dict(definitionName='missing_ram',cell=dict(pins=[dict(name=p,direction=di,width=w) for p,di,w in [('CLK','in',1),('A','in',3),('D','in',8),('Q','out',8)]]))]);file=OUT/'blackbox.json';file.write_text(json.dumps(bb));d=call(['--top','library_top','--scope','library_top.positional',str(ROOT/'tests/memory-library.sv'),'--memory-library',str(file),'--plan-tests','--test-instance','library_top.positional','test','',*options]);verify(d);assert 'library' in d['source'] and d['schedule']['scheduledInstances']==1
 negatives=[]
 for field in ['source','schedule']:
  d=copy.deepcopy(original);d.pop(field);negatives.append(d)
 for field in ['controllers','waves','work','scheduledSteps','request','complete']:
  d=copy.deepcopy(original);d['schedule'].pop(field);negatives.append(d)
 d=copy.deepcopy(original);d['schedule']['waves'][0]['entries']=[];negatives.append(d)
 d=copy.deepcopy(original);d['schedule']['controllers'][0]['status']='pending';negatives.append(d)
 d=copy.deepcopy(original);d['schedule']['reasons']=['step_power_exceeded'];negatives.append(d)
 d=copy.deepcopy(original);d['schedule']['controllers'][0]['reason']='step_power_exceeded';negatives.append(d)
 for d in negatives:assert not validators['rtl-memory-test-schedule-v1'].is_valid(d)
 assert not validators['rtl-memory-test-plan-v1'].is_valid(original) and not validators['rtl-memory-test-rules-v1'].is_valid(original)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives)+2,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
