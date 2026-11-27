"""Whole-wave resource calendars, downstream timing, and strict wire boundaries."""
import copy,json,random,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-resource-availability-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(p.read_text()) for p in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
for s in schemas:Draft202012Validator.check_schema(s)
def file(name,data):p=OUT/name;p.write_text(json.dumps(data));return str(p)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-timing-v1')].validate(d);return d
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
config=json.loads((ROOT/'tests/memory-test-config.json').read_text());config['scheduling']['policy']=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000)
for clock in config['timing']['clocks']:clock['periodPicoseconds']=1000
resource=dict(name='all',maxParallelControllers=4,clockDomains=list('abcd'),unavailableIntervals=[dict(startPicoseconds=10000,endPicoseconds=20000)])
config['scheduling']['resources']=[resource]
def run(c,extra=(),code=0):
 c=copy.deepcopy(c);extra=list(extra)
 for flag,group,key in [('--time-max-work','limits','maxWork'),('--time-max-duration','policy','maxDurationPicoseconds')]:
  if flag in extra:
   i=extra.index(flag);c['timing'].setdefault(group,{})[key]=int(extra[i+1]);del extra[i:i+2]
 return call([*base,'--test-config',file(f'config-{len(calls)}.json',c),*extra],code)
def oracle(d):
 s=d['source']['schedule'];src=d['source']['source'];p=(src['report'] if 'report' in src else src)['plan'];t=d['timeline'];rs=s['request']['resources'];last=0;total=0
 for wi,w in enumerate(t['waves']):
  domains={p['controllers'][e['controller']]['clockDomain'] for e in s['waves'][wi]['entries']};used=[r for r in rs if domains.intersection(r['clockDomains'])];start=last+w.get('resourceWait',{}).get('durationPicoseconds',0)+w.get('dependencyWait',{}).get('durationPicoseconds',0);baseline=start
  # Independent fixed point: find every intersecting interval, jump past all.
  while True:
   ends=[v['endPicoseconds'] for r in used for v in r.get('unavailableIntervals',[]) if v['startPicoseconds']<start+w['durationPicoseconds'] and v['endPicoseconds']>start]
   if not ends:break
   start=max(ends)
  assert w['startPicoseconds']==start and w['endPicoseconds']==start+w['durationPicoseconds'];extra=start-baseline;total+=extra
  assert w.get('availabilityWait',{}).get('durationPicoseconds',0)==extra
  if extra:
   witness=w['availabilityWait']['intervals'];cursor=baseline
   for ref in witness:
    r=rs[ref['resource']];v=r['unavailableIntervals'][ref['interval']];assert domains.intersection(r['clockDomains']);assert v['startPicoseconds']<cursor+w['durationPicoseconds'] and v['endPicoseconds']>cursor;cursor=v['endPicoseconds']
   assert cursor==start
  last=w['endPicoseconds']
 assert t.get('availabilityWaitPicoseconds',0)==total and t['durationPicoseconds']==last
 return d
try:
 d=oracle(run(config));assert d['timeline']['durationPicoseconds']==52014 and d['timeline']['work']==9
 default=copy.deepcopy(config);default['scheduling']['resources'][0].pop('unavailableIntervals');z=run(default);explicit=copy.deepcopy(default);explicit['scheduling']['resources'][0]['unavailableIntervals']=[];assert clean(run(explicit))==clean(z)
 manual=[*base,'--test-max-parallel','2','--schedule-max-power','1000000','--time-wave-overhead','7','--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),*[v for q in 'abcd' for v in ['--test-clock',q,'1000']],'--schedule-resources',file('resources.json',dict(formatVersion=1,kind='memory-schedule-resources',resources=[resource]))];assert clean(call(manual))==clean(d)
 for cap in range(1,10):
  v=oracle(run(config,['--time-max-work',str(cap),'--require-complete'],0 if cap==9 else 4));assert len(v['timeline']['waves'])==(0 if cap<6 else 1 if cap<9 else 2)
 for cap in [36006,36007,52013,52014]:oracle(run(config,['--time-max-duration',str(cap),'--require-complete'],0 if cap==52014 else 4))
 usage=run(config,['--test-resource-usage']);assert usage['usage']['rows'][0]['occupiedPicoseconds']==32014 and clean(usage['source'])==clean(d)
 cov=run(config,['--test-coverage']);assert clean(cov['source'])==clean(d)
 compare=[*base,'--compare-test-config','plain',file('plain.json',default),'--compare-test-config','delayed',file('delayed.json',config)];cmp=call(compare);assert cmp['rows'][1]['delta']['availabilityWaitPicoseconds']==20000 and 'availabilityWaitPicoseconds' not in cmp['rows'][0]['delta']
 reverse=call([*base,'--compare-test-config','delayed',file('delayed.json',config),'--compare-test-config','plain',file('plain.json',default)]);assert reverse['rows'][0]['delta']['availabilityWaitPicoseconds']==0 and reverse['rows'][1]['delta']['availabilityWaitPicoseconds']==-20000
 partialConfig=copy.deepcopy(config);partialConfig['timing']['limits']={'maxWork':1};partial=call([*base,'--compare-test-config','partial',file('partial.json',partialConfig),'--compare-test-config','plain',file('plain.json',default),'--require-complete'],4);assert all('delta' not in row for row in partial['rows'])
 usageCmp=call([*compare,'--compare-resource-usage']);assert usageCmp['rows'][0]['cells'][1]['delta']['occupiedPicoseconds']==0
 rng=random.Random(732)
 for seed in range(20):
  c=copy.deepcopy(config);resources=[]
  for ri in range(1+seed%4):
   intervals=[];end=0
   for j in range(1+seed%6):
    start=end+rng.randint(0,20000);end=start+rng.randint(1,25000);intervals.append(dict(startPicoseconds=start,endPicoseconds=end))
   resources.append(dict(name=str(ri),clockDomains=rng.sample(list('abcd'),rng.randint(1,4)),maxParallelControllers=4,unavailableIntervals=intervals,recoveryPicoseconds=rng.randint(0,3000)))
  c['scheduling']['resources']=resources;oracle(run(c))
 invalid=[]
 for v in [-1,9007199254740992,True,1.5,'2',None]:
  x=copy.deepcopy(resource);x['unavailableIntervals'][0]['startPicoseconds']=v;invalid.append(x)
 for v in [0,10000,9007199254740992,True,1.5,'2',None]:
  x=copy.deepcopy(resource);x['unavailableIntervals'][0]['endPicoseconds']=v;invalid.append(x)
 for entries in [[dict(startPicoseconds=0,endPicoseconds=5),dict(startPicoseconds=4,endPicoseconds=6)],[dict(startPicoseconds=5,endPicoseconds=6),dict(startPicoseconds=0,endPicoseconds=1)],[dict(startPicoseconds=0,endPicoseconds=1,extra=1)],[dict(startPicoseconds=0)],[dict(endPicoseconds=1)],{},None,[dict(startPicoseconds=0,endPicoseconds=1)]*1025]:
  x=copy.deepcopy(resource);x['unavailableIntervals']=entries;invalid.append(x)
 for x in invalid:
  c=copy.deepcopy(config);c['scheduling']['resources']=[x];badBase=[v if v!=str(ROOT/'tests/memory-test-schedule.sv') else '/missing-availability.sv' for v in base];err=call([*badBase,'--test-config',file(f'invalid-{len(calls)}.json',c)],2);assert err['error']['code']=='invalid_arguments' and 'missing-availability.sv' not in err['error']['message']
 negatives=[]
 for val in [-1,9007199254740992,True,'4',4.1]:
  x=copy.deepcopy(d);x['timeline']['availabilityWaitPicoseconds']=val;negatives.append(x)
 for val in [-1,1024,True,'0']:
  x=copy.deepcopy(d);x['timeline']['waves'][0]['availabilityWait']['intervals'][0]['interval']=val;negatives.append(x)
 x=copy.deepcopy(d);x['timeline']['waves'][0]['availabilityWait']['intervals']=[];negatives.append(x)
 x=copy.deepcopy(d);x['timeline']['waves'][0]['availabilityWait']['intervals'][0]['unknown']=1;negatives.append(x)
 x=copy.deepcopy(cmp);x['rows'][1]['delta']['availabilityWaitPicoseconds']=9007199254740992;negatives.append(x)
 for x in negatives:assert not validators[x['algorithm']].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),seeds=20,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
