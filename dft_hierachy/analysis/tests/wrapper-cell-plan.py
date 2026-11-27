"""Actual RTL/CLI and strict Schema checks; small bit-set reference for sharing counts."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent
core=json.loads(Path(sys.argv[2]).read_text());boundary=json.loads((root.parent/'wrapper/boundary-report.schema.json').read_text());schema=json.loads((root.parent/'wrapper/cell-plan-report.schema.json').read_text())
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in [core,boundary]])
validator=Draft202012Validator(schema,registry=registry);old=Draft202012Validator(boundary,registry=registry);Draft202012Validator.check_schema(schema)
e=Path(tempfile.mkdtemp(prefix='wrapper-plan-cli-'));calls=[];checks=0
def need(v,message):
 global checks
 checks+=1
 if not v:raise AssertionError(message)
def run(top='plan_top',args=(),file=None,exit=0,planning=True):
 argv=[str(binary),'--top',top,'--scope',top,str(file or root/'wrapper-cell-plan.sv'),*(['--plan-cells'] if planning else []),*args];start=time.time();x=subprocess.run(argv,capture_output=True)
 i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append({'argv':argv,'cwd':os.getcwd(),'exit':x.returncode,'seconds':time.time()-start});(e/'commands.json').write_text(json.dumps(calls,indent=2))
 need(x.returncode==exit,f'exit {x.returncode}!={exit}: {argv}: {x.stdout!r}');r=json.loads(x.stdout);(validator if planning or exit else old).validate(r);return r
def bitset(ranges):return {b for r in ranges for b in range(r['lsb'],r['lsb']+r['width'])}
def audit(r):
 p=r['plan'];counts=dict.fromkeys(p['counts'],0);signals={};used=set()
 for i,row in enumerate(p['rows']):
  need(row['sourceRow']==i,'committed prefix');src=r['source']['rows'][i];counts['outputRows' if src['upstream'] else 'inputRows']+=1
  if 'rule' in row:used.add(row['rule'])
  decision=row['decision'];counts[{'shared_candidate':'sharedCandidate'}.get(decision,decision)]+=1
  n=0
  for c in row['candidates']:
   witness=set()
   for ti in c['terminals']:
    t=src['terminals'][ti];h=src['steps'][t['step']]['response']['result']['hops'][t['hop']];s=h['from'] if t['kind']=='register_output' else h['next'][t['continuation']]['slice']
    need(s['ref']==c['signal'],'witness signal');witness.update(bitset([s['bits']]))
   need(witness==bitset(c['ranges']) and c['bits']==len(witness),'candidate union');n+=c['bits']
   if decision=='shared_candidate':signals.setdefault(c['signal'],set()).update(witness)
  need(n==row['candidateBits'],'row bits')
  if decision=='shared_candidate':counts['sharedCandidateBits']+=n
  if decision=='dedicated':counts['addedCells']+=1
 counts['uniqueSharedBits']=sum(map(len,signals.values()));need(counts==p['counts'],'counts from committed rows')
 need({s['signal']:bitset(s['ranges']) for s in p['sharedSignals']}==signals,'global union')
 need(p['unusedRules']==[i for i in range(len(p['rules'])) if i not in used],'used committed rules')
try:
 full=run(args=['--require-complete'],exit=4);audit(full);need(full['plan']['counts']==dict(inputRows=6,outputRows=11,excluded=0,dedicated=4,sharedCandidate=11,blocked=2,sharedCandidateBits=11,uniqueSharedBits=4,addedCells=4),'full hand count')
 selected=['--port','q','--port','alias_q'];good=run(args=selected+['--require-complete']);audit(good);need(good['plan']['counts']['uniqueSharedBits']==4,'aliased outputs')
 need(not old.is_valid(good),'old schema rejects new algorithm')
 for args,decision in [([], 'dedicated'),(['--max-input-candidates','6'],'shared_candidate'),(['--cell-rule','d','input','share'],'blocked')]:
  r=run('plan_fanout',args=['--port','d',*args]);need(r['plan']['rows'][0]['decision']==decision and r['plan']['rows'][0]['candidateBits']==6,'fanout policy');audit(r)
 for top,port,reason in [('plan_control','sel','non_data_path'),('plan_top','c','control_usage'),('plan_top','unknown_o','evidence_partial')]:
  r=run(top,args=['--port',port]);need(r['plan']['rows'][0]['reason']==reason,'blocked reason');audit(r)
 r=run('plan_overlap',args=['--port','d','--require-complete']);need(r['plan']['counts']['uniqueSharedBits']==4 and r['plan']['rows'][0]['candidates'][0]['ranges']==[{'lsb':0,'width':4}],'overlapping facts union');audit(r)
 r=run('plan_multi',args=['--port','d','--require-complete']);need(len(r['plan']['sharedSignals'])==2 and r['plan']['counts']['uniqueSharedBits']==2,'occurrence separation');audit(r)
 r=run('plan_io',args=['--cell-rule','p','input','exclude','--cell-bit-rule','p','0','1','output','dedicated']);need(r['plan']['counts']['excluded']==2 and r['plan']['counts']['addedCells']==2,'direction and bit rules');audit(r)
 for action in ['exclude','dedicated']:
  r=run(args=['--port','unknown_o','--cell-rule','unknown_o','both',action,'--require-complete'],exit=4);need(not r['source']['complete'] and not r['plan']['complete'],'rules preserve partial');audit(r)
 for cap in [1,2,3,7,good['plan']['work']-1,good['plan']['work']]:
  r=run(args=selected+['--max-plan-work',str(cap),'--require-complete'],exit=0 if cap==good['plan']['work'] else 4);audit(r);need(r['plan']['rows']==good['plan']['rows'][:len(r['plan']['rows'])],'atomic full row equality')
 for cap in [1,3,8]:
  r=run(args=selected+['--max-plan-rows',str(cap),'--require-complete'],exit=0 if cap==8 else 4);need(len(r['plan']['rows'])==cap,'row cap');audit(r)
 r=run(args=selected+['--max-bits','1','--cell-bit-rule','alias_q','3','1','output','exclude','--require-complete'],exit=4);need(r['plan']['unusedRules']==[0] and 'source_partial' in r['plan']['reasons'],'source partial and unused');audit(r)
 for flag in ['--max-input-candidates','--max-output-candidates','--max-plan-rows','--max-plan-work','--max-plan-millis']:
  for value in ['0','-1','1.2','18446744073709551616']:run(args=[flag,value],exit=2)
  run(args=[flag,'1'],planning=False,exit=2)
 for args in [
  ['--plan-cells'],['--max-plan-work','1','--max-plan-work','2'],['--max-plan-rows','100001'],['--max-plan-millis','60001'],
  ['--cell-rule','x','side','share'],['--cell-rule','x','both','safe'],['--cell-rule','','both','exclude'],['--cell-rule','\udcff','both','exclude'],
  ['--cell-bit-rule','q','0','0','both','share'],['--cell-bit-rule','q','3','2','both','share'],['--cell-bit-rule','q','9007199254740991','1','both','share'],
  ['--cell-rule','x','both','exclude','--cell-bit-rule','x','3','1','input','dedicated'],['--cell-rule','x','both'],
 ]:run(args=args,exit=2)
 run(args=['--cell-rule','q','both','exclude'],planning=False,exit=2)
 run(args=['--cell-rule','x','bad','exclude'],file=e/'missing.sv',exit=2)
 run(args=['--port','missing'],exit=3)
 r=run(args=selected+['--cell-rule','q','input','share','--require-complete'],exit=4);need(r['plan']['unusedRules']==[0],'opposite direction unused')
 # Random repeated-state aliases: input d drives an independently chosen set of state bits;
 # output y aliases those bits in a random order (with repetitions). Python sets give the oracle.
 rng=random.Random(224)
 for case in range(24):
  width=rng.randrange(2,13);chosen={i for i in range(width) if rng.randrange(2)} or {0};aliases=[rng.randrange(width) for _ in range(rng.randrange(1,13))];f=e/f'aliases-{case}.sv'
  data=','.join('d' if i in chosen else "1'b0" for i in reversed(range(width)))
  wires=','.join(f'q[{i}]' for i in reversed(aliases))
  f.write_text(f'module top(input logic c,d,output wire [{len(aliases)-1}:0] y);logic [{width-1}:0] q;always_ff @(posedge c)q<={{{data}}};assign y={{{wires}}};endmodule\n')
  r=run('top',args=['--port','d','--port','y','--max-input-candidates','20','--require-complete'],file=f);audit(r)
  need(r['plan']['rows'][0]['candidateBits']==len(chosen),'random input fanout')
  need(r['plan']['counts']['sharedCandidateBits']==len(chosen)+len(aliases) and r['plan']['counts']['uniqueSharedBits']==len(chosen|set(aliases)),'random alias cardinality')
  need(bitset(r['plan']['rows'][0]['candidates'][0]['ranges'])==chosen,'random input bit identities')
  for i,b in enumerate(aliases):need(bitset(r['plan']['rows'][i+1]['candidates'][0]['ranges'])=={b},'random alias bit identity')
 for mutation in range(12):
  bad=copy.deepcopy(good);p=bad['plan']
  if mutation==0:bad['algorithm']='rtl-wrapper-boundary-v1'
  elif mutation==1:bad['extra']=1
  elif mutation==2:p['rows'][0]['extra']=1
  elif mutation==3:p['rows'][0]['decision']='safe'
  elif mutation==4:p['counts']['uniqueSharedBits']=-1
  elif mutation==5:p['rows'][0]['candidates'][0]['ranges'][0]['width']=0
  elif mutation==6:p['policy']['maxInputCandidates']=0
  elif mutation==7:p['rows'][0]['candidateBits']=0
  elif mutation==8:p['rows'][0]['candidates'][0]['terminals'][0]='0'
  elif mutation==9:p['stop']={'reason':'budget_work','sourceRow':1}
  elif mutation==10:p['unusedRules']=[0]
  else:p['rows'][0]['reason']='declared_exclude'
  need(not validator.is_valid(bad),'strict schema negative')
 print(json.dumps({'passed':True,'calls':len(calls),'checks':checks,'seed':224,'referenceCases':24,'output':str(e)}))
except Exception:
 print(json.dumps({'passed':False,'calls':len(calls),'checks':checks,'output':str(e)}));raise
