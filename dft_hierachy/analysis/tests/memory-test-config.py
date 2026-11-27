"""Reusable config is equivalent to existing CLI inputs; strict whole-file validation."""
import copy,json,os,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-config-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')],*[json.loads(f.read_text()) for f in (ROOT/'memory/input').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0]}
configSchema=next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:memory-test-config-input:1');validator=Draft202012Validator(configSchema,registry=reg)
for s in schemas:Draft202012Validator.check_schema(s)
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests']
original=json.loads((ROOT/'tests/memory-test-config.json').read_text());validator.validate(original)
assign=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']]
planning=['--test-max-parallel','2'];scheduling=['--schedule-max-parallel','2','--schedule-max-power','300000'];timing=['--time-wave-overhead','7',*[x for d,p in zip('abcd',[1000,2000,3000,4000]) for x in ['--test-clock',d,str(p)]]]
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-timing-v1')].validate(d);return d
def save(c):
 p=OUT/('config-'+str(len(calls))+'.json');p.write_text(json.dumps(c));return str(p)
def use(c,flags=(),code=0,b=None):return call([*(base if b is None else b),'--test-config',save(c),*flags],code)
try:
 for useRules in [False,True]:
  c=copy.deepcopy(original)
  if not useRules:c.pop('rules');c['assignments']=assign
  allocation=['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')] if useRules else [x for a in assign for x in ['--test-instance',a['instancePath'],a['clockDomain'],a['partition']]]
  for stage in range(3):
   flags=(['--schedule-tests'] if stage else [])+(['--time-tests'] if stage==2 else [])
   old=call([*base,*allocation,*planning,*flags,*(scheduling if stage else []),*(timing if stage==2 else []),'--require-complete'])
   new=use(c,[*flags,'--require-complete']);assert clean(old)==clean(new),(useRules,stage)
   if stage==2:assert new['timeline']['durationPicoseconds']==144021 and new['timeline']['timedInstances']==8
 # Static declarations remain a supported source of model costs.
 static=base[:];i=static.index('--memory-library');del static[i:i+2];static+=['--model','schedule_ram','8','8','--test-profile','schedule_ram','2','100000']
 for role,pin,sense in [('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none')]:static+=['--role','schedule_ram',role,pin,sense]
 assert clean(use(original,['--schedule-tests','--time-tests'],b=static))==clean(new)
 minimal=dict(formatVersion=1,kind='memory-test-config',assignments=[])
 assert clean(use(minimal))==clean(call(base))
 defaults=copy.deepcopy(minimal);defaults.update(planning=dict(policy={},limits={}),scheduling=dict(policy={},limits={}),timing=dict(clocks=[],policy={},limits={}))
 assert clean(use(defaults,['--schedule-tests','--time-tests']))==clean(call([*base,'--schedule-tests','--time-tests']))
 noTiming=copy.deepcopy(original);noTiming.pop('timing');d=use(noTiming,['--schedule-tests','--time-tests','--require-complete'],4);assert d['timeline']['stop']['reason']=='clock_missing'
 for section,group,key,cap in [('planning','limits','maxWork',2),('scheduling','limits','maxWaves',1),('timing','limits','maxWork',1),('timing','policy','maxDurationPicoseconds',48007)]:
  c=copy.deepcopy(original);c[section].setdefault(group,{})[key]=cap;d=use(c,['--schedule-tests','--time-tests','--require-complete'],4);assert not d['timeline']['complete']
 # Every policy/limit is validated even in plan-only mode, before missing RTL.
 absent=base[:];absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-before-config-validation.sv'
 negatives=[]
 for section in ['planning','scheduling','timing']:
  for group in ['policy','limits']:
   for key,rule in configSchema['properties'][section]['properties'][group]['properties'].items():
    for value in [rule['minimum']-1,rule['maximum']+1,None,True,1.1]:
     c=copy.deepcopy(original);c[section].setdefault(group,{})[key]=value;negatives.append(c)
 for path in [[],['planning'],['planning','policy'],['scheduling'],['timing'],['timing','clocks',0],['rules',0]]:
  c=copy.deepcopy(original);o=c
  for key in path:o=o[key]
  o['unknown']=0;negatives.append(c)
 for key in ['formatVersion','kind','rules']:
  c=copy.deepcopy(original);c.pop(key);negatives.append(c)
 for value in [None,[],{},'bad']:
  c=copy.deepcopy(original);c['timing']=value;negatives.append(c)
 for key,value in [('assignments',[]),('rules',[]),('rules',None),('formatVersion',2)]:
  c=copy.deepcopy(original);c[key]=value;negatives.append(c)
 for c in negatives:
  assert not validator.is_valid(c);d=use(c,code=2,b=absent);assert d['error']['code']=='invalid_arguments'
 # Semantics beyond JSON Schema: duplicate names/selectors and bounded UTF-8 bytes.
 semantic=[]
 c=copy.deepcopy(original);c['rules'].append(c['rules'][0]);semantic.append(c)
 c=copy.deepcopy(original);c['timing']['clocks'].append(c['timing']['clocks'][0]);semantic.append(c)
 c=copy.deepcopy(minimal);c['assignments']=[assign[0],assign[0]];semantic.append(c)
 c=copy.deepcopy(original);c['rules'][0]['clockDomain']='中'*1400;semantic.append(c)
 for c in semantic:use(c,code=2,b=absent)
 # CLI conflict/mode gates are explicit for each option family, regardless of order.
 config=save(original)
 conflicts=[['--test-instance','schedule_top.a0','a',''],['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')],['--test-max-controller-memories','1'],['--test-max-parallel','1'],['--test-max-power','1'],['--test-max-controllers','1'],['--test-max-work','1'],['--test-max-millis','1'],['--schedule-max-parallel','1'],['--schedule-max-power','1'],['--schedule-max-waves','1'],['--schedule-max-work','1'],['--schedule-max-millis','1'],['--test-clock','a','1'],['--time-wave-overhead','0'],['--time-max-duration','1'],['--time-max-work','1'],['--time-max-millis','1']]
 for flags in conflicts:
  for before in [False,True]:call([*absent,*(flags if before else []),'--test-config',config,*([] if before else flags),'--schedule-tests','--time-tests'],2)
 call([*base,'--test-config',config,'--test-config',config],2)
 noPlan=base[:];noPlan.remove('--plan-tests');call([*noPlan,'--test-config',config],2)
 use(original,['--time-tests'],2)
 # File boundaries reuse the regular-file loader; symlink to a regular file is allowed.
 link=OUT/'symlink.json';link.symlink_to(config);assert clean(call([*base,'--test-config',str(link)]))==clean(use(original))
 fifo=OUT/'fifo';os.mkfifo(fifo)
 for p in [OUT,OUT/'absent',fifo]:call([*absent,'--test-config',str(p)],2)
 raw=json.dumps(original).encode();exact=OUT/'exact.json';exact.write_bytes(raw+b' '*(1048576-len(raw)));call([*base,'--test-config',str(exact)])
 over=OUT/'over.json';over.write_bytes(exact.read_bytes()+b' ');call([*absent,'--test-config',str(over)],2)
 for i,data in enumerate([raw+b'\xff',raw.replace(b'"formatVersion": 1',b'"formatVersion":1,"formatVersion":1'),raw.replace(b'"periodPicoseconds": 1000',b'"periodPicoseconds":1000.000000000000001')]):
  p=OUT/f'raw-{i}.json';p.write_bytes(data);call([*absent,'--test-config',str(p)],2)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),semanticNegative=len(semantic),equivalencePairs=9,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
