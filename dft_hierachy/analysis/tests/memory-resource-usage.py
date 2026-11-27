"""Resource occupancy from trusted timed batches, with source witness checks."""
import copy,json,subprocess,sys,tempfile,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-usage-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
for s in schemas:Draft202012Validator.check_schema(s)
def file(name,data):p=OUT/name;p.write_text(json.dumps(data));return str(p)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-resource-usage-v1')].validate(d);return d
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
config=dict(formatVersion=1,kind='memory-test-config',assignments=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']],planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),dependencies=[dict(before='a',after='b',minimumGapPicoseconds=1000),dict(before='b',after='c',minimumGapPicoseconds=2000)],resources=[dict(name='all',maxParallelControllers=4,clockDomains=list('abcd'),recoveryPicoseconds=1500),dict(name='ab',maxParallelControllers=3,clockDomains=['a','b']),dict(name='unused',maxParallelControllers=1,clockDomains=['missing'])]),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
def execute(cfg,name='config.json',extra=[],code=0):return call([*base,'--test-config',file(name,cfg),'--test-resource-usage',*extra],code)
def verify(d):
 u=d['usage'];source=d['source'];timed=source['timeline']['waves'];schedule=source['source']['schedule'];p=source['source']['source'];p=p['report'] if 'report' in p else p;controllers=p['plan']['controllers'];resources=schedule['request'].get('resources',[]);count=0
 assert len(u['rows'])==len(resources) and u['processedWaves']<=len(timed)
 for ri,(r,row) in enumerate(zip(resources,u['rows'])):
  expected=[];duration=peak=power=0
  for wi in range(u['processedWaves']):
   entries=[i for i,e in enumerate(schedule['waves'][wi]['entries']) if controllers[e['controller']]['clockDomain'] in r['clockDomains']]
   if entries:
    expected.append(dict(wave=wi,entries=entries));duration+=timed[wi]['durationPicoseconds'];peak=max(peak,len(entries));power=max(power,sum(controllers[schedule['waves'][wi]['entries'][i]['controller']]['steps'][schedule['waves'][wi]['entries'][i]['step']]['powerMicrowatts'] for i in entries))
  assert row==dict(resource=ri,occupiedPicoseconds=duration,peakControllers=peak,peakPowerMicrowatts=power,uses=expected);count+=len(expected)
 assert u['uses']==count
try:
 d=execute(config,extra=['--require-complete']);verify(d);u=d['usage'];assert (u['work'],u['processedWaves'],u['uses'])==(13,4,7);assert [r['occupiedPicoseconds'] for r in u['rows']]==[64028,48021,0];assert u['rows'][0]['peakControllers']==2 and u['rows'][0]['peakPowerMicrowatts']==300000
 original=call([*base,'--test-config',file('config.json',config)]);assert clean(original)==clean(d['source'])
 rules=copy.deepcopy(config);rules.pop('assignments');rules['rules']=json.loads((ROOT/'tests/memory-test-schedule-rules.json').read_text())['rules'];r=execute(rules,'rules.json');verify(r);assert r['usage']==u
 manual=[*base,'--test-max-parallel','2','--schedule-max-power','1000000','--time-wave-overhead','7',*[v for q in 'abcd' for v in ['--test-clock',q,'1000']],*[v for a in config['assignments'] for v in ['--test-instance',a['instancePath'],a['clockDomain'],'']],'--schedule-resources',file('resources.json',dict(formatVersion=1,kind='memory-schedule-resources',resources=config['scheduling']['resources'])),'--schedule-dependencies',file('dependencies.json',dict(formatVersion=1,kind='memory-schedule-dependencies',dependencies=config['scheduling']['dependencies'])),'--test-resource-usage'];assert clean(call(manual))==clean(d)
 for cap in range(1,14):
  x=execute(config,'config.json',['--usage-max-work',str(cap),'--require-complete'],0 if cap==13 else 4);verify(x);assert x['usage']['work']==cap and x['usage']['processedWaves']==(0 if cap<5 else 1 if cap<8 else 2 if cap<11 else 3 if cap<13 else 4)
 for cap in range(1,8):
  x=execute(config,'config.json',['--usage-max-uses',str(cap),'--require-complete'],0 if cap==7 else 4);verify(x);assert x['usage']['processedWaves']==(0 if cap<2 else 1 if cap<4 else 2 if cap<6 else 3 if cap<7 else 4)
 partial=copy.deepcopy(config);partial['timing']['limits']=dict(maxWork=4);x=execute(partial,'partial.json',['--require-complete'],4);verify(x);assert x['usage']['reasons']==['timing_partial'] and x['usage']['processedWaves']==1 and 'stop' not in x['usage'];x=execute(partial,'partial.json',['--usage-max-work','1']);assert x['usage']['reasons']==['timing_partial','budget_work'] and x['usage']['processedWaves']==0
 empty=copy.deepcopy(config);empty['scheduling']['resources']=[];x=execute(empty,'empty.json');verify(x);assert x['usage']['rows']==[] and x['usage']['work']==5 and x['usage']['processedWaves']==4
 short=copy.deepcopy(config);short['timing']['clocks'][-1]['periodPicoseconds']=125;short['scheduling']['resources'].append(dict(name='d',maxParallelControllers=1,clockDomains=['d']));x=execute(short,'short.json');verify(x);assert x['usage']['rows'][3]['occupiedPicoseconds']==16007 and x['source']['timeline']['waves'][0]['entries'][1]['durationPicoseconds']==2000
 rng=random.Random(22029)
 for case in range(20):
  c=copy.deepcopy(config);c['scheduling']['resources']=[dict(name='r'+str(i),maxParallelControllers=rng.choice([1,2,4]),clockDomains=rng.sample(list('abcd'),rng.randint(1,4)),recoveryPicoseconds=rng.choice([0,500,30000]),maxPowerMicrowatts=rng.choice([0,100000,200000,500000])) for i in range(rng.randint(0,4))];c['planning']['policy']['maxMemoriesPerController']=rng.choice([1,2,4]);verify(execute(c,'random'+str(case)+'.json'))
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-resource-usage.sv';cf=file('config.json',config)
 for flag,values in [('--usage-max-work',['0','10000001','x']),('--usage-max-uses',['0','1000001']),('--usage-max-millis',['0','60001'])]:
  for value in values:bad=call([*absent,'--test-config',cf,'--test-resource-usage',flag,value],2);assert 'absent-resource-usage' not in bad['error']['message']
 for args in [[*base,'--usage-max-work','2'],[*base,'--test-resource-usage','--test-coverage'],[*base,'--test-coverage','--test-resource-usage'],[*base,'--test-resource-usage','--compare-test-config','a',cf,'--compare-test-config','b',cf],[x for x in base if x!='--time-tests']+['--test-resource-usage'],[*base,'--test-resource-usage','--test-resource-usage']]:call(args,2)
 negatives=[]
 for kind in ['missing','index','duplicate','empty','zeroLimit','negative','unknown','reason']:
  x=copy.deepcopy(d);row=x['usage']['rows'][0]
  if kind=='missing':row.pop('peakControllers')
  elif kind=='index':row['uses'][0]['entries']=[1024]
  elif kind=='duplicate':row['uses'][0]['entries']=[0,0]
  elif kind=='empty':row['uses'][0]['entries']=[]
  elif kind=='zeroLimit':x['usage']['limits']['maxUses']=0
  elif kind=='negative':row['occupiedPicoseconds']=-1
  elif kind=='unknown':row['power']=3
  else:x['usage']['reasons']=['invented']
  negatives.append(x)
 for x in negatives:assert not validators['rtl-memory-resource-usage-v1'].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
