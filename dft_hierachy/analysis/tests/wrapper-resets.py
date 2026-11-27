"""Owned async-event evidence, inactive PI constraints, budgets and generated RTL oracle."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-resets-cli-'))
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);schema=next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:wrapper-chain-resets:1');validator=Draft202012Validator(schema,registry=registry);Draft202012Validator.check_schema(schema)
calls=[];checks=0;pairs=0;negative=0

def need(ok,msg):
 global checks
 checks+=1
 if not ok:raise AssertionError(msg)
def run(args,exit=0,top='reset_top',source=None):
 argv=[str(binary),'--top',top,str(source or root/'wrapper-resets.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==exit,f'{argv}: {x.returncode}!={exit} {x.stdout!r}');return json.loads(x.stdout)
def norm(v):
 if isinstance(v,dict):return {k:norm(x) for k,x in v.items() if k not in ['snapshotId','openedAt']}
 if isinstance(v,list):return [norm(x) for x in v]
 return v
def config(ports=('qn','alias_n'),top='reset_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name='scan',capacity=100)],defaultChain='scan'))
def inspect(cfg,flags=(),complete=True,equivalent=False,source=None):
 global pairs
 f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));x=run(['--config',str(f),'--chain-resets','--require-complete',*flags],0 if complete else 4,cfg['boundary']['scope'],source);validator.validate(x);audit(x)
 if equivalent:
  oldflags=[]
  for i,flag in enumerate(flags):
   if flag.startswith('--max-clock-') or flag=='--clock-page-size':oldflags.extend(flags[i:i+2])
  old=run(['--config',str(f),'--chain-clocks',*oldflags],top=cfg['boundary']['scope'],source=source);need(norm(old)==norm(x['source']),'whole original clock report');pairs+=1
 return x,f
def audit(x):
 r=x['resets'];c=x['source']['clocks'];layout=x['source']['source']['layout'];need(r['events']>=sum(len(row['events']) for row in r['rows']),'observed events include only visited references');need(r['events']<=r['limits']['maxEvents'] and r['work']<=r['limits']['maxWork'],'budget ceiling')
 need([(v['chain'],v['segment']) for v in r['rows']]==[(i,j) for i,ch in enumerate(layout['chains']) for j,_ in enumerate(ch['segments'])][:len(r['rows'])],'ordered allocated segment prefix')
 def merge(values):
  result={}
  for v in values:
   h=result.setdefault(v['input'],dict(input=v['input'],low=False,high=False));h['low']|=v['low'];h['high']|=v['high']
  return list(result.values())
 for row in r['rows']:
  derived=[]
  if row['status']=='pending':need('sourceRow' not in row and not row['events'] and not row['holds'],'no inferred controls when upstream not reached');continue
  src=c['rows'][row['sourceRow']];need((src['chain'],src['segment'])==(row['chain'],row['segment']),'original clock row')
  for ev in row['events']:
   m=src['matches'][ev['match']];fact=c['pages'][m['page']]['response']['result']['items'][m['fact']];ck=r['checks'][ev['check']];need(ck['event']==fact['async'][ev['event']],'original async event including type and range')
   if ck['status']=='resolved':
    p=ck['proof']['result'];need(r['inputs'][ck['input']]==dict(point=p['origin'],sourceRef=p['sourceRef']),'input identity');derived.append(dict(input=ck['input'],low=not ck['high'],high=ck['high']))
  need(row['holds']==merge(derived),'holds from committed event references')
 for s in r['chains']:
  rows=[v for v in r['rows'] if v['chain']==s['chain']];need(s['processedSegments']==len(rows),'atomic processed count');need(s['complete']==(all(v['complete'] for v in rows) and len(rows)==len(layout['chains'][s['chain']]['segments'])),'per-chain evidence quality')
  need(s['holds']==merge(h for v in rows for h in v['holds']),'summary uses committed rows only')
  for status in ['clear','hold','conflict','asserted','unresolved','pending','dedicated']:need(s[status+'Bits']==sum(layout['chains'][v['chain']]['segments'][v['segment']]['length'] for v in rows if v['status']==status),'state count '+status)
 if not c['complete']:need(not r['complete'] and 'source_partial' in r['reasons'],'upstream quality retained')
try:
 good,f=inspect(config(),equivalent=True);need(good['resets']['chains'][0]['holdBits']==2 and len(good['resets']['checks'])==1,'alias and event cache')
 m=run(['--scope','reset_top','--port','qn','--port','alias_n','--plan-chains','--chain','scan','100','--chain-default','scan','--chain-resets']);validator.validate(m);need(norm(m)==norm(good),'manual/config equivalence');pairs+=1
 for ports,status in [(['qn','qi','qs'],'hold'),(['qn','qp'],'conflict'),(['qfree'],'clear')]:
  x,_=inspect(config(ports),equivalent=True);need(x['resets']['chains'][0]['status']==status,'reset/set/inversion/no async')
 cfg=config(['qn','qp']);cfg['chaining']['chains'].append(dict(name='separate',capacity=100));cfg['chaining']['assignments']=[dict(port='qp',direction='output',chain='separate')];x,_=inspect(cfg,equivalent=True);need([s['status'] for s in x['resets']['chains']]==['hold','hold'],'independent chains')
 for top,ports,status,complete in [('reset_hierarchy',['q'],'hold',True),('reset_vector',['d'],'conflict',True),('reset_unknown',['d'],'conflict',False),('reset_bus',['q'],'hold',True),('reset_unsupported',['q'],'unresolved',False),('reset_constant',['qi'],'clear',True),('reset_constant',['qa'],'asserted',True),('reset_constant',['qx'],'unresolved',False),('reset_unknown_clock',['q'],'hold',False)]:
  x,_=inspect(config(ports,top),complete=complete,equivalent=True);need(x['resets']['chains'][0]['status']==status,top)
  if top=='reset_hierarchy':need(x['resets']['checks'][0]['high'] is False,'inactive false serialized')
  if top=='reset_bus':need(len(x['resets']['inputs'])==2 and x['resets']['inputs'][0]['sourceRef']==x['resets']['inputs'][1]['sourceRef'],'bus source bit identity')
  if top=='reset_unknown_clock':need(x['resets']['rows'][0]['complete'] and x['resets']['chains'][0]['complete'],'clock uncertainty independent of async evidence')
  if top=='reset_unknown':need(not x['resets']['rows'][0]['complete'],'known conflict preserves unknown')
 for ports in [['qg'],['qn','qg'],['qn','qp','qg']]:
  x,_=inspect(config(ports),complete=False,equivalent=True);need(x['resets']['chains'][0]['status']==('conflict' if 'qp' in ports else 'unresolved'),'unknown keeps known conflict')
 for n in range(1,good['resets']['work']+1):inspect(config(),['--max-reset-work',str(n)],complete=n==good['resets']['work'])
 for field in ['rows','events']:
  for n in [1,2]:inspect(config(),['--max-reset-'+field,str(n)],complete=n==2)
 x,_=inspect(config(['d'],'reset_vector'),['--max-reset-events','3'],complete=False);need(not x['resets']['rows'] and not x['resets']['chains'][0]['holds'] and x['resets']['events']==3,'rollback entire row')
 x,_=inspect(config(['q'],'reset_hierarchy'),['--max-reset-depth','1'],complete=False);need(x['resets']['checks'][0]['proof']['reasons']==['budget_logic_depth'],'depth witness')
 x,_=inspect(config(),['--max-clock-rows','1'],complete=False,equivalent=True);need(x['resets']['rows'][1]['status']=='pending','unvisited source explicit')
 x,_=inspect(config(),['--max-clock-work','1'],complete=False,equivalent=True);need(all(v['status']=='pending' for v in x['resets']['rows']),'no upstream row cannot infer clear')
 cfg=config(['qn']);cfg['chaining']['limits']=dict(maxRows=1);inspect(cfg,complete=False,equivalent=True)
 cfg=config(['qn']);cfg['planning']=dict(rules=[dict(port='qn',direction='output',action='dedicated')]);x,_=inspect(cfg,equivalent=True);need(x['resets']['chains'][0]['status']=='dedicated_only' and not x['resets']['checks'],'no invented cell control')
 cfg['planning']['rules'][0]['action']='exclude';x,_=inspect(cfg);need(x['resets']['chains'][0]['status']=='empty','empty chain')
 # Declaration-level oracle: distinct primary inputs, inversions, polarities and reset/set values.
 rng=random.Random(226);reference_cases=20
 for case in range(reference_cases):
  specs=[(rng.randrange(2),rng.randrange(2),rng.randrange(2),rng.randrange(2)) for _ in range(6)]
  rtl=['module generated(input logic c,a,b,d, output logic [5:0] q, output wire [5:0] alias_q);','assign alias_q=q;']
  for i,(source,invert,edge,value) in enumerate(specs):rtl.extend([f"wire n{i}={'~' if invert else ''}{['a','b'][source]};",f"always_ff @(posedge c or {['posedge','negedge'][edge]} n{i}) if({'!' if edge else ''}n{i}) q[{i}]<=1'b{value};else q[{i}]<=d;"])
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));x,_=inspect(config(['q','alias_q'],'generated'),source=path,equivalent=True);r=x['resets'];need(len(r['rows'])==6 and r['chains'][0]['holdBits']==6,'random alias dedup')
  wanted={};levels={};ids=[]
  for src,inv,edge,value in specs:
   wanted.setdefault(src,len(wanted));ids.append(wanted[src]);levels.setdefault(src,set()).add(bool(edge^inv))
  need([r['checks'][v['events'][0]['check']]['input'] for v in r['rows']]==ids,'independent source classes')
  need([r['checks'][v['events'][0]['check']]['high'] for v in r['rows']]==[bool(edge^inv) for src,inv,edge,value in specs],'independent inactive levels')
  need(r['chains'][0]['status']==('conflict' if any(len(v)==2 for v in levels.values()) else 'hold'),'independent chain decision')
 for flags in [['--chain-resets'],['--plan-cells','--chain-resets'],['--config',str(f),'--chain-resets','--chain-clocks'],['--config',str(f),'--chain-resets','--chain-coverage'],['--config',str(f),'--chain-resets','--scope','reset_top'],['--config',str(f),'--chain-resets','--chain-resets']]:validator.validate(run(flags,2))
 for name,high in [('rows',100001),('events',1000001),('work',10000001),('depth',257),('millis',60001)]:
  flag='--max-reset-'+name
  for value in ['0',str(high),'-1','x','1.5']:validator.validate(run(['--config',str(f),'--chain-resets',flag,value],2))
  run(['--config',str(f),flag,'1'],2)
 mutations=[]
 for field,value in [('algorithm','wrong'),('unexpected',1)]:z=copy.deepcopy(good);z[field]=value;mutations.append(z)
 z=copy.deepcopy(good);z['resets']['checks'][0].pop('high');mutations.append(z)
 z=copy.deepcopy(good);z['resets']['rows'][0]['holds'][0].update(low=False,high=False);mutations.append(z)
 z=copy.deepcopy(good);z['resets']['rows'][0]['reason']='control_unresolved';mutations.append(z)
 z=copy.deepcopy(good);z['resets']['rows'][0]['status']='pending';mutations.append(z)
 z=copy.deepcopy(good);z['resets']['rows'][0].pop('sourceRow');mutations.append(z)
 z=copy.deepcopy(good);z['resets']['chains'][0]['status']='empty';mutations.append(z)
 z=copy.deepcopy(good);z['resets']['stop']=dict(reason='budget_work',chain=0,segment=0);mutations.append(z)
 z=copy.deepcopy(good);z['source']['clocks']['complete']=False;mutations.append(z)
 for z in mutations:need(not validator.is_valid(z),'strict schema negative');negative+=1
 print(json.dumps(dict(calls=len(calls),checks=checks,equivalencePairs=pairs,referenceCases=reference_cases,seed=226,schemaNegative=negative,output=str(e))))
except Exception:
 print('output:',e);raise
