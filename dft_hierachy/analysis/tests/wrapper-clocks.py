"""Real RTL functional clocks, exact source links and independent generated edge oracle."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-clocks-cli-'))
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);schema=next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:wrapper-chain-clocks:1');validator=Draft202012Validator(schema,registry=registry);Draft202012Validator.check_schema(schema)
calls=[];checks=0;pairs=0;negative=0

def need(ok,msg):
 global checks
 checks+=1
 if not ok:raise AssertionError(msg)
def run(args,exit=0,top='clock_top',source=None):
 argv=[str(binary),'--top',top,str(source or root/'wrapper-clocks.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==exit,f'{argv}: {x.returncode}!={exit} {x.stdout!r}');return json.loads(x.stdout)
def norm(v):
 if isinstance(v,dict):return {k:norm(x) for k,x in v.items() if k not in ['snapshotId','openedAt']}
 if isinstance(v,list):return [norm(x) for x in v]
 return v
def config(ports=('qa','alias_a'),top='clock_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name='scan',capacity=100)],defaultChain='scan'))
def inspect(cfg,flags=(),complete=True,equivalent=False,source=None,top=None):
 global pairs
 f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));x=run(['--config',str(f),'--chain-clocks','--require-complete',*flags],0 if complete else 4,top or cfg['boundary']['scope'],source);validator.validate(x);audit(x)
 if equivalent:
  old=run(['--config',str(f)],top=top or cfg['boundary']['scope'],source=source);need(norm(old)==norm(x['source']),'whole original plan');pairs+=1
 return x,f
def audit(x):
 c=x['clocks'];layout=x['source']['layout'];need(c['registers']==sum(len(p['response']['result']['items']) for p in c['pages']),'raw fact count')
 need([(r['chain'],r['segment']) for r in c['rows']]==[(i,j) for i,ch in enumerate(layout['chains']) for j,_ in enumerate(ch['segments'])][:len(c['rows'])],'ordered segment prefix')
 for r in c['rows']:
  seg=layout['chains'][r['chain']]['segments'][r['segment']]
  for m in r['matches']:
   fact=c['pages'][m['page']]['response']['result']['items'][m['fact']];need(fact['signal']==seg['signal'],'state identity')
   need(m['bits']==dict(lsb=max(fact['bits']['lsb'],seg['bits']['lsb']),width=min(fact['bits']['lsb']+fact['bits']['width'],seg['bits']['lsb']+seg['bits']['width'])-max(fact['bits']['lsb'],seg['bits']['lsb'])),'exact range intersection')
   if 'check' in m:
    ck=c['checks'][m['check']];need(ck['event']==fact['clock'],'event link');need(m.get('group')==ck.get('group'),'group link')
  if r['status']=='dedicated':need(not r['matches'] and not r['groups'],'no invented clock')
 for i,ch in enumerate(c['chains']):
  rows=[r for r in c['rows'] if r['chain']==i];need(ch['processedSegments']==len(rows),'prefix summary');groups=[]
  for r in rows:
   for g in r['groups']:
    if g not in groups:groups.append(g)
  need(ch['groups']==groups,'groups from committed rows only')
  for field,statuses in [('resolvedBits',['resolved','mixed']),('unresolvedBits',['unresolved']),('dedicatedBits',['dedicated'])]:need(ch[field]==sum(layout['chains'][i]['segments'][r['segment']]['length'] for r in rows if r['status'] in statuses),'state counters')
 if not layout['complete']:need(not c['complete'] and 'source_partial' in c['reasons'],'quality propagated')
try:
 good,f=inspect(config(),equivalent=True);need(good['clocks']['chains'][0]['resolvedBits']==2 and len(good['clocks']['checks'])==1,'alias/state/clock dedup')
 manual=['--scope','clock_top','--port','qa','--port','alias_a','--plan-chains','--chain','scan','100','--chain-default','scan','--chain-clocks'];m=run(manual);validator.validate(m);need(norm(m)==norm(good),'manual/config equivalence');pairs+=1
 for ports,groups in [(['qb','qc'],1),(['qa','qb'],2),(['qa','qd'],2),(['qa','qb','qd'],3)]:
  x,_=inspect(config(ports),equivalent=True);need(len(x['clocks']['groups'])==groups,'hand source/edge groups');need(x['clocks']['chains'][0]['status']==('single_clock' if groups==1 else 'mixed_clock'),'mixed classification')
 x,_=inspect(config(['q'],'clock_hierarchy'),equivalent=True);need(x['clocks']['groups'][0]['edge']=='posedge','cross hierarchy inversion')
 x,_=inspect(config(['d'],'clock_split'),equivalent=True);need(x['clocks']['rows'][0]['status']=='mixed' and len(x['clocks']['rows'][0]['matches'])==4,'vector split events')
 x,_=inspect(config(['q'],'clock_overlap'),complete=False,equivalent=True);need(x['source']['layout']['complete'] and x['clocks']['rows'][0]['reason']=='register_overlap' and not x['clocks']['checks'],'reject overlapping writers')
 x,_=inspect(config(['q'],'clock_hierarchy'),['--max-clock-depth','1'],complete=False);need(x['clocks']['checks'][0]['proof']['reasons']==['budget_logic_depth'],'preserve depth evidence')
 for ports in [['qg'],['qs'],['qu'],['qa','qg'],['qa','qb','qg']]:
  x,_=inspect(config(ports),complete=False,equivalent=True);need(x['clocks']['chains'][0]['status']==('mixed_clock' if 'qb' in ports else 'unresolved'),'unknown does not mask known mixed')
 for n in range(1,good['clocks']['work']+1):
  x,_=inspect(config(),['--max-clock-work',str(n)],complete=n==good['clocks']['work']);need(x['clocks']['work']<=n,'work ceiling')
 for n in [1,2]:
  x,_=inspect(config(),['--max-clock-rows',str(n)],complete=n==2);need(len(x['clocks']['rows'])==n,'row cap')
 for n in [1,7,8,9]:
  x,_=inspect(config(),['--max-clock-registers',str(n),'--clock-page-size','1'],complete=n>=8);need(len(x['clocks']['pages'])==min(n,8),'all pages within cap')
  if n<8:need(not x['clocks']['rows'] and x['clocks']['stop']['reason']=='budget_registers','no unique conclusion from fact prefix')
 cfg=config();cfg['chaining']['limits']=dict(maxRows=1);inspect(cfg,complete=False,equivalent=True)
 cfg=config(['qa']);cfg['planning']=dict(rules=[dict(port='qa',direction='output',action='dedicated')]);x,_=inspect(cfg,equivalent=True);need(x['clocks']['chains'][0]['status']=='dedicated_only' and not x['clocks']['pages'],'dedicated not resolved RTL')
 cfg['planning']['rules'][0]['action']='exclude';x,_=inspect(cfg);need(x['clocks']['chains'][0]['status']=='empty','empty chain')
 # Independent source/edge oracle: random declarations mapped directly, no producer evidence consulted.
 rng=random.Random(225);reference_cases=20
 for case in range(reference_cases):
  specs=[(rng.randrange(2),rng.randrange(2),rng.randrange(2)) for _ in range(6)]
  rtl=['module generated(input logic a,b,d, output logic [5:0] q, output wire [5:0] alias_q);','assign alias_q=q;']
  for i,(source,invert,edge) in enumerate(specs):
   rtl.extend([f"wire n{i}={'~' if invert else ''}{['a','b'][source]};",f"always_ff @({['posedge','negedge'][edge]} n{i}) q[{i}]<=d;"])
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));cfg=config(['q','alias_q'],'generated');x,_=inspect(cfg,source=path,equivalent=True)
  c=x['clocks'];expected=[(src,edge^inv) for src,inv,edge in specs];need(len(c['rows'])==6 and c['chains'][0]['resolvedBits']==6,'random alias dedup')
  wanted={};ids=[]
  for key in expected:
   wanted.setdefault(key,len(wanted));ids.append(wanted[key])
  need([r['groups'][0] for r in c['rows']]==ids,'independent clock equivalence classes')
  need([g['edge'] for g in c['groups']]==[['posedge','negedge'][k[1]] for k in wanted],'independent effective edges')
  need(c['chains'][0]['status']==('single_clock' if len(wanted)==1 else 'mixed_clock'),'random chain decision')
 for flags in [['--chain-clocks'],['--plan-cells','--chain-clocks'],['--config',str(f),'--chain-clocks','--chain-coverage'],['--config',str(f),'--chain-clocks','--scope','clock_top'],['--config',str(f),'--chain-clocks','--chain-clocks']]:run(flags,2)
 for name,high in [('rows',100001),('registers',100001),('work',10000001),('depth',257),('millis',60001),('page-size',1001)]:
  flag='--clock-page-size' if name=='page-size' else '--max-clock-'+name
  for value in ['0',str(high),'-1','x','1.5']:
   bad=run(['--config',str(f),'--chain-clocks',flag,value],2);validator.validate(bad)
  run(['--config',str(f),flag,'1'],2)
 mutations=[]
 for field,value in [('algorithm','wrong'),('unexpected',1)]:z=copy.deepcopy(good);z[field]=value;mutations.append(z)
 z=copy.deepcopy(good);z['clocks']['checks'][0].pop('group');mutations.append(z)
 z=copy.deepcopy(good);z['clocks']['rows'][0]['groups']=[];mutations.append(z)
 z=copy.deepcopy(good);z['clocks']['rows'][0]['reason']='clock_unresolved';mutations.append(z)
 z=copy.deepcopy(good);z['clocks']['chains'][0]['groups'].append(1);mutations.append(z)
 z=copy.deepcopy(good);z['clocks']['stop']=dict(reason='budget_work',chain=0,segment=0);mutations.append(z)
 z=copy.deepcopy(good);z['source']['layout']['complete']=False;mutations.append(z)
 for z in mutations:need(not validator.is_valid(z),'strict schema negative');negative+=1
 print(json.dumps(dict(calls=len(calls),checks=checks,equivalencePairs=pairs,referenceCases=reference_cases,seed=225,schemaNegative=negative,output=str(e))))
except Exception:
 print('output:',e);raise
