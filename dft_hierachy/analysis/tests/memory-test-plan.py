"""Real CLI scheduling, constraints, original investigation and strict format boundary."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-plan-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
base=['--top','plan_top','--scope','plan_top','--recursive',str(ROOT/'tests/memory-test-plan.sv')]
def model(name):return ['--model',name,'8','8',*[x for r,p,s in [('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none')] for x in ['--role',name,r,p,s]]]
models=[*model('plan_ram'),*model('plan_alt')]
profiles=['--test-profile','plan_ram','2','120000','--test-profile','plan_alt','3','80000']
assignments=[x for n in ['a0','b0','c0','d0','e0','f0','g0','h0','x0'] for x in ['--test-instance','plan_top.'+n,'other' if n=='d0' else 'clk','separate' if n=='e0' else '']]
policy=['--test-max-controller-memories','3','--test-max-parallel','3','--test-max-power','250000']
def flags():return [*base,*models,'--plan-tests',*profiles,*assignments,*policy]
def clean(d):
 if isinstance(d,dict):return {k:clean(v) for k,v in d.items() if k not in ['snapshotId','openedAt']}
 if isinstance(d,list):return list(map(clean,d))
 return d
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-plan-v1')].validate(d);return d
def invariants(d):
 p=d['plan'];m=d['investigation']['mapping'];seen=set();bits=0
 for ci,c in enumerate(p['controllers']):
  cost=p['request']['profiles'][c['profile']];geometry=m['request']['models'][c['model']];assert cost['definitionName']==geometry['definitionName'];cycles=0;peak=0;members=0
  for si,s in enumerate(c['steps']):
   assert 0<len(s['memories'])<=p['request']['policy']['maxParallelMemories'];assert s['powerMicrowatts']==len(s['memories'])*cost['powerMicrowatts']<=p['request']['policy']['maxPowerMicrowatts'];assert s['cycles']==geometry['words']*cost['operationsPerWord'];cycles+=s['cycles'];peak=max(peak,s['powerMicrowatts'])
   for i in s['memories']:
    assert i not in seen;seen.add(i);row=p['memories'][i];assert row['status']=='scheduled' and row['controller']==ci and row['step']==si and row['reason']=='';assert m['memories'][row['memory']]['model']==c['model'];a=p['request']['assignments'][row['assignment']];assert a['clockDomain']==c['clockDomain'] and a['partition']==c['partition'];bits+=geometry['words']*geometry['dataBits'];members+=1
  assert members<=p['request']['policy']['maxMemoriesPerController'] and cycles==c['cycles'] and peak==c['peakPowerMicrowatts']
 assert len(seen)==p['scheduledInstances'] and bits==int(p['scheduledCapacityBits']);assert all(row['memory']==i for i,row in enumerate(p['memories']))
try:
 original=call([*base,*models]);full=call([*flags(),'--require-complete'],4);assert clean(full['investigation'])==clean(original);p=full['plan'];assert len(p['controllers'])==5 and p['scheduledInstances']==8 and p['scheduledCapacityBits']==512;invariants(full)
 assert p['controllers'][0]['cycles']==32 and p['controllers'][0]['steps'][1]['reasons']==['power_limit']
 assert p['controllers'][3]['reason']=='controller_capacity';assert p['memories'][-1]['reason']=='interface_unmatched'
 assert clean(call(flags()))==clean(full)
 for cap in ['1','2','8','9','10']:
  d=call([*flags(),'--test-max-work',cap,'--require-complete'],4);assert len(d['plan']['memories'])==min(9,int(cap));invariants(d)
 d=call([*flags(),'--test-max-controllers','1','--require-complete'],4);assert len(d['plan']['memories'])==3 and d['plan']['visitedMemories']==4;invariants(d)
 for key,value in [('--test-max-controller-memories','1'),('--test-max-parallel','1'),('--test-max-power','119999')]:
  a=flags();a[a.index(key)+1]=value;d=call(a);invariants(d)
  if key=='--test-max-power':assert d['plan']['scheduledInstances']==2
  if key=='--test-max-parallel':assert d['plan']['controllers'][0]['cycles']==48
 noassign=call([*base,*models,'--plan-tests',*profiles]);assert noassign['plan']['scheduledInstances']==0 and noassign['plan']['memories'][0]['reason']=='domain_missing'
 extra=call([*flags(),'--test-instance','not.observed','clk','','--require-complete'],4);assert extra['plan']['unusedAssignments']==[9]
 for key in ['--max-macros','--map-max-macros']:
  d=call([*flags(),key,'2','--require-complete'],4);assert d['plan']['scheduledInstances']==2 and 'mapping_partial' in d['plan']['reasons'];invariants(d)
 for page in ['1','2000']:
  d=call([*flags(),'--page-size',page]);assert d['plan']==p
 local=call(['--top','plan_top','--scope','plan_top.a0',str(ROOT/'tests/memory-test-plan.sv'),*models,'--plan-tests',*profiles,'--test-instance','plan_top.a0','declared','','--require-complete']);assert local['plan']['complete'] and local['plan']['scheduledInstances']==1
 empty=call(['--top','plan_top','--scope','plan_top',str(ROOT/'tests/memory-test-plan.sv'),*models,'--plan-tests',*profiles,'--require-complete']);assert empty['plan']['complete'] and not empty['plan']['memories']
 # New format retains the actual open library while keeping the old library schema unchanged.
 lib=['--library-source','explicit',*[str(x) for name,direction,width in [('CLK','in',1),('A','in',3),('D','in',8),('Q','out',8)] for x in ['--library-pin','missing_ram',name,direction,width]]]
 a=['--top','library_top','--scope','library_top.positional',str(ROOT/'tests/memory-library.sv'),*model('missing_ram'),'--plan-tests','--test-profile','missing_ram','10','1000','--test-instance','library_top.positional','declared','']
 d=call(a);assert d['plan']['scheduledInstances']==0 and d['plan']['memories'][0]['reason']=='interface_unmatched'
 d=call([*a,*lib]);assert d['library']['source']=='explicit' and d['plan']['scheduledInstances']==1 and not d['investigation']['interfaces']['catalog']['snapshot']['inputHashComplete'];invariants(d)
 # Every planning error precedes opening deliberately missing input.
 missing=['--top','plan_top','--scope','absent','/missing-test-plan.sv',*models]
 invalid=[['--test-max-work','1'],['--plan-tests'],['--plan-tests',*profiles,'--test-max-work','0'],['--plan-tests',*profiles,'--test-max-controllers','10001'],['--plan-tests',*profiles,'--test-max-controller-memories','1025'],['--plan-tests',*profiles,'--test-max-parallel','0'],['--plan-tests',*profiles,'--test-max-power','0'],['--plan-tests',*profiles,'--test-max-millis','60001'],['--plan-tests',*profiles,'--test-instance','a','',''],['--plan-tests',*profiles,'--test-instance','a','clk','','--test-instance','a','clk',''],['--plan-tests','--test-profile','plan_ram','1025','1','--test-profile','plan_alt','1','1'],['--plan-tests','--test-profile','plan_ram','1','0','--test-profile','plan_alt','1','1'],['--plan-tests','--test-profile','plan_ram','1','1','--test-profile','plan_ram','1','1'],['--plan-tests',*profiles,'--plan-tests']]
 for opts in invalid:
  d=call([*missing,*opts],2);assert d['error']['code']=='invalid_arguments' and d['error']['message']!='invalid design inputs or options'
 assert call([*base,'--plan-tests','--definition','plan_ram'],2)['error']['code']=='invalid_arguments'
 # Strict invalid-wire rejection and old-format separation.
 validator=validators['rtl-memory-test-plan-v1'];negative=[]
 for modify in [lambda d:d['plan']['memories'][0].pop('step'),lambda d:d['plan']['memories'][-1].update(controller=0),lambda d:d['plan']['request']['profiles'][0].update(operationsPerWord=0),lambda d:d['plan']['controllers'][0]['steps'][0].update(powerMicrowatts=0),lambda d:d.update(unexpected=True),lambda d:d['plan'].update(complete=True)]:
  bad=copy.deepcopy(full);modify(bad);assert not validator.is_valid(bad);negative.append(bad)
 assert not validators['rtl-memory-map-v1'].is_valid(full) and not validators['rtl-library-memory-v1'].is_valid(full)
 (OUT/'schema-negative.json').write_text(json.dumps(negative,indent=2));print(json.dumps(dict(calls=len(calls),schemaNegative=len(negative)+2,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
