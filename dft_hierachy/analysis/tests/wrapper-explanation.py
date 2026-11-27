"""Existing findings, declaration coordinates and text; explicit configuration change and re-run."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-explanation-cli-'))
ss=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
v=Draft202012Validator(next(s for s in ss if s['$id']=='urn:dft-studio:analysis:wrapper-chain-explanation:1'),registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in ss]));Draft202012Validator.check_schema(v.schema)
calls=[];checks=0;pairs=0

def need(b,m):
 global checks
 checks+=1
 if not b:raise AssertionError(m)
def run(args,code=0,top='compatibility_top',rtl=None,text=False):
 argv=[str(binary),'--top',top,str(rtl or root/'wrapper-compatibility.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==code,f'{argv}: {x.returncode}!={code} {x.stdout!r}');return x.stdout.decode() if text else json.loads(x.stdout)
def norm(x):
 if isinstance(x,dict):return {k:norm(y) for k,y in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return [norm(y) for y in x]
 return x
def config(ports=('qa','qb','qp','qg'),top='compatibility_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name=n,capacity=100) for n in ['first','unknown','unused']],defaultChain='first',assignments=[dict(port='qg',direction='output',chain='unknown')] if 'qg' in ports else []))
def audit(x):
 ex=x['explanation'];src=x['source'];plan=src['source']['source']['source'];boundary=plan['source']['source'];clock=src['source']['source']['clocks'];reset=src['source']['resets'];need(ex['work']<=ex['limits']['maxWork'] and len(ex['rows'])<=ex['limits']['maxChains'],'limits');need(len({loc['ref'] for loc in ex['locations']})==len(ex['locations'])<=ex['limits']['maxLocations'],'dedup')
 for status in ['compatible','conflict','unresolved','empty','pending']:need(ex['counts'][status]==sum(r['status']==status for r in ex['rows']),'atomic status counts')
 need(ex['counts']['chains']==len(ex['rows']) and ex['counts']['segments']==sum(len(r['segments']) for r in ex['rows'])<=ex['limits']['maxSegments'],'counts')
 for ci,row in enumerate(ex['rows']):
  need(row['chain']==ci,'prefix');need(len(row['segments'])==len(plan['layout']['chains'][ci]['segments']),'whole chain')
  if 'compatibilityRow' in row:
   c=src['compatibility']['rows'][row['compatibilityRow']];need(row['status']==c['status'] and row['controlsComplete']==c['complete'] and row['reasons']==c['reasons'],'no domain reinterpretation')
  else:need(row['status']=='pending' and not row['controlsComplete'],'no observation promotion')
  for si,s in enumerate(row['segments']):
   original=plan['layout']['chains'][ci]['segments'][si];bi=plan['source']['plan']['rows'][original['sourceRow']]['sourceRow'];br=boundary['rows'][bi];port=boundary['ports'][br['port']];need(s['segment']==si and s['boundaryRow']==bi and ex['locations'][s['portLocation']]['ref']==port['ref'],'source join')
   need(('stateLocation' in s)==('signal' in original),'state optional')
   if 'stateLocation' in s:need(ex['locations'][s['stateLocation']]['ref']==original['signal'],'state source')
   for label,rows in [('clock',clock['rows']),('reset',reset['rows'])]:
    if label+'Row' in s:r=rows[s[label+'Row']];need(r['chain']==ci and r['segment']==si,'original control index')
 if ex.get('stop'):need(ex['stop']['chain']==len(ex['rows']),'stop index')
 if not src['compatibility']['complete']:need(not ex['complete'] and 'source_partial' in ex['reasons'],'partial source')
def inspect(cfg=None,flags=(),complete=True,pair=False,rtl=None,textcheck=False):
 global pairs
 cfg=cfg or config();f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));top=cfg['boundary']['scope'];x=run(['--config',str(f),'--explain-chains','--require-complete',*flags],0 if complete else 4,top,rtl);v.validate(x);audit(x)
 if pair:
  upstream=[]
  for i,arg in enumerate(flags):
   if arg.startswith(('--max-compatibility-','--max-clock-','--max-reset-')) or arg=='--clock-page-size':upstream+=flags[i:i+2]
  old=run(['--config',str(f),'--chain-compatibility',*upstream],top=top,rtl=rtl);need(norm(old)==norm(x['source']),'whole original report');pairs+=1
 if textcheck:
  text=run(['--config',str(f),'--explain-chains','--format','text','--require-complete',*flags],0 if complete else 4,top,rtl,True);need(text.startswith('Wrapper chain diagnostics\n') and 'Evidence: '+('complete' if x['explanation']['complete'] else 'partial') in text,'text completeness')
  for r in x['explanation']['rows']:need(f'Chain[{r["chain"]}] '+json.dumps(cfg['chaining']['chains'][r['chain']]['name'],ensure_ascii=False)+': '+r['status'] in text,'same text status')
  for loc in x['explanation']['locations']:
   if 'span' in loc:s=loc['span'];need(json.dumps(s['path'],ensure_ascii=False)+f':{s["start"]["line"]}:{s["start"]["column"]} (declaration)' in text,'same text source')
 return x,f
try:
 base,f=inspect(complete=False,pair=True,textcheck=True);need(base['explanation']['counts']==dict(chains=3,segments=4,compatible=0,conflict=1,unresolved=1,empty=1,pending=0),'hand counts');need(4<=len(base['explanation']['locations'])<=8,'port and state ref reuse')
 for n in range(1,base['explanation']['work']+1):inspect(flags=['--max-explain-work',str(n)],complete=False)
 for n in range(1,len(base['explanation']['locations'])):inspect(flags=['--max-explain-locations',str(n)],complete=False)
 for n in [1,2,3]:inspect(flags=['--max-explain-chains',str(n)],complete=False)
 for n in [1,2,3,4]:inspect(flags=['--max-explain-segments',str(n)],complete=False)
 for flag in ['--max-compatibility-groups','--max-clock-rows','--max-reset-rows']:
  p,_=inspect(flags=[flag,'1'],complete=False,pair=True,textcheck=True)
 p,_=inspect(config(['qa']),pair=True,textcheck=True);need(p['explanation']['complete'] and p['explanation']['counts']['compatible']==1,'known compatible')
 cfg=config(['qa','qp']);before,_=inspect(cfg,pair=True,textcheck=True);need(before['explanation']['counts']['conflict']==1,'explicit original conflict');cfg['planning']=dict(rules=[dict(port='qp',direction='output',action='exclude')]);after,_=inspect(cfg,pair=True,textcheck=True);need(after['explanation']['counts']['compatible']==1 and after['explanation']['counts']['conflict']==0,'constraint changed and reverified');(e/'workflow.json').write_text(json.dumps(dict(before=before['explanation']['counts'],after=after['explanation']['counts']),indent=2))
 cfg=config(['qa']);cfg['planning']=dict(rules=[dict(port='qa',direction='output',action='dedicated')]);inspect(cfg,complete=False,textcheck=True);cfg['planning']['rules'][0]['action']='exclude';p,_=inspect(cfg,textcheck=True);need(p['explanation']['locations']==[],'no declarations for empty chains')
 # Independent coordinates: all generated ports/state declarations are on line one, body events later.
 rng=random.Random(22647)
 for case in range(16):
  edges=[rng.randrange(2) for _ in range(4)];rtl=['module generated(input logic c,r,d,output logic q0,q1,q2,q3);']
  for i,edge in enumerate(edges):rtl.append(f"always_ff @(posedge c or {['posedge','negedge'][edge]} r) if({'!' if edge else ''}r) q{i}<=0;else q{i}<=d;")
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));cfg=config(['q'+str(i) for i in range(4)],'generated');p,_=inspect(cfg,pair=True,rtl=path,textcheck=True)
  expected='conflict' if len(set(edges))>1 else 'compatible';need(p['explanation']['rows'][0]['status']==expected,'declaration polarity oracle')
  for loc in p['explanation']['locations']:need(Path(loc['span']['path']).resolve()==path.resolve() and loc['span']['start']['line']==1,'independent declaration line')
 cfg=config(['qa']);cfg['chaining']['chains'][0]['name']='line\n\u001b[31m';cfg['chaining']['defaultChain']=cfg['chaining']['chains'][0]['name'];p,f=inspect(cfg);text=run(['--config',str(f),'--explain-chains','--format','text'],text=True);need('\u001b' not in text and 'line\n' not in text and '\\n' in text,'escape text control characters')
 f=e/'valid.json';f.write_text(json.dumps(config(['qa'])))
 for field,hi in [('chains',1025),('segments',100001),('locations',100001),('work',10000001),('millis',60001)]:
  for value in ['0',str(hi),'-1','x','1.5']:v.validate(run(['--config',str(f),'--explain-chains','--max-explain-'+field,value],2))
  run(['--config',str(f),'--max-explain-'+field,'1'],2)
 for args in [['--explain-chains'],['--config',str(f),'--format','text'],['--config',str(f),'--explain-chains','--format','yaml'],['--config',str(f),'--explain-chains','--compatibility-group','g','first']]+[['--config',str(f),'--explain-chains',mode] for mode in ['--schedule-activity','--plan-activity','--chain-compatibility','--chain-resets','--chain-clocks','--chain-coverage','--plan-cells']]:v.validate(run(args,2))
 mutations=[]
 for k,val in [('algorithm','bad'),('extra',1)]:m=copy.deepcopy(base);m[k]=val;mutations.append(m)
 m=copy.deepcopy(base);m['explanation']['rows'][0]['status']='pending';mutations.append(m)
 m=copy.deepcopy(base);del m['explanation']['locations'][0]['span'];mutations.append(m)
 m=copy.deepcopy(base);m['explanation']['locations'][0]['error']=dict(code='not_found',message='x');mutations.append(m)
 m=copy.deepcopy(base);m['explanation']['locations'][0]['error']=dict(code='internal',message='x');del m['explanation']['locations'][0]['span'];mutations.append(m)
 m=copy.deepcopy(base);m['explanation']['limits']['maxWork']=0;mutations.append(m)
 m=copy.deepcopy(base);m['explanation']['complete']=True;mutations.append(m)
 for m in mutations:need(not v.is_valid(m),'schema negative')
 print(json.dumps(dict(calls=len(calls),checks=checks,sourcePairs=pairs,referenceCases=16,seed=22647,schemaNegative=len(mutations),output=str(e))))
except Exception:
 print('output:',e);raise
