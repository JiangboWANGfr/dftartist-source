"""Greedy batches: independent RTL declarations and first-fit reference, plus original-report cross checks."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-activity-cli-'))
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);schema=next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:wrapper-chain-activity:1');v=Draft202012Validator(schema,registry=registry);Draft202012Validator.check_schema(schema)
calls=[];checks=0;pairs=0

def need(b,m):
 global checks
 checks+=1
 if not b:raise AssertionError(m)
def run(args,code=0,top='compatibility_top',rtl=None):
 argv=[str(binary),'--top',top,str(rtl or root/'wrapper-compatibility.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);n=len(calls)
 (e/f'{n}.stdout').write_bytes(x.stdout);(e/f'{n}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==code,f'{argv}: {x.returncode}!={code} {x.stdout!r}');return json.loads(x.stdout)
def norm(x):
 if isinstance(x,dict):return {k:norm(z) for k,z in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return [norm(z) for z in x]
 return x
def config(ports=('qa','qb','qp','qc','qfree','qh','qg'),top='compatibility_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name=p,capacity=100) for p in [*ports,'unused']],assignments=[dict(port=p,direction='output',chain=p) for p in ports]))
def audit(x):
 a=x['activity'];s=x['source']['compatibility'];rows=a['rows'];need(a['work']<=a['limits']['maxWork'],'work ceiling');need(len(a['batches'])<=a['limits']['maxBatches'],'batch cap');need(a['counts']['chains']==len(rows),'atomic rows')
 for status in ['assigned','conflict','unresolved','empty','oversized','pending']:need(a['counts'][status]==sum(r['status']==status for r in rows),'atomic count '+status)
 seen=set();total=0
 for bi,b in enumerate(a['batches']):
  need(0<len(b['chains'])<=a['limits']['maxChainsPerBatch'] and b['sharedBits']<=a['limits']['maxSharedBitsPerBatch'],'capacity');bits=0
  for ch in b['chains']:
   need(ch not in seen and ch<len(rows) and rows[ch]['batch']==bi and rows[ch]['status']=='assigned','unique committed member');seen.add(ch);bits+=s['rows'][ch]['allocatedSharedBits']
  need(bits==b['sharedBits'],'batch inventory');total+=bits;need(all(h['low']!=h['high'] for h in b['holds']),'holds consistent')
 need(total==a['counts']['assignedSharedBits'] and len(seen)==a['counts']['assigned'],'total committed inventory')
 for i,r in enumerate(rows):need(r['chain']==i and ('sourceRow' in r)==(r['status']!='pending'),'source and prefix')
 if a.get('stop'):need(a['stop']['chain']==len(rows),'stop index')
 if not s['complete']:need(not a['complete'] and 'source_partial' in a['reasons'],'global source incomplete')
def inspect(cfg,flags=(),complete=True,rtl=None,pair=False):
 global pairs
 f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));top=cfg['boundary']['scope'];x=run(['--config',str(f),'--plan-activity','--require-complete',*flags],0 if complete else 4,top,rtl);v.validate(x);audit(x)
 if pair:
  upstream=[]
  for i,flag in enumerate(flags):
   if flag.startswith(('--max-clock-','--max-reset-','--max-compatibility-')) or flag=='--clock-page-size':upstream+=flags[i:i+2]
  original=run(['--config',str(f),'--chain-compatibility',*upstream],top=top,rtl=rtl);need(norm(original)==norm(x['source']),'whole original source');pairs+=1
 return x,f
try:
 x,_=inspect(config(),complete=False,pair=True);need([b['chains'] for b in x['activity']['batches']]==[[0,1,4],[2],[3]],'deterministic first fit');need([r['status'] for r in x['activity']['rows']]==['assigned']*5+['conflict','unresolved','empty'],'unusable retained')
 base,f=inspect(config(['qa','qb','qfree']),pair=True)
 for n in range(1,base['activity']['work']+1):
  part,_=inspect(config(['qa','qb','qfree']),['--max-activity-work',str(n)],n==base['activity']['work']);count=len(part['activity']['rows']);need(part['activity']['rows']==base['activity']['rows'][:count],'row exact prefix')
  for b in part['activity']['batches']:need(b['chains']==[ch for ch in base['activity']['batches'][0]['chains'] if ch<count],'no speculative membership')
 for flag in ['--max-activity-bits','--max-activity-chains']:
  cap,_=inspect(config(['qa','qb','qfree']),[flag,'2']);need([b['chains'] for b in cap['activity']['batches']]==[[0,1],[2]],'capacity grouping')
 cap,_=inspect(config(['qa','qb','qfree']),['--max-activity-bits','2','--max-activity-batches','1'],False);need(len(cap['activity']['rows'])==2 and cap['activity']['stop']['reason']=='budget_batches','batch budget stops new only')
 cap,_=inspect(config(['qa','qb']),['--max-activity-batches','1']);need(cap['activity']['counts']['assigned']==2 and cap['activity']['counts']['empty']==1,'full batch can still receive')
 cfg=config(['qa','qb']);cfg['chaining']['assignments'][1]['chain']='qa';large,_=inspect(cfg,['--max-activity-bits','1']);need(large['activity']['counts']['oversized']==1 and large['activity']['complete'],'oversize is known exclusion')
 for flag in ['--max-compatibility-groups','--max-compatibility-work','--max-clock-rows','--max-reset-rows','--max-reset-events']:
  partial,_=inspect(config(['qa','qb']),[flag,'1'],False,pair=True);need(partial['activity']['counts']['pending']+partial['activity']['counts']['unresolved']>0,'upstream unknowns kept')
 cfg=config(['qa']);cfg['planning']=dict(rules=[dict(port='qa',direction='output',action='dedicated')]);ded,_=inspect(cfg,complete=False);need(ded['activity']['counts']['unresolved']==1,'dedicated controls absent');cfg['planning']['rules'][0]['action']='exclude';empty,_=inspect(cfg);need(empty['activity']['counts']['empty']==2,'excluded empty')
 known,_=inspect(config(['q'],'compatibility_constant'));need(known['activity']['counts']['conflict']==1 and known['activity']['complete'],'known conflict not acceptance')
 for top,ports,expected in [('compatibility_cross',['a','b'],2),('compatibility_bus',['q'],1),('compatibility_unknown_clock',['q'],0),('compatibility_ambiguous',['q'],0)]:
  z,_=inspect(config(ports,top),complete=expected!=0,pair=True);need(len(z['activity']['batches'])==expected,top)
 # Independent declaration-level first-fit reference; no product-derived expected membership.
 rng=random.Random(22645)
 for case in range(24):
  specs=[(rng.randrange(2),rng.randrange(2),rng.randrange(2),rng.randrange(3),rng.randrange(2),rng.randrange(2)) for _ in range(8)]
  if case%6==0:specs=[(0,0,0,2,0,1)]*8
  names=['c','b','r'];rtl=['module generated(input logic c,b,r,d,output logic '+','.join('q'+str(i) for i in range(8))+');']
  for i,(cs,ci,ce,rs,ri,re) in enumerate(specs):rtl += [f"wire clk{i}={'~' if ci else ''}{names[cs]},rst{i}={'~' if ri else ''}{names[rs]};",f"always_ff @({['posedge','negedge'][ce]} clk{i} or {['posedge','negedge'][re]} rst{i}) if({'!' if re else ''}rst{i}) q{i}<=0;else q{i}<=d;"]
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));cfg=config(['q'+str(i) for i in range(8)],'generated');limit=1+rng.randrange(5);expected=[];statuses=[]
  def compatible(members):
   clocks={(specs[i][0],specs[i][1]^specs[i][2]) for i in members};holds={}
   for i in members:
    cs,ci,ce,rs,ri,re=specs[i];holds.setdefault(rs,set()).add(ri^re)
   return len(clocks)==1 and all(len(v)==1 for v in holds.values()) and not any(cs in holds for cs,edge in clocks)
  for ch in range(8):
   if not compatible([ch]):statuses.append('conflict');continue
   statuses.append('assigned')
   for group in expected:
    if len(group)<limit and compatible(group+[ch]):group.append(ch);break
   else:expected.append([ch])
  z,f=inspect(cfg,['--max-activity-chains',str(limit)],rtl=path,pair=True);need([b['chains'] for b in z['activity']['batches']]==expected,'independent greedy reference');need([r['status'] for r in z['activity']['rows']]==statuses+['empty'],'independent singleton states')
  # Re-check each proposed batch through the unchanged explicit-group product.
  args=['--config',str(f),'--chain-compatibility']
  for bi,members in enumerate(expected):
   for ch in members:args+=['--compatibility-group',str(bi),'q'+str(ch)]
  if expected:
   proof=run(args,top='generated',rtl=path)['compatibility'];need(all(r['status']=='compatible' and r['complete'] for r in proof['rows']),'published batch soundness')
   for b,p in zip(z['activity']['batches'],proof['rows']):need(b['sharedBits']==p['allocatedSharedBits'] and b['clockGroup']==p['clockGroups'][0] and b['holds']==p['holds'],'complete aggregate evidence')
 f=e/'valid.json';f.write_text(json.dumps(config(['qa','qb'])))
 for field,hi in [('batches',1025),('chains',1025),('bits',9007199254740992),('work',10000001),('millis',60001)]:
  for value in ['0',str(hi),'-1','x','1.5']:v.validate(run(['--config',str(f),'--plan-activity','--max-activity-'+field,value],2))
  run(['--config',str(f),'--max-activity-'+field,'1'],2)
 for args in [['--plan-activity'],['--config',str(f),'--plan-activity','--compatibility-group','g','qa']]+[['--config',str(f),'--plan-activity',mode] for mode in ['--chain-compatibility','--chain-resets','--chain-clocks','--chain-coverage','--plan-cells']]:v.validate(run(args,2))
 manual=run(['--scope','compatibility_top','--port','qa','--port','qb','--plan-chains','--chain','qa','100','--chain','qb','100','--chain','unused','100','--chain-port','qa','output','qa','--chain-port','qb','output','qb','--plan-activity']);cfgout,_=inspect(config(['qa','qb']));need(norm(manual)==norm(cfgout),'manual/config parity');pairs+=1
 mutations=[]
 for where,key,value in [('root','algorithm','bad'),('activity','policy','optimal'),('activity','extra',1)]:
  m=copy.deepcopy(base);(m if where=='root' else m[where])[key]=value;mutations.append(m)
 m=copy.deepcopy(base);del m['activity']['rows'][0]['batch'];mutations.append(m)
 m=copy.deepcopy(base);m['activity']['rows'][0]['status']='pending';mutations.append(m)
 m=copy.deepcopy(base);m['activity']['batches'][0]['chains']=[0,0];mutations.append(m)
 m=copy.deepcopy(base);m['activity']['batches'][0]['holds'][0].update(low=False,high=False);mutations.append(m)
 m=copy.deepcopy(base);m['activity']['batches'][0]['holds'][0].update(low=True,high=True);mutations.append(m)
 m=copy.deepcopy(base);m['activity']['stop']=dict(reason='budget_work',chain=0);mutations.append(m)
 m=copy.deepcopy(base);m['source']['compatibility']['complete']=False;mutations.append(m)
 for m in mutations:need(not v.is_valid(m),'schema negative')
 print(json.dumps(dict(calls=len(calls),checks=checks,sourcePairs=pairs,referenceCases=24,seed=22645,schemaNegative=len(mutations),output=str(e))))
except Exception:
 print('output:',e);raise
