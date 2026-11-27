"""Hand computed occupancy differences and independent resource-set alignment."""
import copy,json,subprocess,sys,tempfile,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-resource-comparison-cli-'));calls=[]
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
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-resource-usage-comparison-v1')].validate(d);return d
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--schedule-tests','--time-tests']
config=json.loads((ROOT/'tests/memory-test-config.json').read_text());config['scheduling']['resources']=[dict(name='all',maxParallelControllers=4,clockDomains=list('abcd')),dict(name='unused',maxParallelControllers=1,clockDomains=['none'])]
serial=copy.deepcopy(config);serial['scheduling']['policy']['maxParallelControllers']=1;serial['scheduling']['resources'].reverse()
wide=copy.deepcopy(config);wide['planning']['policy']['maxParallelMemories']=4;wide['scheduling']['policy']=dict(maxParallelControllers=4,maxPowerMicrowatts=800000);wide['scheduling']['resources'][0]['clockDomains'].reverse();wide['scheduling']['resources'].append(dict(name='new',maxParallelControllers=1,clockDomains=['d']))
def args(configs):
 a=base.copy()
 for i,c in enumerate(configs):a+=['--compare-test-config',str(i),file(f'case-{len(calls)}-{i}.json',c)]
 return a
def verify(d):
 sources=d['source']['configurations'];uses=d['configurations'];rs=[s['report']['source']['schedule']['request'].get('resources',[]) for s in sources];names=list(dict.fromkeys(r['name'] for resources in rs for r in resources));assert [r['name'] for r in d['rows']]==names;assert d['complete']==all(u['complete'] for u in uses);assert len(uses)==len(sources)
 for row in d['rows']:
  by=[next((i for i,r in enumerate(resources) if r['name']==row['name']),None) for resources in rs];assert len(row['cells'])==len(uses)
  for ci,cell in enumerate(row['cells']):
   ri=by[ci];ref=by[0];assert cell.get('resource')==ri
   if ri is None:status='missing_resource';assert 'resource' not in cell
   elif ref is None:status='reference_missing'
   elif set(rs[ci][ri]['clockDomains'])!=set(rs[0][ref]['clockDomains']):status='domain_mismatch'
   elif not uses[ci]['complete'] or not uses[0]['complete']:status='partial'
   else:status='compared'
   assert cell['status']==status
   if status=='compared':assert cell['delta']=={k:uses[ci]['rows'][ri][k]-uses[0]['rows'][ref][k] for k in ['occupiedPicoseconds','peakControllers','peakPowerMicrowatts']}
   else:assert 'delta' not in cell
 return d
def execute(configs,extra=[],code=0):return verify(call([*args(configs),'--compare-resource-usage',*extra],code))
try:
 configs=[config,serial,wide];a=args(configs);d=verify(call([*a,'--compare-resource-usage']));original=call(a);assert clean(original)==clean(d['source'])
 for i,c in enumerate(configs):
  one=call([*base,'--test-config',file(f'single-{i}.json',c),'--test-resource-usage']);assert clean(one)==clean(dict(formatVersion=1,algorithm='rtl-memory-resource-usage-v1',source=d['source']['configurations'][i]['report'],usage=d['configurations'][i]))
 assert d['rows'][0]['cells']==[dict(status='compared',resource=i,delta=dict(occupiedPicoseconds=dur,peakControllers=pc,peakPowerMicrowatts=pw)) for i,dur,pc,pw in [(0,0,0,0),(1,32014,-1,-100000),(0,-80014,2,500000)]]
 assert d['rows'][2]['cells']==[dict(status='missing_resource'),dict(status='missing_resource'),dict(status='reference_missing',resource=2)]
 execute([wide,serial,config])
 for cap in range(1,11):execute(configs,['--usage-max-work',str(cap),'--require-complete'],0 if cap==10 else 4)
 for cap in range(1,6):execute(configs,['--usage-max-uses',str(cap),'--require-complete'],0 if cap==5 else 4)
 missing=copy.deepcopy(config);missing['timing']['clocks'].pop();execute([config,missing,wide],['--require-complete'],4);execute([missing,config,wide],['--require-complete'],4)
 mismatch=copy.deepcopy(config);mismatch['scheduling']['resources'][0]['clockDomains']=['a'];empty=copy.deepcopy(config);empty['scheduling']['resources']=[];execute([config,mismatch,empty],['--require-complete']);execute([empty,config,wide]);execute([empty,empty])
 changed=copy.deepcopy(config);changed['scheduling']['resources'][0].update(maxParallelControllers=1,recoveryPicoseconds=23,maxPowerMicrowatts=200000);execute([config,changed]);emptyScope=[x for x in args([config,config]) if x!='--recursive'];z=verify(call([*emptyScope,'--compare-resource-usage','--require-complete']));assert z['complete'] and z['rows'][0]['cells'][1]['delta']['occupiedPicoseconds']==0;execute([config]*8)
 long=copy.deepcopy(config);long['scheduling']['resources'][0]['name']='资源'*682+'x'*4;execute([long,long])
 rng=random.Random(730)
 for seed in range(18):
  cfgs=[]
  for ci in range(2+seed%4):
   c=copy.deepcopy(config);c['scheduling']['policy']['maxParallelControllers']=rng.randint(1,4);c['scheduling']['policy']['maxPowerMicrowatts']=800000;resources=[]
   for name in rng.sample(['r0','r1','r2','r3','r4'],rng.randint(0,5)):
    resources.append(dict(name=name,maxParallelControllers=rng.randint(1,4),clockDomains=rng.sample(list('abcd')+['absent'],rng.randint(1,5))))
   c['scheduling']['resources']=resources;cfgs.append(c)
  execute(cfgs, ['--usage-max-work',str(1+seed%13)] if seed%2 else [])
 invalid=args([config,config]);invalid[invalid.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/missing-resource-comparison.sv'
 for flag,values in [('--usage-max-work',['0','10000001','x']),('--usage-max-uses',['0','1000001']),('--usage-max-millis',['0','60001'])]:
  for val in values:bad=call([*invalid,'--compare-resource-usage',flag,val],2);assert bad['error']['code']=='invalid_arguments'
 for mode in ['--test-resource-usage','--test-coverage','--clock-sources','--inspect-test-domains']:
  for flags in [[mode,'--compare-resource-usage'],['--compare-resource-usage',mode]]:call([*invalid,*flags],2)
 for flags in [['--assess-tests','missing.json'],['--check-test-clocks','missing.json'],['--compare-clock-expectations','0','missing.json']]:
  for order in [flags+['--compare-resource-usage'],['--compare-resource-usage']+flags]:call([*invalid,*order],2)
 for a in [[*base,'--compare-resource-usage'],[*args([config]),'--compare-resource-usage'],[*args([config,config]),'--compare-resource-usage','--compare-resource-usage'],[*args([config,config]),'--compare-resource-usage','--test-config',file('invalid-single.json',config)],[x for x in args([config,config]) if x!='--time-tests']+['--compare-resource-usage']]:call(a,2)
 badConfig=copy.deepcopy(config);badConfig['scheduling']['resources'][0]['clockDomains']=[];call([*args([config,badConfig]),'--compare-resource-usage'],2)
 negatives=[]
 for kind in ['missingDelta','extraDelta','missingIndex','extraIndex','badStatus','badDelta','extraField','emptyConfigs','tooManyCells','negativeIndex','badUsage','missingSource']:
  x=copy.deepcopy(d);cell=x['rows'][0]['cells'][0]
  if kind=='missingDelta':cell.pop('delta')
  elif kind=='extraDelta':x['rows'][2]['cells'][2]['delta']=cell['delta']
  elif kind=='missingIndex':cell.pop('resource')
  elif kind=='extraIndex':x['rows'][2]['cells'][0]['resource']=0
  elif kind=='badStatus':cell['status']='equal'
  elif kind=='badDelta':cell['delta']['occupiedPicoseconds']=9007199254740992
  elif kind=='extraField':cell['rank']=1
  elif kind=='emptyConfigs':x['configurations']=[]
  elif kind=='tooManyCells':x['rows'][0]['cells']*=3
  elif kind=='negativeIndex':cell['resource']=-1
  elif kind=='badUsage':x['configurations'][0]['limits']['maxUses']=0
  else:x.pop('source')
  negatives.append(x)
 for x in negatives:assert not validators['rtl-memory-resource-usage-comparison-v1'].is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),seeds=18,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
