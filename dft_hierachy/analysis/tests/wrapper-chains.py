"""Real CLI and bounded independent bit-placement oracle; retain inputs and command streams."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent
core=json.loads(Path(sys.argv[2]).read_text());schemas=[json.loads((root.parent/'wrapper'/n).read_text()) for n in ['boundary-report.schema.json','cell-plan-report.schema.json','chain-plan-report.schema.json']]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in [core,*schemas]])
v=Draft202012Validator(schemas[-1],registry=registry);old=Draft202012Validator(schemas[1],registry=registry);Draft202012Validator.check_schema(schemas[-1])
e=Path(tempfile.mkdtemp(prefix='wrapper-chains-cli-'));calls=[];checks=0
def need(ok,msg):
 global checks
 checks+=1
 if not ok:raise AssertionError(msg)
def run(top='chain_top',args=(),file=None,exit=0,declare=True,mode=True):
 argv=[str(binary),'--top',top,'--scope',top,str(file or root/'wrapper-chains.sv'),*(['--plan-chains'] if mode else []),*(['--chain','scan','100','--chain-default','scan'] if declare else []),*args];start=time.time();x=subprocess.run(argv,capture_output=True)
 i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2))
 need(x.returncode==exit,f'exit {x.returncode}!={exit}: {argv}: {x.stdout!r}');r=json.loads(x.stdout);v.validate(r);return r
def bits(r):return {i for i in range(r['lsb'],r['lsb']+r['width'])}
def audit(r):
 p=r['layout'];total=shared=dedicated=reused=0;seen=set();used=set();counts=dict.fromkeys(p['counts'],0)
 for c in p['chains']:
  end=0
  for s in c['segments']:
   need(s['offset']==end and s['sourceRow']<len(p['rows']),'contiguous committed segments');end+=s['length']
   if s['kind']=='shared':
    need(s['bits']['width']==s['length'],'segment range length');identities={(s['signal'],b) for b in bits(s['bits'])};need(not(seen&identities),'global unique ownership');seen|=identities;shared+=s['length']
   else:need(s['length']==1 and 'signal' not in s,'dedicated identity');dedicated+=1
  need(end==c['length'] and end<=c['capacity'],'capacity');total+=end
 for i,row in enumerate(p['rows']):
  need(row['sourceRow']==i,'source prefix');counts['rows']+=1;counts[row['status']]+=1
  if 'assignment' in row:used.add(row['assignment'])
  if row['status']!='placed':need(not row['uses'] and row['newBits']==row['reusedBits']==0,'blocked/excluded no partial uses');continue
  c=p['chains'][row['chain']];identities=set();n=new=0
  for u in row['uses']:
   s=c['segments'][u['segment']];need(u['width']>0 and u['offset']+u['width']<=s['length'],'use bounds');n+=u['width'];new+=u['width'] if s['sourceRow']==i else 0
   need(s['sourceRow']<=i,'no future segment')
   if s['kind']=='shared':
    local={(s['signal'],b) for b in range(s['bits']['lsb']+u['offset'],s['bits']['lsb']+u['offset']+u['width'])};need(not(identities&local),'row identity unique');identities|=local
  cell=r['source']['plan']['rows'][i]
  if cell['decision']=='shared_candidate':need(identities=={(c['signal'],b) for c in cell['candidates'] for rng in c['ranges'] for b in bits(rng)},'source candidate coverage')
  else:need(n==1 and not identities,'dedicated length one')
  need(row['newBits']==new and row['reusedBits']==n-new,'row counts');reused+=row['reusedBits']
 counts.update(totalBits=total,sharedBits=shared,dedicatedBits=dedicated,reusedBits=reused);need(counts==p['counts'],'global counts');need(p['unusedAssignments']==[i for i in range(len(p['assignments'])) if i not in used],'used rules atomic')
try:
 selected=['--port','q','--port','alias_q'];good=run(args=selected+['--require-complete']);audit(good);need(good['layout']['counts']['totalBits']==4 and good['layout']['counts']['reusedBits']==4,'alias count');need(not old.is_valid(good),'old schema rejects new envelope')
 conflict=run(args=selected+['--chain','other','100','--chain-port','alias_q','output','other','--require-complete'],exit=4);audit(conflict);need(conflict['layout']['counts']['blocked']==4 and conflict['layout']['chains'][1]['length']==0,'cross-chain conflicts')
 cap=run(args=selected+['--chain','scan','2','--chain-default','scan'],declare=False);audit(cap);need(cap['layout']['counts']['totalBits']==2 and cap['layout']['counts']['placed']==4,'later reuse despite full capacity')
 fr=run('chain_fragments',args=['--port','a','--port','b','--port','d','--require-complete']);audit(fr);need(fr['layout']['rows'][2]['newBits']==2 and fr['layout']['rows'][2]['reusedBits']==2 and len(fr['layout']['rows'][2]['uses'])==4,'split interval placement')
 for limit in [1,2,3,4]:
  x=run('chain_fragments',args=['--port','a','--port','b','--port','d','--max-chain-segments',str(limit),'--require-complete'],exit=0 if limit==4 else 4);audit(x);need(len(x['layout']['rows'])==[1,2,2,3][limit-1],'segment cap row prefix')
 for work in [1,2,3,5,good['layout']['work']-1,good['layout']['work']]:
  x=run(args=selected+['--max-chain-work',str(work),'--require-complete'],exit=0 if work==good['layout']['work'] else 4);audit(x);need(x['layout']['rows']==good['layout']['rows'][:len(x['layout']['rows'])],'exact row prefix');need(x['layout']['work']==work,'work')
 x=run(args=selected+['--max-chain-rows','2','--chain-port','alias_q','output','scan','--require-complete'],exit=4);audit(x);need(x['layout']['unusedAssignments']==[0],'no pending rule use')
 for args in [['--max-plan-rows','2'],['--max-bits','2']]:
  x=run(args=selected+args+['--require-complete'],exit=4);audit(x);need('source_partial' in x['layout']['reasons'],'source truncation preserved')
 x=run(args=['--port','constant_o','--require-complete']);audit(x);need(x['layout']['counts']['dedicatedBits']==1,'constant dedicated')
 x=run(args=['--port','c','--cell-rule','c','input','exclude','--chain-port','c','input','scan','--require-complete']);audit(x);need(x['layout']['complete'] and x['layout']['counts']['excluded']==1 and not x['layout']['unusedAssignments'],'excluded consumes matching assignment')
 for action in [None,'dedicated','exclude']:
  x=run('chain_unknown',args=([] if action is None else ['--cell-rule','q','output',action])+['--require-complete'],exit=4);audit(x);need('source_partial' in x['layout']['reasons'],'unknown source remains partial')
 x=run('chain_io',args=['--chain','out','2','--chain-port','p','output','out','--require-complete']);audit(x);need([c['length'] for c in x['layout']['chains']]==[2,2],'inout direction cells')
 x=run(args=selected+['--chain','scan','100'],declare=False);need(all(row['reason']=='unassigned' for row in x['layout']['rows']),'no automatic membership')
 x=run(args=selected+['--chain-port','missing','both','scan','--require-complete'],exit=4);need(x['layout']['unusedAssignments']==[0],'unknown port unconsumed')
 for flag in ['--max-chain-rows','--max-chain-segments','--max-chain-work','--max-chain-millis']:
  for value in ['0','-1','1.5','18446744073709551616']:run(args=[flag,value],exit=2)
  run(args=[flag,'1'],mode=False,declare=False,exit=2)
 for args in [
  ['--plan-cells'],['--plan-chains'],['--chain','scan','4'],['--chain','x','0'],['--chain','x','9007199254740992'],['--chain','x','-1'],
  ['--chain-port','q','bad','scan'],['--chain-port','q','both','absent'],['--chain-bits','q','3','2','both','scan'],['--chain-bits','q','0','0','both','scan'],
  ['--chain-port','q','both','scan','--chain-bits','q','1','1','input','scan'],['--chain','\udcff','1'],['--chain-port','','both','scan'],
  ['--max-chain-segments','100001'],['--max-chain-work','10000001'],['--max-chain-millis','60001'],['--max-chain-rows','1','--max-chain-rows','2'],['--chain-port','q','both']
 ]:run(args=args,exit=2)
 run(args=[],declare=False,exit=2);run(args=['--chain','scan','1','--chain-default','missing'],declare=False,exit=2);run(args=['--chain','scan','1','--chain-default',''],declare=False,exit=2)
 run(args=['--chain','x','1'],declare=False,mode=False,exit=2);run(args=['--chain','x','0'],file=e/'missing.sv',exit=2);run(args=['--port','missing'],exit=3)
 # Independent state-bit dictionary placement: random output aliases and explicit per-bit chains.
 rng=random.Random(225)
 for case in range(24):
  width=rng.randrange(2,10);aliases=[rng.randrange(width) for _ in range(rng.randrange(2,16))];targets=[rng.randrange(2) for _ in aliases];capacities=[rng.randrange(1,width+2) for _ in range(2)];f=e/f'alias-chains-{case}.sv'
  f.write_text(f'module top(input logic c,output wire [{len(aliases)-1}:0] y,input logic d,output wire pass);logic [{width-1}:0] q;always_ff @(posedge c)q<={{{width}{{d}}}};assign y={{'+','.join(f'q[{b}]' for b in reversed(aliases))+'};assign pass=d;endmodule\n')
  args=['--port','y','--port','pass','--chain','A',str(capacities[0]),'--chain','B',str(capacities[1]),'--chain-default','A']
  for i,t in enumerate(targets):args+=['--chain-bits','y',str(i),'1','output','AB'[t]]
  x=run('top',args=args,file=f,declare=False);audit(x);owner={};length=[0,0];segments=[[],[]];expected=[]
  for i,(b,t) in enumerate(zip(aliases,targets)):
   if b in owner and owner[b][0]!=t:expected.append(('blocked','chain_conflict',0,0,[]));continue
   if b in owner:expected.append(('placed','allocated',0,1,[{'segment':owner[b][1],'offset':0,'width':1}]));continue
   if length[t]==capacities[t]:expected.append(('blocked','capacity',0,0,[]));continue
   owner[b]=(t,len(segments[t]));segments[t].append(b);length[t]+=1;expected.append(('placed','allocated',1,0,[{'segment':len(segments[t])-1,'offset':0,'width':1}]))
  if length[0]==capacities[0]:expected.append(('blocked','capacity',0,0,[]))
  else:expected.append(('placed','allocated',1,0,[{'segment':len(segments[0]),'offset':0,'width':1}]));length[0]+=1
  for row,ex in zip(x['layout']['rows'],expected):need((row['status'],row['reason'],row['newBits'],row['reusedBits'],row['uses'])==ex,'reference placement')
  need([c['length'] for c in x['layout']['chains']]==length,'reference length');need(x['layout']['complete']==all(ex[0]=='placed' for ex in expected),'reference complete')
 for mutation in range(12):
  bad=copy.deepcopy(good);p=bad['layout']
  if mutation==0:bad['algorithm']='rtl-wrapper-cell-plan-v1'
  elif mutation==1:p['extra']=0
  elif mutation==2:p['chains'][0]['capacity']=0
  elif mutation==3:p['chains'][0]['segments'][0]['kind']='physical_cell'
  elif mutation==4:del p['chains'][0]['segments'][0]['signal']
  elif mutation==5:p['rows'][0]['uses'][0]['width']=0
  elif mutation==6:p['rows'][0]['uses'][0]['extra']=1
  elif mutation==7:p['rows'][0]['status']='blocked'
  elif mutation==8:p['rows'][0]['reason']='capacity'
  elif mutation==9:p['stop']={'reason':'budget_work','sourceRow':1}
  elif mutation==10:p['unusedAssignments']=[0]
  else:p['counts']['totalBits']=-1
  need(not v.is_valid(bad),'strict schema mutation')
 print(json.dumps(dict(passed=True,calls=len(calls),checks=checks,seed=225,referenceCases=24,output=str(e))))
except Exception:
 print(json.dumps(dict(passed=False,calls=len(calls),checks=checks,output=str(e))));raise
