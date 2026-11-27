"""Per-macro hand-calculated intervals, stage causes and original report preservation."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-coverage-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
for s in schemas:Draft202012Validator.check_schema(s)
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
config=json.loads((ROOT/'tests/memory-test-config.json').read_text());configPath=str(ROOT/'tests/memory-test-config.json');mode=['--test-coverage'];equivalence=0

def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x

def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-coverage-v1')].validate(d);return d

def verify(d):
 c=d['coverage'];t=d['source']['timeline'];s=d['source']['source']['schedule'];source=d['source']['source']['source'];p=source.get('report',source);facts=p['investigation'];mapping=facts['mapping'];plan=p['plan']
 assert len(c['rows'])==c['observedMacros']==len(facts['interfaces']['macros']) and c['complete']==t['complete']
 assert c['timedInstances']==t['timedInstances']==sum(x['status']=='timed' for x in c['rows']);assert c['blockedInstances']==sum(x['status']=='blocked' for x in c['rows']);assert c['pendingInstances']==sum(x['status']=='pending' for x in c['rows']);assert sum(c[k] for k in ['timedInstances','blockedInstances','pendingInstances'])==c['observedMacros']
 assert c['matchedInstances']==mapping['matchedInstances'] and c['plannedInstances']==plan['scheduledInstances'] and c['scheduledInstances']==s['scheduledInstances']
 for i,row in enumerate(c['rows']):
  assert row['macro']==i
  if 'memory' in row:assert mapping['memories'][row['memory']]['macro']==i
  if 'plannedMemory' in row:assert plan['memories'][row['plannedMemory']]['memory']==row['memory']
  if 'controller' in row:assert row['plannedMemory'] in plan['controllers'][row['controller']]['steps'][row['step']]['memories']
  if 'wave' in row:assert s['waves'][row['wave']]['entries'][row['entry']]==dict(controller=row['controller'],step=row['step'])
  if 'timing' in row:
   w=t['waves'][row['wave']];e=w['entries'][row['entry']];v=row['timing'];assert v==dict(startPicoseconds=w['startPicoseconds']+t['request']['policy']['waveOverheadPicoseconds'],durationPicoseconds=e['durationPicoseconds'],endPicoseconds=w['startPicoseconds']+t['request']['policy']['waveOverheadPicoseconds']+e['durationPicoseconds'],barrierEndPicoseconds=w['endPicoseconds'])
   assert v['endPicoseconds']<=v['barrierEndPicoseconds']
 return c

def pair(args,code=0):
 global equivalence
 d=call([*args,*mode,'--require-complete'],code);verify(d);old=call([*args,'--require-complete'],code);assert clean(d['source'])==clean(old);equivalence+=1;return d

def configured(value,flags=(),code=4):
 f=OUT/f'config-{len(calls)}.json';f.write_text(json.dumps(value));return pair([*base,'--test-config',str(f),*flags],code)
try:
 d=pair([*base,'--test-config',configPath]);original=copy.deepcopy(d);rows=d['coverage']['rows'];assert [r['timing']['startPicoseconds'] for r in rows]==[7,7,48014,48014,112021,112021,7,48014];assert [r['timing']['durationPicoseconds'] for r in rows]==[16000,16000,16000,16000,32000,32000,48000,64000];assert [r['timing']['barrierEndPicoseconds'] for r in rows]==[48007,48007,112014,112014,144021,144021,48007,112014]
 assigned=copy.deepcopy(config);assigned.pop('rules');assigned['assignments']=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']];a=configured(assigned,code=0);assert a['coverage']==d['coverage']
 # Legacy direct options, not just config files, share this production entry.
 direct=[*base,'--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),'--test-max-parallel','2','--schedule-max-parallel','2','--schedule-max-power','300000','--time-wave-overhead','7',*[x for c in config['timing']['clocks'] for x in ['--test-clock',c['clockDomain'],str(c['periodPicoseconds'])]]]
 assert pair(direct)['coverage']==original['coverage']
 missing=copy.deepcopy(config);missing['timing']['clocks'].pop();d=configured(missing);c=d['coverage'];assert (c['timedInstances'],c['blockedInstances'],c['pendingInstances'])==(3,1,4);assert [c['rows'][i]['reason'] for i in [2,3,4,5,7]]==['wave_not_committed','wave_not_committed','timing_not_reached','timing_not_reached','clock_missing']
 power=copy.deepcopy(config);power['scheduling']['policy']['maxPowerMicrowatts']=100000;c=configured(power)['coverage'];assert (c['timedInstances'],c['blockedInstances'],c['pendingInstances'])==(2,6,0);assert [c['rows'][i]['reason'] for i in [0,1,2,3,4,5]]==['step_power_exceeded']*2+['prior_step_blocked']*2+['step_power_exceeded']*2
 # Make later a-step lower-power to verify that its blocker is the prior step.
 uneven=copy.deepcopy(power);uneven['planning']['policy']['maxParallelMemories']=3;uneven['scheduling']['policy']['maxPowerMicrowatts']=200000;c=configured(uneven)['coverage'];assert c['rows'][3]['reason']=='prior_step_blocked' and c['rows'][3]['step']==1
 for flags,reason,first,count in [(['--map-max-macros','2'],'mapping_not_reached',2,6),(['--map-max-work','1'],'mapping_not_reached',0,8)]:
  c=configured(config,flags)['coverage'];assert c['rows'][first]['reason']==reason and c['pendingInstances']==count
 for stage,field,cap,reason,first in [('planning','maxWork',2,'planning_not_reached',2),('planning','maxControllers',1,'planning_not_reached',4),('scheduling','maxWaves',1,'schedule_not_reached',2),('scheduling','maxWork',1,'schedule_not_reached',0),('timing','maxWork',1,'budget_work',0)]:
  limited=copy.deepcopy(config);limited[stage]['limits']={field:cap};c=configured(limited)['coverage'];assert c['rows'][first]['reason']==reason and c['blockedInstances']==0
 for cap in [1,48006,48007,112013,112014,144020,144021]:
  limited=copy.deepcopy(config);limited['timing']['policy']['maxDurationPicoseconds']=cap;c=configured(limited,code=0 if cap==144021 else 4)['coverage'];assert c['blockedInstances']==0 and c['timedInstances']==sum(n for end,n in [(48007,3),(112014,3),(144021,2)] if end<=cap)
 for field,value,reason in [('assignments',[],'domain_missing'),('planning',{'policy':{'maxPowerMicrowatts':1}},'power_exceeded')]:
  limited=copy.deepcopy(config);limited[field]=value
  if field=='assignments':limited.pop('rules')
  c=configured(limited)['coverage'];assert c['blockedInstances']==8 and all(r['reason']==reason for r in c['rows'])
 # Mapped defects remain known even if the downstream plan stops early.
 library=json.loads((ROOT/'tests/memory-test-schedule-library.json').read_text());library['models'][0]['dataBits']=16;lf=OUT/'bad-width-library.json';lf.write_text(json.dumps(library));args=base[:];args[args.index('--memory-library')+1]=str(lf);d=pair([*args,'--test-config',configPath],4);assert d['coverage']['blockedInstances']==8 and all(r['stage']=='mapping' for r in d['coverage']['rows'])
 limited=copy.deepcopy(config);limited['planning']['limits']={'maxWork':1};f=OUT/'partial-plan.json';f.write_text(json.dumps(limited));d=pair([*args,'--test-config',str(f)],4);assert d['coverage']['blockedInstances']==8 and 'plannedMemory' not in d['coverage']['rows'][1]
 for flags in [['--max-macros','2'],['--max-pins','1'],['--max-instances','2']]:
  d=pair([*base,'--test-config',configPath,*flags],4);assert not d['coverage']['complete']
 empty=base[:];empty.remove('--recursive');d=pair([*empty,'--test-config',configPath]);assert d['coverage']['complete'] and d['coverage']['rows']==[]
 # Actual wide-address RTL produces overflow without fabricating a report.
 large=['--top','timing_top','--scope','timing_top.big',str(ROOT/'tests/memory-test-timing.sv'),'--model','timing_large','4294967296','8','--role','timing_large','clock','CLK','posedge','--role','timing_large','address','A','none','--role','timing_large','data_in','D','none','--role','timing_large','data_out','Q','none','--plan-tests','--test-profile','timing_large','1','1','--test-instance','timing_top.big','b','','--schedule-tests','--time-tests']
 for period,reason,status in [(4294967296,'duration_overflow','blocked'),(4294967295,'duration_limit','pending'),(1,None,'timed')]:
  d=pair([*large,'--test-clock','b',str(period)],0 if reason is None else 4);r=d['coverage']['rows'][0];assert r['status']==status and r.get('reason')==reason
 absent=base[:];absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-before-coverage.sv'
 for stage in ['--plan-tests','--schedule-tests','--time-tests']:
  args=absent[:];args.remove(stage);call([*args,*mode,'--test-config',configPath],2)
 call([*absent,*mode,*mode,'--test-config',configPath],2)
 compare=['--compare-test-config','a',configPath,'--compare-test-config','b',configPath]
 for suffix in [mode+compare,compare+mode]:call([*absent,*suffix],2)
 bad=copy.deepcopy(config);bad['timing']['limits']={'maxWork':0};f=OUT/'invalid.json';f.write_text(json.dumps(bad));call([*absent,*mode,'--test-config',str(f)],2)
 call([*base,*mode,'--test-config',configPath,'--time-max-work','1'],2)
 # Default partial exits zero, but still explicitly reports incompleteness.
 c=call([*base,*mode,'--test-config',configPath,'--map-max-macros','2']);verify(c);assert not c['coverage']['complete']
 negatives=[]
 for field in ['source','coverage']:
  v=copy.deepcopy(original);v.pop(field);negatives.append(v)
 for field in ['complete','rows','observedMacros','matchedInstances','plannedInstances','scheduledInstances','timedInstances','blockedInstances','pendingInstances']:
  v=copy.deepcopy(original);v['coverage'].pop(field);negatives.append(v)
 for field in ['macro','memory','plannedMemory','controller','step','wave','entry','timing','stage','status']:
  v=copy.deepcopy(original);v['coverage']['rows'][0].pop(field);negatives.append(v)
 for key,value in [('reason','clock_missing'),('status','pending'),('stage','mapping'),('wave',-1),('unknown',0)]:
  v=copy.deepcopy(original);v['coverage']['rows'][0][key]=value;negatives.append(v)
 v=copy.deepcopy(original);v['source']['timeline']['complete']=False;negatives.append(v)
 for v in negatives:assert not validators['rtl-memory-test-coverage-v1'].is_valid(v)
 assert not validators['rtl-memory-test-timing-v1'].is_valid(original)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives)+1,equivalencePairs=equivalence,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
