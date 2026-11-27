"""Declared periods and exact barrier timings on actual Core-generated plans."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-timing-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
for s in schemas:Draft202012Validator.check_schema(s)
base=['--top','schedule_top','--scope','schedule_top','--recursive',str(ROOT/'tests/memory-test-schedule.sv'),'--memory-library',str(ROOT/'tests/memory-test-schedule-library.json'),'--plan-tests','--test-max-parallel','2','--schedule-tests','--schedule-max-parallel','2','--schedule-max-power','300000']
assign=[x for n in ['a0','a1','a2','a3','b0','b1','c0','d0'] for x in ['--test-instance','schedule_top.'+n,n[0],'']]
rules=['--test-rules',str(ROOT/'tests/memory-test-schedule-rules.json')]
clocks=[x for d,p in [('a',1000),('b',2000),('c',3000),('d',4000),('unused',1)] for x in ['--test-clock',d,str(p)]]
opts=['--time-tests','--time-wave-overhead','7']
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-timing-v1')].validate(d);return d
def verify(d):
 t=d['timeline'];s=d['source'];original=s['source'];p=original.get('report',original);end=0;steps=0;memories=set();bits=0;used=set()
 for wi,w in enumerate(t['waves']):
  source=s['schedule']['waves'][wi];assert len(w['entries'])==len(source['entries']);durations=[]
  for e,ref in zip(w['entries'],source['entries']):
   ctrl=p['plan']['controllers'][ref['controller']];step=ctrl['steps'][ref['step']];c=t['request']['clocks'][e['clock']];assert c['clockDomain']==ctrl['clockDomain'];duration=int(step['cycles'])*c['periodPicoseconds'];assert e['durationPicoseconds']==duration;durations.append(duration);used.add(e['clock']);steps+=1;m=p['investigation']['mapping']['request']['models'][ctrl['model']]
   for mi in step['memories']:assert mi not in memories;memories.add(mi);bits+=m['words']*m['dataBits']
  duration=max(durations)+t['request']['policy']['waveOverheadPicoseconds'];assert w['startPicoseconds']==end and w['durationPicoseconds']==duration;end+=duration;assert w['endPicoseconds']==end<=t['request']['policy']['maxDurationPicoseconds']
 assert (end,steps,len(memories),bits)==(t['durationPicoseconds'],t['timedSteps'],t['timedInstances'],int(t['timedCapacityBits']))
 assert t['unusedClocks']==[i for i in range(len(t['request']['clocks'])) if i not in used]
 if 'stop' in t:assert t['stop']['wave']==len(t['waves']) and not t['complete'] and t['stop']['reason'] in t['reasons']
 if t['complete']:assert s['schedule']['complete'] and len(t['waves'])==len(s['schedule']['waves']) and not t['reasons'] and 'stop' not in t
 return t
try:
 originals=[]
 for allocation in [assign,rules]:
  previous=call([*base,*allocation]);d=call([*base,*allocation,*opts,*clocks,'--require-complete']);assert clean(d['source'])==clean(previous);t=verify(d);assert t['durationPicoseconds']==144021 and [x['durationPicoseconds'] for x in t['waves']]==[48007,64007,32007];originals.append(d)
 assert originals[0]['timeline']==originals[1]['timeline'];original=originals[0]
 for cap in [1,48006,48007,112013,112014,144020,144021,144022]:
  d=call([*base,*assign,*opts,*clocks,'--time-max-duration',str(cap),'--require-complete'],0 if cap>=144021 else 4);t=verify(d);assert len(t['waves'])==sum(x<=cap for x in [48007,112014,144021])
 for cap in [1,2,3,4,5,6]:
  d=call([*base,*rules,*opts,*clocks,'--time-max-work',str(cap),'--require-complete'],0 if cap>=5 else 4);t=verify(d);assert t['work']==min(cap,5) and len(t['waves'])==sum(x<=cap for x in [2,4,5])
 # A slow member controls each batch, independent of controller order or clock declaration order.
 for periods in [(1,1,1,1),(4000,3000,2000,1000),(999999999999,1,1,1),(17,97,31,11)]:
  arguments=[x for (domain,period) in reversed(list(zip('abcd',periods))) for x in ['--test-clock',domain,str(period)]]
  d=call([*base,*rules,*opts,*arguments,'--require-complete']);t=verify(d);assert t['durationPicoseconds']==16*(max(periods[0],periods[2])+max(periods[0],periods[3])+periods[1])+21
 withoutD=clocks[:9]+clocks[12:];d=call([*base,*assign,*opts,*withoutD,'--require-complete'],4);t=verify(d);assert t['stop']==dict(wave=1,entry=1,reason='clock_missing') and t['work']==4
 d=call([*base,*rules,*opts,'--require-complete'],4);t=verify(d);assert t['waves']==[] and t['stop']==dict(wave=0,entry=0,reason='clock_missing')
 for flags in [['--schedule-max-waves','1'],['--test-max-work','2'],['--max-macros','2']]:
  d=call([*base,*rules,*opts,*clocks,*flags,'--require-complete'],4);t=verify(d);assert t['reasons'][0]=='schedule_partial'
 empty=base.copy();empty.remove('--recursive');t=verify(call([*empty,*opts,*clocks,'--require-complete']));assert t['complete'] and t['durationPicoseconds']==0 and t['unusedClocks']==list(range(5))
 # Full validation before opening invalid RTL, and explicit mode gates.
 absent=base.copy();absent[absent.index(str(ROOT/'tests/memory-test-schedule.sv'))]='/absent-before-timing-validation.sv'
 for key,values in [('wave-overhead',['1000000000001']),('max-duration',['0','9007199254740992']),('max-work',['0','10000001']),('max-millis',['0','60001'])]:
  for value in values:
   d=call([*absent,*assign,'--time-tests','--time-'+key,value],2);assert 'Invalid memory timing' in d['error']['message']
 for domain,period in [('',1000),('a',0),('a',1000000000001)]:
  d=call([*absent,*assign,'--time-tests','--test-clock',domain,str(period)],2);assert 'Invalid memory test clock' in d['error']['message']
 call([*absent,*assign,'--time-tests','--test-clock','a','1','--test-clock','a','2'],2)
 for extra in [['--test-clock','a','1000'],['--time-max-work','1'],['--time-max-duration','1'],['--time-wave-overhead','0']]:call([*base,*assign,*extra],2)
 noSchedule=base.copy();noSchedule.remove('--schedule-tests');call([*noSchedule,*assign,*opts,*clocks],2)
 call([*base,*assign,'--time-tests','--time-tests'],2);call([*base,*assign,'--time-tests','--time-max-work','1','--time-max-work','2'],2)
 call([*base,*assign,'--time-tests','--test-clock','a','1.0'],2)
 # Raw actual wide-address source exercises overflow without fabricated plans.
 large=['--top','timing_top','--scope','timing_top.big',str(ROOT/'tests/memory-test-timing.sv'),'--model','timing_large','4294967296','8','--role','timing_large','clock','CLK','posedge','--role','timing_large','address','A','none','--role','timing_large','data_in','D','none','--role','timing_large','data_out','Q','none','--plan-tests','--test-profile','timing_large','1','1','--test-instance','timing_top.big','b','','--schedule-tests','--time-tests','--require-complete']
 for period,reason in [(4294967296,'duration_overflow'),(4294967295,'duration_limit'),(1,None)]:
  d=call([*large,'--test-clock','b',str(period)],0 if reason is None else 4);t=verify(d)
  if reason:assert t['stop']['reason']==reason and t['timedInstances']==0
  else:assert t['complete'] and t['durationPicoseconds']==4294967296
 negatives=[]
 for field in ['source','timeline']:
  d=copy.deepcopy(original);d.pop(field);negatives.append(d)
 for field in ['request','waves','durationPicoseconds','timedInstances','unusedClocks','work']:
  d=copy.deepcopy(original);d['timeline'].pop(field);negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['waves'][0]['entries']=[];negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['waves'][0]['entries'][0]['clock']=-1;negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['reasons']=['clock_missing'];negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['stop']=dict(wave=0,reason='duration_limit');negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['request']['clocks'][0]['periodPicoseconds']=0;negatives.append(d)
 d=copy.deepcopy(original);d['timeline']['extra']=0;negatives.append(d)
 for d in negatives:assert not validators['rtl-memory-test-timing-v1'].is_valid(d)
 assert not validators['rtl-memory-test-schedule-v1'].is_valid(original)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(negatives)+1,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
