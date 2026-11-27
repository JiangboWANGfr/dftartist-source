"""Explicit pulse timeline reference: expand small declaration-based cases, keep huge repeats compressed."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-schedule-cli-'));Safe=9007199254740991
ss=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
v=Draft202012Validator(next(s for s in ss if s['$id']=='urn:dft-studio:analysis:wrapper-activity-schedule:1'),registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in ss]));Draft202012Validator.check_schema(v.schema)
calls=[];checks=0;pairs=0

def need(b,m):
 global checks
 checks+=1
 if not b:raise AssertionError(m)
def run(args,code=0,top='schedule_top',rtl=None):
 argv=[str(binary),'--top',top,str(rtl or root/'wrapper-schedule.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==code,f'{argv}: {x.returncode}!={code} {x.stdout!r}');return json.loads(x.stdout)
def norm(x):
 if isinstance(x,dict):return {k:norm(z) for k,z in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return [norm(z) for z in x]
 return x
def config(ports=('a','b','n','i','p','f'),top='schedule_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name=p,capacity=100) for p in [*ports,'unused']],assignments=[dict(port=p,direction='output',chain=p) for p in ports]))
def audit(x):
 s=x['schedule'];src=x['source'];p=s['pulse'];need(s['periodTicks']==p['highTicks']+p['lowTicks'] and s['batchTicks']==p['setupTicks']+p['pulses']*s['periodTicks'],'duration');need(s['work']<=s['limits']['maxWork'] and len(s['rows'])<=s['limits']['maxRows'],'budget')
 elapsed=bits=chains=0
 for i,row in enumerate(s['rows']):
  batch=src['activity']['batches'][i];need(row['batch']==i and row['start']==elapsed and row['end']==elapsed+s['batchTicks'],'consecutive complete rows');need(row['clockGroup']==batch['clockGroup'],'original clock group');need(row['idleHigh']!=row['activeHigh'],'clock levels')
  need(row['activeTicks']==p['highTicks' if row['activeHigh'] else 'lowTicks'] and row['idleTicks']==p['highTicks' if row['idleHigh'] else 'lowTicks'],'high low durations')
  need(row['firstEdge']==elapsed+p['setupTicks'] and row['lastEdge']==row['firstEdge']+(p['pulses']-1)*s['periodTicks'] and row['lastReturn']==row['lastEdge']+row['activeTicks'],'compressed arithmetic');need(row['end']-row['lastReturn']==row['idleTicks'],'final idle')
  need(row['holds']==[dict(input=h['input'],high=h['high']) for h in batch['holds']],'original holds, false kept');bits+=batch['sharedBits'];chains+=len(batch['chains']);elapsed=row['end']
 need(s['counts']==dict(batches=len(s['rows']),chains=chains,sharedBits=bits,elapsedTicks=elapsed),'committed counts');need(elapsed<=s['limits']['maxTicks'],'time ceiling')
 if s.get('stop'):need(s['stop']['batch']==len(s['rows']),'next unpublished batch')
 if not src['activity']['complete']:need(not s['complete'] and 'source_partial' in s['reasons'],'source partial')
def inspect(cfg=None,flags=(),pulse=(2,3,5,4),complete=True,pair=False,rtl=None):
 global pairs
 cfg=cfg or config();f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));pf=[]
 for key,value in zip(['setup','high','low','count'],pulse):pf+=['--pulse-'+key,str(value)]
 x=run(['--config',str(f),'--schedule-activity','--require-complete',*pf,*flags],0 if complete else 4,cfg['boundary']['scope'],rtl);v.validate(x);audit(x)
 if pair:
  upstream=[]
  for i,arg in enumerate(flags):
   if arg.startswith(('--max-activity-','--max-compatibility-','--max-clock-','--max-reset-')) or arg=='--clock-page-size':upstream+=flags[i:i+2]
  old=run(['--config',str(f),'--plan-activity',*upstream],top=cfg['boundary']['scope'],rtl=rtl);need(norm(old)==norm(x['source']),'whole original activity');pairs+=1
 return x,f
try:
 base,f=inspect(pair=True);need(base['schedule']['counts']==dict(batches=3,chains=6,sharedBits=6,elapsedTicks=102),'explicit total');rows=base['schedule']['rows'];need([(r['start'],r['firstEdge'],r['lastEdge'],r['lastReturn'],r['end']) for r in rows]==[(0,2,26,29,34),(34,36,60,65,68),(68,70,94,97,102)],'hand timeline');need([r['idleHigh'] for r in rows]==[False,True,False],'effective edges');need(rows[2]['holds'][0]['high'] is False,'low hold present')
 for n in range(1,base['schedule']['work']+1):
  p,_=inspect(flags=['--max-schedule-work',str(n)],complete=n==base['schedule']['work']);need(p['schedule']['rows']==rows[:len(p['schedule']['rows'])],'atomic row prefix')
 for n in [1,33,34,35,67,68,101,102]:
  p,_=inspect(flags=['--max-schedule-ticks',str(n)],complete=n>=102);need(len(p['schedule']['rows'])==n//34,'ticks capacity')
 for n in [1,2,3]:inspect(flags=['--max-schedule-rows',str(n)],complete=n==3)
 p,_=inspect(flags=['--max-schedule-ticks','1','--max-schedule-work','1'],complete=False);need(p['schedule']['work']==0 and p['schedule']['stop']['reason']=='budget_ticks','capacity before work')
 p,_=inspect(flags=['--max-schedule-rows','1','--max-schedule-ticks','34'],complete=False);need(p['schedule']['stop']['reason']=='budget_rows','rows before ticks')
 for flag in ['--max-activity-work','--max-activity-batches','--max-compatibility-groups','--max-clock-rows','--max-reset-rows']:
  p,_=inspect(flags=[flag,'1'],complete=False,pair=True);need(not p['schedule']['complete'],'upstream preserved')
 p,_=inspect(config(['a','g']),complete=False,pair=True);need(len(p['schedule']['rows'])==1,'local schedule keeps source unknown');cfg=config(['a']);cfg['planning']=dict(rules=[dict(port='a',direction='output',action='dedicated')]);p,_=inspect(cfg,complete=False);need(not p['schedule']['rows'],'dedicated no fabricated schedule');cfg['planning']['rules'][0]['action']='exclude';p,_=inspect(cfg);need(p['schedule']['counts']['elapsedTicks']==0,'empty zero duration')
 # Very large pulse counts / duration use constant-size reports and exact integer arithmetic.
 for pulse in [(1,1,1,(Safe-1)//2),(0,Safe-1,1,1),(0,1,Safe-1,1),(0,3,5,1)]:
  p,_=inspect(config(['a']),pulse=pulse);need(p['schedule']['counts']['elapsedTicks']==pulse[0]+pulse[3]*(pulse[1]+pulse[2]),'large exact duration');need(len(json.dumps(p['schedule']))<2000,'compressed independent of pulses')
 p,_=inspect(config(['a','n']),pulse=(1,1,1,(Safe-1)//2),complete=False);need(len(p['schedule']['rows'])==1 and p['schedule']['stop']['reason']=='budget_ticks','cumulative safe capacity')
 # Independent declaration and expanded pulse-event oracle; no derived output used for expected polarity or timing.
 rng=random.Random(22646)
 for case in range(24):
  declared=[(rng.randrange(2),rng.randrange(2)) for _ in range(4)];pulse=(rng.randrange(5),1+rng.randrange(7),1+rng.randrange(7),1+rng.randrange(6));rtl=['module generated(input logic c,r,d,output logic '+','.join('q'+str(i) for i in range(4))+');']
  for i,(invert,negative) in enumerate(declared):rtl+=[f"wire clk{i}={'~' if invert else ''}c;",f"always_ff @({['posedge','negedge'][negative]} clk{i} or negedge r) if(!r) q{i}<=0;else q{i}<=d;"]
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));cfg=config(['q'+str(i) for i in range(4)],'generated');p,_=inspect(cfg,['--max-activity-chains','2'],pulse,pair=True,rtl=path)
  groups=[]
  for ch,(inv,neg) in enumerate(declared):
   edge=inv^neg
   for g in groups:
    if len(g)<2 and (declared[g[0]][0]^declared[g[0]][1])==edge:g.append(ch);break
   else:groups.append([ch])
  need([b['chains'] for b in p['source']['activity']['batches']]==groups,'independent batching');elapsed=0
  for row,g in zip(p['schedule']['rows'],groups):
   negative=bool(declared[g[0]][0]^declared[g[0]][1]);need(row['idleHigh']==negative and row['activeHigh']!=negative,'declaration effective polarity');setup,high,low,count=pulse;clock=negative;t=elapsed+setup;events=[]
   for k in range(count):
    events.append((t,not clock));t+=low if negative else high;events.append((t,clock));t+=high if negative else low
   need(row['firstEdge']==events[0][0] and row['lastEdge']==events[-2][0] and row['lastReturn']==events[-1][0] and row['end']==t,'expanded event timeline');elapsed=t
  need(p['schedule']['counts']['elapsedTicks']==elapsed,'expanded total')
 cfg=config(['a']);f=e/'valid.json';f.write_text(json.dumps(cfg))
 for flag,high,zero in [('pulse-setup',Safe+1,False),('pulse-high',Safe+1,True),('pulse-low',Safe+1,True),('pulse-count',Safe+1,True),('max-schedule-rows',1025,True),('max-schedule-ticks',Safe+1,True),('max-schedule-work',10000001,True),('max-schedule-millis',60001,True)]:
  for value in [str(high),'-1','x','1.5']+(['0'] if zero else []):v.validate(run(['--config',str(f),'--schedule-activity','--'+flag,value],2))
  run(['--config',str(f),'--'+flag,'1'],2)
 for pulse in [(0,Safe,1,1),(0,1,1,Safe),(Safe,1,1,1)]:
  args=['--config',str(f),'--schedule-activity']
  for key,value in zip(['setup','high','low','count'],pulse):args+=['--pulse-'+key,str(value)]
  v.validate(run(args,2))
 for args in [['--schedule-activity'],['--config',str(f),'--schedule-activity','--compatibility-group','g','a']]+[['--config',str(f),'--schedule-activity',mode] for mode in ['--plan-activity','--chain-compatibility','--chain-resets','--chain-clocks','--chain-coverage','--plan-cells']]:v.validate(run(args,2))
 manual=run(['--scope','schedule_top','--port','a','--plan-chains','--chain','a','100','--chain','unused','100','--chain-port','a','output','a','--schedule-activity']);cfgout,_=inspect(config(['a']),pulse=(1,1,1,1));need(norm(manual)==norm(cfgout),'manual config default equality');pairs+=1
 mutations=[]
 for field,value in [('algorithm','bad'),('extra',1)]:m=copy.deepcopy(base);m[field]=value;mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['unit']='ns';mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['rows'][0]['idleHigh']=True;mutations.append(m)
 m=copy.deepcopy(base);del m['schedule']['rows'][2]['holds'][0]['high'];mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['pulse']['pulses']=0;mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['rows'][0]['lastReturn']=Safe+1;mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['stop']=dict(reason='budget_ticks',batch=0);mutations.append(m)
 m=copy.deepcopy(base);m['source']['activity']['complete']=False;mutations.append(m)
 m=copy.deepcopy(base);m['schedule']['complete']=False;mutations.append(m)
 for m in mutations:need(not v.is_valid(m),'schema negative')
 print(json.dumps(dict(calls=len(calls),checks=checks,sourcePairs=pairs,referenceCases=24,seed=22646,schemaNegative=len(mutations),output=str(e))))
except Exception:
 print('output:',e);raise
