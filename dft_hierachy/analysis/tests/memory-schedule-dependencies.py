"""Real RTL, declared domain precedence, atomic cutoffs and downstream contracts."""
import copy,json,subprocess,sys,tempfile,os,random
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-dependencies-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.rglob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas if 'oneOf' in s and 'properties' in s['oneOf'][0] and 'algorithm' in s['oneOf'][0]['properties']}
inputValidator=Draft202012Validator(next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:memory-schedule-dependencies-input:1'),registry=reg)
for s in schemas:Draft202012Validator.check_schema(s)
def file(name,data):
 p=OUT/name;p.write_text(json.dumps(data));return str(p)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(n,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-schedule-v1')].validate(d);return d
def edge(a,b):return dict(before=a,after=b)
def spec(edges):return dict(formatVersion=1,kind='memory-schedule-dependencies',dependencies=edges)
def waves(d):return [[e['controller'] for e in w['entries']] for w in d['schedule']['waves']]
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests']
assignments=[dict(instancePath='schedule_top.'+n,clockDomain=n[0],partition='') for n in ['a0','a1','a2','a3','b0','b1','c0','d0']]
assign=[v for a in assignments for v in ['--test-instance',a['instancePath'],a['clockDomain'],a['partition']]]
options=['--test-max-parallel','2',*assign,'--schedule-tests','--schedule-max-parallel','4','--schedule-max-power','1000000']
timing=['--time-tests','--time-wave-overhead','7',*[v for d in 'abcd' for v in ['--test-clock',d,'1000']]]
edges=[edge('a','b'),edge('b','c')];ef=file('dependencies.json',spec(edges));inputValidator.validate(spec(edges))
try:
 original=call([*base,*options]);limited=call([*base,*options,'--schedule-dependencies',ef,'--require-complete']);assert waves(limited)==[[0,3],[0],[1],[2]] and limited['schedule']['work']==17;assert clean(original['source'])==clean(limited['source'])
 empty=call([*base,*options,'--schedule-dependencies',file('empty.json',spec([]))]);assert clean(empty)==clean(original)
 config=dict(formatVersion=1,kind='memory-test-config',assignments=assignments,planning=dict(policy=dict(maxParallelMemories=2)),scheduling=dict(policy=dict(maxParallelControllers=4,maxPowerMicrowatts=1000000),dependencies=edges),timing=dict(clocks=[dict(clockDomain=d,periodPicoseconds=1000) for d in 'abcd'],policy=dict(waveOverheadPicoseconds=7)))
 cf=file('config.json',config);via=call([*base,'--test-config',cf,'--schedule-tests']);assert clean(via)==clean(limited)
 timed=call([*base,*options,'--schedule-dependencies',ef,*timing]);assert timed['timeline']['durationPicoseconds']==64028 and len(timed['timeline']['waves'])==4
 cov=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--test-coverage']);assert cov['coverage']['timedInstances']==8 and clean(cov['source'])==clean(timed)
 expectations=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain=d,sources=[dict(path='schedule_top.clk',bit=0,edge='posedge')]) for d in 'abcd']);xf=file('clocks.json',expectations)
 joint=call([*base,'--test-config',cf,'--schedule-tests','--time-tests','--assess-tests',xf]);assert joint['assessment']['verdict']=='pass'
 free=copy.deepcopy(config);free['scheduling'].pop('dependencies');ff=file('free.json',free)
 compare=[*base,'--schedule-tests','--time-tests','--compare-test-config','free',ff,'--compare-test-config','ordered',cf]
 compared=call(compare);assert compared['rows'][1]['delta']['scheduledWaves']==2 and compared['rows'][1]['delta']['durationPicoseconds']==32014
 assessed=call([*compare,'--compare-clock-expectations','free',xf,'--compare-clock-expectations','ordered',xf]);assert assessed['complete'] and assessed['rows'][1]['delta']==dict(satisfiedInstances=0,blockedInstances=0,pendingInstances=0)
 missing=copy.deepcopy(config);missing['scheduling']['dependencies']=[edge('absent','a'),*edges];mf=file('missing-domain.json',missing)
 blocked=call([*base,'--test-config',mf,'--schedule-tests','--time-tests','--test-coverage','--require-complete'],4);assert blocked['coverage']['blockedInstances']==7 and blocked['coverage']['timedInstances']==1
 reasons=[r.get('reason') for r in blocked['coverage']['rows']];assert reasons==['dependency_unavailable']*2+['prior_step_blocked']*2+['dependency_blocked']*3+[None]
 fail=call([*base,'--test-config',mf,'--schedule-tests','--time-tests','--assess-tests',xf]);assert fail['assessment']['verdict']=='fail' and not fail['assessment']['complete'] and fail['assessment']['blockedInstances']==7
 partial=call([*base,'--schedule-tests','--time-tests','--compare-test-config','free',ff,'--compare-test-config','blocked',mf,'--compare-clock-expectations','free',xf,'--compare-clock-expectations','blocked',xf]);assert not partial['complete'] and 'delta' not in partial['rows'][1]
 byrule=call([*base,'--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json'),'--test-max-parallel','2','--schedule-tests','--schedule-max-power','1000000','--schedule-dependencies',ef]);assert byrule['schedule']==limited['schedule']
 for cap in range(1,19):
  d=call([*base,*options,'--schedule-dependencies',ef,'--schedule-max-work',str(cap),'--require-complete'],0 if cap>=17 else 4);assert d['schedule']['work']==min(cap,17);assert len(waves(d))==(0 if cap<6 else 1 if cap<11 else 2 if cap<15 else 3 if cap<17 else 4)
 # Independent DAG invariant check from source plan and public declarations.
 # Random acyclic domain ordering, resource constraints and all steps of each predecessor.
 rng=random.Random(219)
 for n in range(24):
  order=list('abcd');rng.shuffle(order);es=[edge(order[i],order[j]) for i in range(4) for j in range(i+1,4) if rng.randrange(2)]
  cfg=copy.deepcopy(config);cfg['scheduling']['dependencies']=es;cfg['planning']['policy']['maxMemoriesPerController']=2;cfg['scheduling']['resources']=[dict(name='shared',maxParallelControllers=1,clockDomains=order[:2])]
  d=call([*base,'--test-config',file('dag'+str(n)+'.json',cfg),'--schedule-tests','--require-complete']);plan=d['source']['plan'];cs=plan['controllers'];ends={};starts={}
  for wi,w in enumerate(d['schedule']['waves']):
   seen=set()
   for e in w['entries']:
    ci=e['controller'];assert ci not in seen;seen.add(ci);starts.setdefault(ci,wi);ends[ci]=wi
   assert sum(cs[ci]['clockDomain'] in order[:2] for ci in seen)<=1
  assert len(ends)==len(cs)
  for e in es:assert max(ends[i] for i,c in enumerate(cs) if c['clockDomain']==e['before'])<min(starts[i] for i,c in enumerate(cs) if c['clockDomain']==e['after'])
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-dependency-design.sv'
 invalid=[spec([edge('a','a')]),spec([edge('a','b'),edge('a','b')]),spec([edge('a','b'),edge('b','c'),edge('c','a')]),spec([edge('','b')]),spec([edge('a','x\0y')]),spec([edge('a','x'*4097)]),spec([edge('a',None)]),spec([dict(before='a',after='b',extra=0)]),spec([dict(before='a')]),spec([edge(str(i),str(i+1)) for i in range(4097)]),dict(formatVersion=2,kind='memory-schedule-dependencies',dependencies=[]),dict(formatVersion=1,kind='wrong',dependencies=[])]
 for n,obj in enumerate(invalid):
  bad=file('bad'+str(n)+'.json',obj);d=call([*absent,*options,'--schedule-dependencies',bad],2);assert 'absent-dependency-design' not in d['error']['message']
  if n<10:
   cfg=copy.deepcopy(config);cfg['scheduling']['dependencies']=obj['dependencies'];call([*absent,'--test-config',file('bad-config'+str(n)+'.json',cfg),'--schedule-tests'],2)
 for name,data in [('duplicate.json',b'{"formatVersion":1,"kind":"memory-schedule-dependencies","dependencies":[],"dependenc\\u0069es":[]}'),('bad-utf8.json',b'\xff'),('large.json',b' '*(1048577)),('broken.json',b'{')]:
  p=OUT/name;p.write_bytes(data);call([*absent,*options,'--schedule-dependencies',str(p)],2)
 for path in [OUT,OUT/'missing']:call([*absent,*options,'--schedule-dependencies',str(path)],2)
 fifo=OUT/'fifo';os.mkfifo(fifo);call([*absent,*options,'--schedule-dependencies',str(fifo)],2)
 link=OUT/'link.json';link.symlink_to(ef);assert clean(call([*base,*options,'--schedule-dependencies',str(link)]))==clean(limited)
 call([*base,'--schedule-dependencies',ef],2);call([*base,*options,'--schedule-dependencies',ef,'--schedule-dependencies',ef],2);call([*base,'--test-config',cf,'--schedule-tests','--schedule-dependencies',ef],2);call([*compare,'--schedule-dependencies',ef],2)
 cfg=copy.deepcopy(config);cfg['scheduling']['dependencies']=[edge('a','a')];call([*absent,'--schedule-tests','--time-tests','--compare-test-config','good',cf,'--compare-test-config','bad',file('bad-final-config.json',cfg)],2)
 negatives=[]
 for change in ['empty','missingAfter','extra','missingIndex','wrongReason']:
  d=copy.deepcopy(blocked['source']['source'])
  if change=='empty':d['schedule']['request']['dependencies']=[]
  elif change=='missingAfter':d['schedule']['request']['dependencies'][0].pop('after')
  elif change=='extra':d['schedule']['request']['dependencies'][0]['extra']=1
  elif change=='missingIndex':d['schedule']['controllers'][0].pop('dependency')
  else:d['schedule']['controllers'][0]['reason']='step_power_exceeded'
  negatives.append(d)
 for d in negatives:assert not validators['rtl-memory-test-schedule-v1'].is_valid(d)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
