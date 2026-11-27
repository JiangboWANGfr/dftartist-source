"""Weighted resource scheduling, propagation, exact units, and strict wire boundaries."""
import copy,json,random,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-resource-units-cli-'));calls=[]
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
config=json.loads((ROOT/'tests/memory-test-config.json').read_text());config['scheduling']['policy']=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000)
for clock in config['timing']['clocks']:clock['periodPicoseconds']=1000
resource=dict(name='all',maxParallelControllers=4,clockDomains=list('abcd'),maxUnits=4,domainUnits=[dict(clockDomain='a',units=3),dict(clockDomain='b',units=2)])
config['scheduling']['resources']=[resource]
def run(c,extra=(),code=0,mode='--test-resource-usage'):return call([*base,'--test-config',file(f'config-{len(calls)}.json',c),mode,*extra],code)
def verify(d):
 t=d['source'];s=t['source']['schedule'];p=t['source']['source']['report']['plan'] if 'report' in t['source']['source'] else t['source']['source']['plan'];u=d['usage'];rs=s['request']['resources']
 for ri,r in enumerate(rs):
  actual=u['rows'][ri];demands={x['clockDomain']:x['units'] for x in r.get('domainUnits',[])};uses=[];peaks=[];dur=0;powers=[]
  for wi,w in enumerate(s['waves'][:u['processedWaves']]):
   entries=[ei for ei,e in enumerate(w['entries']) if p['controllers'][e['controller']]['clockDomain'] in r['clockDomains']]
   if entries:
    uses.append(dict(wave=wi,entries=entries));units=sum(demands.get(p['controllers'][w['entries'][ei]['controller']]['clockDomain'],1) for ei in entries);peaks.append(units);dur+=t['timeline']['waves'][wi]['durationPicoseconds'];powers.append(sum(p['controllers'][w['entries'][ei]['controller']]['steps'][w['entries'][ei]['step']]['powerMicrowatts'] for ei in entries));assert len(entries)<=r['maxParallelControllers'];assert not r.get('maxUnits') or units<=r['maxUnits']
  assert actual['uses']==uses and actual['occupiedPicoseconds']==dur and actual['peakPowerMicrowatts']==max(powers,default=0)
  if r.get('maxUnits') or r.get('domainUnits'):assert actual['peakUnits']==max(peaks,default=0)
  else:assert 'peakUnits' not in actual
 return d
try:
 d=verify(run(config));assert [[e['controller'] for e in w['entries']] for w in d['source']['source']['schedule']['waves']]==[[0,2],[0,3],[1]];assert d['usage']['rows'][0]['peakUnits']==4 and d['usage']['rows'][0]['occupiedPicoseconds']==48021
 default=copy.deepcopy(config);default['scheduling']['resources'][0].pop('maxUnits');default['scheduling']['resources'][0].pop('domainUnits');z=verify(run(default));explicit=copy.deepcopy(default);explicit['scheduling']['resources'][0].update(maxUnits=0,domainUnits=[]);assert clean(run(explicit))==clean(z)
 manual=[*base,'--test-max-parallel','2','--schedule-max-power','1000000','--time-wave-overhead','7','--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),*[v for q in 'abcd' for v in ['--test-clock',q,'1000']],'--schedule-resources',file('resources.json',dict(formatVersion=1,kind='memory-schedule-resources',resources=[resource])),'--test-resource-usage'];same=call(manual);assert same['usage']==d['usage'] and same['source']['source']['schedule']==d['source']['source']['schedule']
 for cap in range(1,11):verify(run(config,['--usage-max-work',str(cap),'--require-complete'],0 if cap==10 else 4))
 blocked=copy.deepcopy(config);blocked['scheduling']['resources'][0]['domainUnits'][0]['units']=5;blocked['scheduling']['dependencies']=[dict(before='a',after='b')];b=verify(run(blocked,['--require-complete'],4));assert b['source']['source']['schedule']['controllers'][0]==dict(nextStep=0,status='blocked',reason='resource_units_exceeded',resource=0)
 coverage=run(blocked,mode='--test-coverage');reasons=[x.get('reason') for x in coverage['coverage']['rows']];assert reasons.count('resource_units_exceeded')==2 and reasons.count('prior_step_blocked')==2 and reasons.count('dependency_blocked')==2
 compare=[*base,'--compare-test-config','default',file('default.json',default),'--compare-test-config','weighted',file('weighted.json',config),'--compare-resource-usage'];cmp=call(compare);assert 'peakUnits' not in cmp['rows'][0]['cells'][0]['delta'] and cmp['rows'][0]['cells'][1]['delta']['peakUnits']==0
 reverse=call([*base,'--compare-test-config','weighted',file('weighted.json',config),'--compare-test-config','default',file('default.json',default),'--compare-resource-usage']);assert reverse['rows'][0]['cells'][0]['delta']['peakUnits']==0 and reverse['rows'][0]['cells'][1]['delta']['peakUnits']==0
 partial=call([*compare,'--usage-max-work','1','--require-complete'],4);assert all('delta' not in c for c in partial['rows'][0]['cells'])
 big=copy.deepcopy(config);big['scheduling']['resources'][0].update(maxUnits=0,domainUnits=[dict(clockDomain=x,units=10**12) for x in 'abcd']);v=verify(run(big));assert v['usage']['rows'][0]['peakUnits']==4*10**12
 rng=random.Random(731)
 for seed in range(20):
  c=copy.deepcopy(config);resources=[]
  for ri in range(1+seed%3):
   domains=rng.sample(list('abcd'),rng.randint(1,4));resources.append(dict(name=str(ri),clockDomains=domains,maxParallelControllers=rng.randint(1,4),maxUnits=rng.randint(3,9),domainUnits=[dict(clockDomain=x,units=rng.randint(1,3)) for x in domains]))
  c['scheduling']['resources']=resources;verify(run(c,['--usage-max-work',str(1+seed)] if seed%3==0 else []))
 badValues=[-1,1000000000001,True,1.5,'2',None]
 invalid=[]
 for v in badValues:
  x=copy.deepcopy(resource);x['maxUnits']=v;invalid.append(x)
 for v in [0,*badValues]:
  x=copy.deepcopy(resource);x['domainUnits'][0]['units']=v;invalid.append(x)
 for entries in [[dict(clockDomain='absent',units=1)],[dict(clockDomain='a',units=1),dict(clockDomain='a',units=2)],[dict(clockDomain='a',units=1,extra=1)],[dict(clockDomain='a')],[dict(units=1)],[dict(clockDomain='a\x00',units=1)],{},None,[dict(clockDomain='a',units=1)]*1025]:
  x=copy.deepcopy(resource);x['domainUnits']=entries;invalid.append(x)
 for x in invalid:
  c=copy.deepcopy(config);c['scheduling']['resources']=[x];badBase=[str(v) if v!=str(ROOT/'tests/memory-test-schedule.sv') else '/missing-unit-test.sv' for v in base];err=call([*badBase,'--test-config',file(f'invalid-{len(calls)}.json',c),'--test-resource-usage'],2);assert err['error']['code']=='invalid_arguments' and 'missing-unit-test.sv' not in err['error']['message']
 negatives=[]
 for val in [-1,1024000000000001,True,'4',4.1]:
  x=copy.deepcopy(d);x['usage']['rows'][0]['peakUnits']=val;negatives.append((x,'rtl-memory-resource-usage-v1'))
 for val in [-1024000000000001,1024000000000001,True,'0',0.5]:
  x=copy.deepcopy(cmp);x['rows'][0]['cells'][1]['delta']['peakUnits']=val;negatives.append((x,'rtl-memory-resource-usage-comparison-v1'))
 x=copy.deepcopy(b);x['source']['source']['schedule']['controllers'][0].pop('resource');negatives.append((x,'rtl-memory-resource-usage-v1'))
 x=copy.deepcopy(partial);x['rows'][0]['cells'][1]['delta']={'occupiedPicoseconds':0,'peakControllers':0,'peakPowerMicrowatts':0,'peakUnits':0};negatives.append((x,'rtl-memory-resource-usage-comparison-v1'))
 for x,a in negatives:assert not validators[a].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),seeds=20,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
