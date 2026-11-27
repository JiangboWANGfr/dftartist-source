"""Partition-scoped shared resources across scheduling, timing, usage and identity."""
import copy,json,random,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-resource-partitions-cli-'));calls=[]
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
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-resource-usage-v1')].validate(d);return d
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
config=json.loads((ROOT/'tests/memory-test-config.json').read_text());config['scheduling']['policy']=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000);config.pop('rules');config['assignments']=[dict(instancePath='schedule_top.'+n,clockDomain='test',partition='' if n[0]=='d' else n[0]) for n in ['a0','a1','a2','a3','b0','b1','c0','d0']];config['timing']['clocks']=[dict(clockDomain='test',periodPicoseconds=1000)]
resource=dict(name='bank',maxParallelControllers=1,clockDomains=['test'],partitions=['a'],maxPowerMicrowatts=300000,maxUnits=3,domainUnits=[dict(clockDomain='test',units=2)],recoveryPicoseconds=1000,unavailableIntervals=[dict(startPicoseconds=0,endPicoseconds=20000)])
config['scheduling']['resources']=[resource]
def run(c,extra=(),code=0,mode='--test-resource-usage'):return call([*base,'--test-config',file(f'config-{len(calls)}.json',c),mode,*extra],code)
def matches(r,c):return c['clockDomain'] in r['clockDomains'] and (not r.get('partitions') or c['partition'] in r['partitions'])
def verify(d):
 t=d['source'];s=t['source']['schedule'];src=t['source']['source'];p=(src['report'] if 'report' in src else src)['plan'];cs=p['controllers'];rs=s['request']['resources'];u=d['usage'];last=0;ends={};recoveryTotal=0;availabilityTotal=0;work=0
 for wi,w in enumerate(t['timeline']['waves']):
  entries=s['waves'][wi]['entries'];used=[ri for ri,r in enumerate(rs) if any(matches(r,cs[e['controller']]) for e in entries)];work+=len(entries);ready=last
  for ri in used:
   if rs[ri].get('recoveryPicoseconds'):
    work+=1
    if ri in ends:ready=max(ready,ends[ri]+rs[ri]['recoveryPicoseconds'])
  recoveryTotal+=ready-last;assert w.get('resourceWait',{}).get('durationPicoseconds',0)==ready-last
  start=ready;intervals=[]
  for ri in used:
   if rs[ri].get('unavailableIntervals'):
    work+=1
    intervals.extend((v['startPicoseconds'],ri,i,v['endPicoseconds']) for i,v in enumerate(rs[ri]['unavailableIntervals']))
  # Independent sorted union reference, not the production domain/partition index.
  for begin,ri,ii,end in sorted(intervals):
   if begin>=start+w['durationPicoseconds']:break
   work+=1;start=max(start,end)
  availabilityTotal+=start-ready;assert w['startPicoseconds']==start and w['endPicoseconds']==start+w['durationPicoseconds'];assert w.get('availabilityWait',{}).get('durationPicoseconds',0)==start-ready
  for ri in used:ends[ri]=w['endPicoseconds']
  last=w['endPicoseconds']
 assert t['timeline']['durationPicoseconds']==last and t['timeline'].get('resourceWaitPicoseconds',0)==recoveryTotal and t['timeline'].get('availabilityWaitPicoseconds',0)==availabilityTotal
 if t['timeline']['complete']:assert t['timeline']['work']==work
 for ri,r in enumerate(rs):
  uses=[];occupied=0;peaks=[];powers=[];units=[];demands={x['clockDomain']:x['units'] for x in r.get('domainUnits',[])}
  for wi,w in enumerate(s['waves'][:u['processedWaves']]):
   es=[ei for ei,e in enumerate(w['entries']) if matches(r,cs[e['controller']])]
   if es:
    uses.append(dict(wave=wi,entries=es));occupied+=t['timeline']['waves'][wi]['durationPicoseconds'];peaks.append(len(es));powers.append(sum(cs[w['entries'][ei]['controller']]['steps'][w['entries'][ei]['step']]['powerMicrowatts'] for ei in es));units.append(sum(demands.get(cs[w['entries'][ei]['controller']]['clockDomain'],1) for ei in es));assert len(es)<=r['maxParallelControllers'];assert not r.get('maxUnits') or units[-1]<=r['maxUnits'];assert not r.get('maxPowerMicrowatts') or powers[-1]<=r['maxPowerMicrowatts']
  row=u['rows'][ri];assert row['uses']==uses and row['occupiedPicoseconds']==occupied and row['peakControllers']==max(peaks,default=0) and row['peakPowerMicrowatts']==max(powers,default=0)
  if 'peakUnits' in row:assert row['peakUnits']==max(units,default=0)
 return d
try:
 d=verify(run(config));assert d['source']['timeline']['durationPicoseconds']==53014 and d['source']['source']['schedule']['work']==7 and d['usage']['work']==7
 default=copy.deepcopy(config);default['scheduling']['resources'][0].pop('partitions');z=verify(run(default));explicit=copy.deepcopy(default);explicit['scheduling']['resources'][0]['partitions']=[];assert clean(run(explicit))==clean(z)
 empty=copy.deepcopy(config);empty['scheduling']['resources'][0]['partitions']=[''];v=verify(run(empty));assert v['usage']['rows'][0]['uses']==[dict(wave=0,entries=[3])]
 missing=copy.deepcopy(config);missing['scheduling']['resources'][0].update(partitions=['absent'],maxPowerMicrowatts=1,maxUnits=1);v=verify(run(missing));assert v['source']['timeline']['durationPicoseconds']==32014 and v['source']['timeline']['work']==5 and v['usage']['rows'][0]['uses']==[]
 manual=[*base,'--test-max-parallel','2','--schedule-max-power','1000000','--time-wave-overhead','7','--test-clock','test','1000',*[v for a in config['assignments'] for v in ['--test-instance',a['instancePath'],a['clockDomain'],a['partition']]],'--schedule-resources',file('resources.json',dict(formatVersion=1,kind='memory-schedule-resources',resources=[resource])),'--test-resource-usage'];assert clean(call(manual))==clean(d)
 for cap in range(1,8):
  v=verify(run(config,['--usage-max-work',str(cap),'--require-complete'],0 if cap==7 else 4));assert v['usage']['processedWaves']==(0 if cap<5 else 1 if cap<7 else 2)
 for cap in range(1,12):
  c=copy.deepcopy(config);c['timing']['limits']={'maxWork':cap};v=verify(run(c,['--require-complete'],0 if cap==11 else 4));assert len(v['source']['timeline']['waves'])==(0 if cap<7 else 1 if cap<11 else 2)
 blocked=copy.deepcopy(config);blocked['scheduling']['resources'][0].update(partitions=['b'],maxUnits=1);b=verify(run(blocked,['--require-complete'],4));assert b['source']['source']['schedule']['controllers'][1]['reason']=='resource_units_exceeded'
 cov=run(blocked,mode='--test-coverage');assert sum(x.get('reason')=='resource_units_exceeded' for x in cov['coverage']['rows'])==2
 ac=copy.deepcopy(config);ac['scheduling']['resources'][0]['partitions']=['a','c'];ca=copy.deepcopy(ac);ca['scheduling']['resources'][0]['partitions']=['c','a']
 args=list(base)
 for name,c in [('ac',ac),('ca',ca),('a',config),('all',default),('empty',empty)]:args.extend(['--compare-test-config',name,file(name+'.json',c)])
 args.append('--compare-resource-usage');cmp=call(args);statuses=[x['status'] for x in cmp['rows'][0]['cells']];assert statuses==['compared','compared','partition_mismatch','partition_mismatch','partition_mismatch'];assert cmp['rows'][0]['cells'][1]['delta']['occupiedPicoseconds']==0
 partial=call([*args,'--usage-max-work','1','--require-complete'],4);assert [x['status'] for x in partial['rows'][0]['cells']]==['partial','partial','partition_mismatch','partition_mismatch','partition_mismatch']
 rng=random.Random(733)
 for seed in range(20):
  c=copy.deepcopy(config);resources=[]
  for ri in range(1+seed%4):
   parts=rng.sample(['a','b','c','','absent'],rng.randint(0,5));resources.append(dict(name=str(ri),clockDomains=['test'],partitions=parts,maxParallelControllers=rng.randint(1,4),maxUnits=rng.randint(2,6),domainUnits=[dict(clockDomain='test',units=2)],recoveryPicoseconds=rng.randint(0,3000),unavailableIntervals=[dict(startPicoseconds=0,endPicoseconds=rng.randint(1,30000))]))
  c['scheduling']['resources']=resources;verify(run(c))
 invalid=[None,{},'a',1,[None],[True],[1],['a','a'],['',''],['a\x00'],['x'*4097],['a']*1025]
 for val in invalid:
  c=copy.deepcopy(config);c['scheduling']['resources'][0]['partitions']=val;badBase=[v if v!=str(ROOT/'tests/memory-test-schedule.sv') else '/missing-partition.sv' for v in base];err=call([*badBase,'--test-config',file(f'invalid-{len(calls)}.json',c),'--test-resource-usage'],2);assert err['error']['code']=='invalid_arguments' and 'missing-partition.sv' not in err['error']['message']
 negatives=[]
 for value in [None,{},'a',[None],['a','a'],['a']*1025]:
  x=copy.deepcopy(d);x['source']['source']['schedule']['request']['resources'][0]['partitions']=value;negatives.append(x)
 x=copy.deepcopy(cmp);x['rows'][0]['cells'][2]['delta']=copy.deepcopy(x['rows'][0]['cells'][0]['delta']);negatives.append(x)
 x=copy.deepcopy(cmp);x['rows'][0]['cells'][2].pop('resource');negatives.append(x)
 x=copy.deepcopy(cmp);x['rows'][0]['cells'][2]['status']='invalid_partition';negatives.append(x)
 for x in negatives:assert not validators[x['algorithm']].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),seeds=20,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
