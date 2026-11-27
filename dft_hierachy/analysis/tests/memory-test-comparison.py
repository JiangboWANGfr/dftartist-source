"""Actual RTL, exact tradeoffs, retained source evidence, and partial eligibility."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-comparison-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
for s in schemas:Draft202012Validator.check_schema(s)
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
reference=json.loads((ROOT/'tests/memory-test-config.json').read_text());serial=copy.deepcopy(reference);serial['scheduling']['policy']['maxParallelControllers']=1;wide=json.loads((ROOT/'tests/memory-test-config-wide.json').read_text());separated=copy.deepcopy(reference);separated['planning']['policy'].update(maxMemoriesPerController=1,maxParallelMemories=1)
configs=[reference,serial,wide,separated];names=['reference','serial','wide','separated'];paths=[]
for i,c in enumerate(configs):p=OUT/f'config-{i}.json';p.write_text(json.dumps(c));paths.append(str(p))
flags=[x for name,path in zip(names,paths) for x in ['--compare-test-config',name,path]]
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-comparison-v1')].validate(d);return d
def plan(report):s=report['source']['source'];return s.get('report',s)
def verify(d):
 assert len(d['configurations'])==len(d['rows']) and d['reference']==0
 assert d['complete']==all(x['report']['timeline']['complete'] for x in d['configurations']);facts=None
 for case,row in zip(d['configurations'],d['rows']):
  r=case['report'];p=plan(r);t=r['timeline'];m=dict(controllers=len(p['plan']['controllers']),plannedSteps=sum(len(c['steps']) for c in p['plan']['controllers']),scheduledWaves=len(r['source']['schedule']['waves']),timedWaves=len(t['waves']),timedInstances=t['timedInstances'],timedCapacityBits=t['timedCapacityBits'],durationPicoseconds=t['durationPicoseconds']);assert row['metrics']==m
  if facts is None:facts=p['investigation']
  else:assert p['investigation']==facts
  eligible=t['complete'] and d['configurations'][0]['report']['timeline']['complete'];assert row['comparable']==eligible
  if eligible:assert row['delta']=={k:m[k]-d['rows'][0]['metrics'][k] for k in ['controllers','plannedSteps','scheduledWaves','durationPicoseconds']}
  else:assert 'delta' not in row
 return d
try:
 d=verify(call([*base,*flags,'--require-complete']));original=copy.deepcopy(d)
 assert [r['metrics']['durationPicoseconds'] for r in d['rows']]==[144021,176035,64007,128028]
 assert [r['metrics']['controllers'] for r in d['rows']]==[4,4,4,8]
 assert [r['metrics']['plannedSteps'] for r in d['rows']]==[5,5,4,8]
 assert [r['metrics']['scheduledWaves'] for r in d['rows']]==[3,5,1,4]
 assert [r['delta']['durationPicoseconds'] for r in d['rows']]==[0,32014,-80014,-15993]
 for path,case in zip(paths,d['configurations']):assert clean(call([*base,'--test-config',path]))==clean(case['report'])
 # Ordering changes the reference, never the individual planning algorithm.
 reversedFlags=[x for name,path in reversed(list(zip(names,paths))) for x in ['--compare-test-config',name,path]]
 reverse=verify(call([*base,*reversedFlags]));assert [clean(c) for c in reverse['configurations']]==list(reversed([clean(c) for c in d['configurations']]))
 eight=[x for i in range(8) for x in ['--compare-test-config',str(i),paths[0]]];eightResult=verify(call([*base,*eight]));assert len(eightResult['rows'])==8 and all(x['delta']['durationPicoseconds']==0 for x in eightResult['rows'])
 # Explicit assignments and rules may coexist in different configurations.
 assigned=copy.deepcopy(reference);assigned.pop('rules');assigned['assignments']=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']];assignedPath=OUT/'assigned.json';assignedPath.write_text(json.dumps(assigned))
 mixed=verify(call([*base,*flags[:3],'--compare-test-config','assigned',str(assignedPath)]));assert mixed['rows'][1]['delta']==dict(controllers=0,plannedSteps=0,scheduledWaves=0,durationPicoseconds=0);assert clean(mixed['configurations'][1]['report'])==clean(call([*base,'--test-config',str(assignedPath)]))
 missing=copy.deepcopy(reference);missing['timing']['clocks'].pop();missingPath=OUT/'missing-clock.json';missingPath.write_text(json.dumps(missing))
 partial=verify(call([*base,*flags[:3],'--compare-test-config','missing',str(missingPath),*flags[6:9],'--require-complete'],4));assert [r['comparable'] for r in partial['rows']]==[True,False,True] and partial['rows'][1]['metrics']['durationPicoseconds']==48007
 reversedPartial=verify(call([*base,'--compare-test-config','missing',str(missingPath),*flags[:3],'--require-complete'],4));assert not any(r['comparable'] for r in reversedPartial['rows'])
 for limit in [['--max-macros','2'],['--map-max-work','1'],['--max-catalog-work','1']]:
  partial=verify(call([*base,*flags,*limit,'--require-complete'],4));assert not any(r['comparable'] for r in partial['rows'])
 # Prefix/blocked outputs remain diagnostic, without complete-only subtraction.
 for changes in [('planning','limits','maxWork',1),('scheduling','limits','maxWaves',1),('scheduling','policy','maxPowerMicrowatts',1),('timing','limits','maxWork',1),('timing','policy','maxDurationPicoseconds',48007)]:
  c=copy.deepcopy(reference);section,group,key,value=changes;c[section].setdefault(group,{})[key]=value;p=OUT/('partial-'+key+'.json');p.write_text(json.dumps(c));partial=verify(call([*base,*flags[:3],'--compare-test-config','partial',str(p),'--require-complete'],4));assert partial['rows'][0]['comparable'] and not partial['rows'][1]['comparable']
 empty=base[:];empty.remove('--recursive');emptyResult=verify(call([*empty,*flags,'--require-complete']));assert all(r['metrics']['timedInstances']==0 and r['delta']['durationPicoseconds']==0 for r in emptyResult['rows'])
 # Validate the entire batch before opening invalid RTL.
 absent=base[:];absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-comparison-design.sv'
 for name in ['',names[0],'x'*129,'中'*43]:call([*absent,*flags[:3],'--compare-test-config',name,paths[1]],2)
 call([*absent,*flags[:3]],2);call([*absent,*eight,'--compare-test-config','ninth',paths[0]],2)
 for option in ['--plan-tests','--schedule-tests','--time-tests']:
  noStage=absent[:];noStage.remove(option);call([*noStage,*flags],2)
 bad=copy.deepcopy(reference);bad['timing']['limits']={'maxWork':0};p=OUT/'bad-last.json';p.write_text(json.dumps(bad));err=call([*absent,*flags,'--compare-test-config','bad',str(p)],2);assert 'timing limits' in err['error']['message']
 call([*absent,*flags,'--compare-test-config','absent',str(OUT/'absent.json')],2)
 conflicts=[['--test-config',paths[0]],['--test-instance','schedule_top.a0','a',''],['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')],['--test-max-controller-memories','1'],['--test-max-parallel','1'],['--test-max-power','1'],['--test-max-controllers','1'],['--test-max-work','1'],['--test-max-millis','1'],['--schedule-max-parallel','1'],['--schedule-max-power','1'],['--schedule-max-waves','1'],['--schedule-max-work','1'],['--schedule-max-millis','1'],['--test-clock','a','1'],['--time-wave-overhead','0'],['--time-max-duration','1'],['--time-max-work','1'],['--time-max-millis','1']]
 for conflict in conflicts:
  for before in [False,True]:call([*absent,*(conflict if before else []),*flags,*([] if before else conflict)],2)
 negatives=[]
 for key in ['reference','complete','configurations','rows']:
  c=copy.deepcopy(original);c.pop(key);negatives.append(c)
 for key,value in [('reference',1),('configurations',[]),('rows',[]),('unknown',0)]:
  c=copy.deepcopy(original);c[key]=value;negatives.append(c)
 for row in [dict(metrics=original['rows'][0]['metrics'],comparable=True),dict(metrics=original['rows'][0]['metrics'],comparable=False,delta=original['rows'][0]['delta'])]:
  c=copy.deepcopy(original);c['rows'][0]=row;negatives.append(c)
 c=copy.deepcopy(original);c['rows'][1]['delta']['durationPicoseconds']=0.5;negatives.append(c)
 c=copy.deepcopy(original);c['rows'][0]['metrics']['controllers']=-1;negatives.append(c)
 c=copy.deepcopy(original);c['configurations'][0]['report']['timeline']['complete']=False;negatives.append(c)
 for c in negatives:assert not validators['rtl-memory-test-comparison-v1'].is_valid(c)
 assert not validators['rtl-memory-test-timing-v1'].is_valid(original)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives)+1,equivalencePairs=5,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
