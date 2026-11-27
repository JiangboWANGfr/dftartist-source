"""Real CLI comparison, original report equivalence and independent bit-set costs."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-comparison-cli-'))
core=json.loads(Path(sys.argv[2]).read_text());schemas=[json.loads((root.parent/'wrapper'/n).read_text()) for n in ['boundary-report.schema.json','cell-plan-report.schema.json','chain-plan-report.schema.json','chain-comparison-report.schema.json']]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in [core,*schemas]]);validator=Draft202012Validator(schemas[-1],registry=registry);old=Draft202012Validator(schemas[-2],registry=registry);Draft202012Validator.check_schema(schemas[-1])
calls=[];checks=0;pairs=0;negative=0
def need(ok,why):
 global checks
 checks+=1
 if not ok:raise AssertionError(why)
def run(args,exit=0,source=None):
 argv=[str(binary),'--top','chain_top',str(source or root/'wrapper-chains.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==exit,f'{argv}: exit {x.returncode}!={exit}: {x.stdout!r}');return json.loads(x.stdout)
def config(c):
 p=e/f'config-{len(list(e.glob("config-*.json")))}.json';p.write_text(json.dumps(c));return str(p)
def snapshot(v):
 if isinstance(v,dict):
  if 'snapshotId' in v:return v['snapshotId']
  for value in v.values():
   s=snapshot(value)
   if s:return s
 if isinstance(v,list):
  for value in v:
   s=snapshot(value)
   if s:return s
 return None
def norm(v,sid):
 if isinstance(v,dict):return {k:(x.replace(str(len(sid))+':'+sid,'<snapshot>') if k=='next' and isinstance(x,str) and x.startswith('m3:') and sid else norm(x,sid)) for k,x in v.items() if k not in ['snapshotId','openedAt']}
 if isinstance(v,list):return [norm(x,sid) for x in v]
 return v
def normalized(v):return norm(v,snapshot(v))
def flags(files):return [x for i,f in enumerate(files) for x in ['--compare-chains','cfg'+str(i),f]]
def compare(configs,extra=(),exit=0,singles=False):
 global pairs
 files=[config(c) for c in configs];x=run([*flags(files),*extra,'--require-complete'],exit);validator.validate(x)
 if singles:
  for i,f in enumerate(files):
   original=run(['--config',f]);old.validate(original);need(normalized(original['source']['source'])==normalized(x['source']),'original common boundary')
   need(original['source']['plan']==x['configurations'][i]['plan'] and original['layout']==x['configurations'][i]['layout'],'original full plan/layout');pairs+=1
 return x,files
def audit(x):
 ref=x['reference'];configs=x['configurations'];need(len(x['summaries'])==len(configs),'summary count');expectedNames=[]
 for i in [ref,*[i for i in range(len(configs)) if i!=ref]]:
  for c in configs[i]['layout']['chains']:
   if c['name'] not in expectedNames:expectedNames.append(c['name'])
 need([c['name'] for c in x['chains']]==expectedNames[:len(x['chains'])],'name order prefix')
 for i,s in enumerate(x['summaries']):
  comparable=configs[ref]['layout']['complete'] and configs[i]['layout']['complete'];need(s['configuration']==i and s['comparable']==comparable and ('delta' in s)==comparable,'summary quality')
  if comparable:need(s['delta']=={k:configs[i]['layout']['counts'][k]-v for k,v in configs[ref]['layout']['counts'].items()},'summary arithmetic')
 for row in x['chains']:
  before=next((c for c in configs[ref]['layout']['chains'] if c['name']==row['name']),None);need(len(row['entries'])==len(configs),'matrix atomic row')
  need(('referenceChain' in row)==bool(before),'reference presence')
  if before:need(configs[ref]['layout']['chains'][row['referenceChain']]==before,'reference index')
  for i,en in enumerate(row['entries']):
   after=next((c for c in configs[i]['layout']['chains'] if c['name']==row['name']),None);need(en['configuration']==i and ('chain' in en)==bool(after),'entry association')
   if after:need(configs[i]['layout']['chains'][en['chain']]==after,'entry index')
   need(en['presence']==('both' if after and before else 'removed' if before else 'added' if after else 'absent'),'declaration presence')
   need(en['comparable']==x['summaries'][i]['comparable'] and ('delta' in en)==en['comparable'],'matrix quality')
   if en['comparable']:need(en['delta']=={k:(after[k] if after else 0)-(before[k] if before else 0) for k in ['capacity','length']},'matrix arithmetic')
base=dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope='chain_top',ports=['q','alias_q']),chaining=dict(chains=[dict(name='scan',capacity=100),dict(name='idle',capacity=5)],defaultChain='scan'))
dedicated=copy.deepcopy(base);dedicated['planning']=dict(rules=[dict(port=p,direction='output',action='dedicated') for p in ['q','alias_q']]);dedicated['chaining']['chains']=[dict(name='idle',capacity=7),dict(name='scan',capacity=16),dict(name='extra',capacity=2)]
try:
 good,files=compare([base,dedicated],singles=True);audit(good);need(good['summaries'][1]['delta']['totalBits']==4,'hand cost delta');need(not old.is_valid(good),'old report schema rejects new envelope')
 rev,_=compare([base,dedicated],['--reference','cfg1']);audit(rev);need(rev['summaries'][0]['delta']['totalBits']==-4,'negative delta')
 for work in [1,2,3,4,8,9]:
  x,_=compare([base,dedicated],['--max-comparison-work',str(work)],0 if work==9 else 4);audit(x);need(len(x['chains'])==work//3 and x['work']==work,'atomic work');need(x['summaries']==good['summaries'],'valid summaries despite matrix stop')
 x,_=compare([base,dedicated],['--max-comparison-chains','1'],4);audit(x);need(x['stop']==dict(reason='budget_chains',chain=1),'chain limit')
 partial=copy.deepcopy(dedicated);partial['chaining']['chains'][1]['capacity']=1
 x,_=compare([base,partial,base],exit=4,singles=True);audit(x);need([s['comparable'] for s in x['summaries']]==[True,False,True],'independent pair quality')
 x,_=compare([base,partial],['--reference','cfg1'],4);audit(x);need(all('delta' not in s for s in x['summaries']),'reference partial forbids delta')
 for limit in ['boundary','planning','chaining']:
  configs=[copy.deepcopy(base),copy.deepcopy(dedicated)]
  for c in configs if limit=='boundary' else configs[1:]:c.setdefault(limit,{})['limits']={('maxBits' if limit=='boundary' else 'maxWork'):1}
  x,_=compare(configs,exit=4,singles=True);audit(x)
 # Independent bit-set/count oracle, not derived from the producer's candidates/segments.
 rng=random.Random(227)
 for case in range(24):
  configs=[];costs=[]
  for ci in range(3):
   c=copy.deepcopy(base);rules=[];shared=set();sharedRows=dedicatedRows=excluded=0
   for port in ['q','alias_q']:
    for bit in range(4):
     action=rng.choice(['share','dedicated','exclude']);rules.append(dict(port=port,direction='output',action=action,bits=dict(lsb=bit,width=1)))
     if action=='share':shared.add(bit);sharedRows+=1
     elif action=='dedicated':dedicatedRows+=1
     else:excluded+=1
   c['planning']=dict(rules=rules);name=rng.choice(['scan','alt']);c['chaining']=dict(chains=[dict(name=name,capacity=20+ci),dict(name='idle',capacity=ci+1)],defaultChain=name);configs.append(c)
   costs.append(dict(rows=8,placed=8-excluded,excluded=excluded,blocked=0,dedicatedBits=dedicatedRows,sharedBits=len(shared),reusedBits=sharedRows-len(shared),totalBits=dedicatedRows+len(shared)))
  reference=case%3;x,_=compare(configs,['--reference','cfg'+str(reference)],singles=True);audit(x)
  for i,cost in enumerate(costs):need(x['configurations'][i]['layout']['counts']==cost,'independent bit-set cost');need(x['summaries'][i]['delta']=={k:v-costs[reference][k] for k,v in cost.items()},'independent delta')
 # Names, whole-request identity, mode and option errors all precede opening an absent design.
 common=flags(files)
 for args in [common+['--reference','absent'],common+['--reference','cfg1','--reference','cfg0'],common+['--scope','chain_top'],common+['--config',files[0]],common+['--plan-chains'],common+['--plan-cells'],common+['--cell-rule','q','output','share'],common+['--port','q'],['--reference','cfg0'],['--max-comparison-work','1'],['--compare-chains','cfg0',files[0]],['--compare-chains','x'],['--compare-chains','x',files[0],'--compare-chains','x',files[1]],['--compare-chains','',files[0],'--compare-chains','x',files[1]],['--compare-chains','x'*4097,files[0],'--compare-chains','y',files[1]],common+['--compare-chains','z',str(e/'absent')]]:run(args,2,e/'absent.sv')
 for flag,maximum in [('chains',100000),('work',10000000),('millis',60000)]:
  for value in ['0','-1','1.5',str(maximum+1)]:run(common+['--max-comparison-'+flag,value],2,e/'absent.sv')
 for field,value in [('scope','absent'),('ports',['alias_q','q']),('limits',dict(maxBits=1))]:
  c=copy.deepcopy(base);c['boundary'][field]=value;run(flags([files[0],config(c)]),2,e/'absent.sv')
 c=copy.deepcopy(base);c['mode']='cells';del c['chaining'];run(flags([files[0],config(c)]),2,e/'absent.sv')
 run(flags([files[0]]*9),2,e/'absent.sv')
 x,_=compare([base]*8);audit(x);need(len(x['configurations'])==8,'eight configs')
 # Output schema enforces new strict fields and conditional delta/index existence.
 mutants=[]
 def changed(path,value):
  m=copy.deepcopy(good);p=m
  for k in path[:-1]:p=p[k]
  p[path[-1]]=value;return m
 mutants += [changed(['summaries',0,'comparable'],False),changed(['summaries',0,'delta','totalBits'],9007199254740992),changed(['summaries',0,'delta','rows'],0.5),changed(['chains',0,'entries',0,'comparable'],False),changed(['chains',0,'entries',0,'presence'],'absent'),changed(['chains',0,'entries',0,'delta','extra'],0),changed(['configurations',0,'extra'],0),changed(['reference'],8),changed(['algorithm'],'wrong')]
 missing=copy.deepcopy(good);del missing['summaries'][0]['delta'];mutants.append(missing)
 for m in mutants:need(not validator.is_valid(m),'schema negative');negative+=1
 print(json.dumps(dict(calls=len(calls),checks=checks,equivalencePairs=pairs,seed=227,referenceCases=24,schemaNegative=negative,output=str(e))))
except Exception:
 print('output='+str(e));raise
