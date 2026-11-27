"""Single functional clock policy; independent declaration-based clock/hold group oracle."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-compatibility-cli-'))
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((root.parent/'sequential/logic-report.schema.json').read_text())]+[json.loads(p.read_text()) for p in (root.parent/'wrapper').glob('*.schema.json')]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);schema=next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:wrapper-chain-compatibility:1');validator=Draft202012Validator(schema,registry=registry);Draft202012Validator.check_schema(schema)
calls=[];checks=0;pairs=0;negative=0

def need(ok,msg):
 global checks
 checks+=1
 if not ok:raise AssertionError(msg)
def run(args,exit=0,top='compatibility_top',source=None):
 argv=[str(binary),'--top',top,str(source or root/'wrapper-compatibility.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==exit,f'{argv}: {x.returncode}!={exit} {x.stdout!r}');return json.loads(x.stdout)
def norm(v):
 if isinstance(v,dict):return {k:norm(x) for k,x in v.items() if k not in ['snapshotId','openedAt']}
 if isinstance(v,list):return [norm(x) for x in v]
 return v
def config(ports=('qa','alias_a'),top='compatibility_top'):
 return dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope=top,ports=list(ports)),chaining=dict(chains=[dict(name=n,capacity=100) for n in ['first','second','unused']],defaultChain='first',assignments=[dict(port=p,direction='output',chain='second') for p in ['qb','qp','qc','b'] if p in ports]))
def inspect(cfg,groups=(),flags=(),complete=True,equivalent=False,source=None):
 global pairs
 f=e/f'config-{len(calls)}.json';f.write_text(json.dumps(cfg));gflags=[]
 for name,members in groups:
  for member in members:gflags+=['--compatibility-group',name,member]
 x=run(['--config',str(f),'--chain-compatibility','--require-complete',*gflags,*flags],0 if complete else 4,cfg['boundary']['scope'],source);validator.validate(x);audit(x)
 if equivalent:
  oldflags=[]
  for i,flag in enumerate(flags):
   if flag.startswith('--max-clock-') or flag.startswith('--max-reset-') or flag=='--clock-page-size':oldflags.extend(flags[i:i+2])
  old=run(['--config',str(f),'--chain-resets',*oldflags],top=cfg['boundary']['scope'],source=source);need(norm(old)==norm(x['source']),'whole original reset report');pairs+=1
 return x,f
def audit(x):
 c=x['compatibility'];src=x['source'];clock=src['source']['clocks'];reset=src['resets'];layout=src['source']['source']['layout']
 need(c['work']<=c['limits']['maxWork'] and len(c['rows'])<=c['limits']['maxGroups'],'budget ceiling');need(c['counts']['groups']==len(c['rows']),'atomic group count')
 for status in ['compatible','conflict','unresolved','empty']:need(c['counts'][status]==sum(r['status']==status for r in c['rows']),'atomic status counts')
 for i,r in enumerate(c['rows']):
  need(r['group']==i,'group prefix');members=c['groups'][i]['chains'];need(len(set(members))==len(members),'unique members');need(r['allocatedSharedBits']==sum(s['length'] for ch in members for s in layout['chains'][ch]['segments'] if s['kind']=='shared'),'shared inventory');need(r['allocatedDedicatedBits']==sum(s['length'] for ch in members for s in layout['chains'][ch]['segments'] if s['kind']=='dedicated'),'dedicated inventory')
  groups=[];holds={}
  for ch in members:
   for g in clock['chains'][ch]['groups']:
    if g not in groups:groups.append(g)
   for h in reset['chains'][ch]['holds']:
    v=holds.setdefault(h['input'],dict(input=h['input'],low=False,high=False));v['low']|=h['low'];v['high']|=h['high']
  need(r['clockGroups']==groups and r['holds']==list(holds.values()),'only committed upstream summaries')
  wanted=[]
  for g in groups:
   cg=clock['groups'][g]
   for h in holds:
    inp=reset['inputs'][h]
    if cg['sourceRef']==inp['sourceRef'] and cg['point']['slice']['bits']['lsb']==inp['point']['slice']['bits']['lsb']:wanted.append(dict(clockGroup=g,input=h))
  need(r['heldClocks']==wanted,'source-bit clock/hold join')
  need(r['complete']==(not any(k in r['reasons'] for k in ['clock_unresolved','reset_unresolved','dedicated_controls_undefined'])),'independent completeness')
 if not reset['complete']:need(not c['complete'] and 'source_partial' in c['reasons'],'upstream quality')
try:
 good,f=inspect(config(),equivalent=True);need(good['compatibility']['counts']==dict(groups=3,compatible=1,conflict=0,unresolved=0,empty=2),'default independent empty chains')
 m=run(['--scope','compatibility_top','--port','qa','--port','alias_a','--plan-chains','--chain','first','100','--chain','second','100','--chain','unused','100','--chain-default','first','--chain-compatibility']);validator.validate(m);need(norm(m)==norm(good),'manual config equivalence');pairs+=1
 joint=[('joint',['first','second']),('solo',['first'])]
 base,_=inspect(config(['qa','qb']),joint,equivalent=True);need(base['compatibility']['counts']['compatible']==2,'shared clock holds and repeated chain across groups')
 for ports,groups,reason,complete in [(['qa','qp'],joint,'conflicting_levels',True),(['qa','qc'],joint,'mixed_clocks',True),(['qh'],[],'held_clock',True),(['qa','qp','qg'],joint,'reset_unresolved',False)]:
  x,_=inspect(config(ports),groups,complete=complete,equivalent=True);need(reason in x['compatibility']['rows'][0]['reasons'] and x['compatibility']['rows'][0]['status']=='conflict','known conflict kept')
 x,_=inspect(config(['qa','qp']));need(x['compatibility']['counts']['compatible']==2,'do not assume simultaneous chains')
 for top,ports,groups,reason,complete in [('compatibility_cross',['a','b'],joint,'held_clock',True),('compatibility_bus',['q'],[],None,True),('compatibility_constant',['q'],[],'constant_asserted',True),('compatibility_unknown_clock',['q'],[],'clock_unresolved',False),('compatibility_ambiguous',['q'],[],'reset_unresolved',False)]:
  x,_=inspect(config(ports,top),groups,complete=complete,equivalent=True);need((reason in x['compatibility']['rows'][0]['reasons']) if reason else x['compatibility']['rows'][0]['status']=='compatible',top)
 cfg=config(['qa']);cfg['planning']=dict(rules=[dict(port='qa',direction='output',action='dedicated')]);x,_=inspect(cfg,complete=False,equivalent=True);need(x['source']['resets']['complete'] and x['compatibility']['rows'][0]['reasons']==['dedicated_controls_undefined'],'dedicated controls not known')
 cfg['planning']['rules'][0]['action']='exclude';x,_=inspect(cfg);need(x['compatibility']['counts']['empty']==3,'excluded empty')
 for n in range(1,base['compatibility']['work']+1):inspect(config(['qa','qb']),joint,['--max-compatibility-work',str(n)],complete=n==base['compatibility']['work'])
 for n in [1,2]:inspect(config(['qa','qb']),joint,['--max-compatibility-groups',str(n)],complete=n==2)
 for flag in ['--max-clock-rows','--max-reset-rows','--max-reset-events','--max-reset-work']:
  x,_=inspect(config(['qa','qb']),flags=[flag,'1'],complete=False,equivalent=True);need(x['compatibility']['counts']['unresolved']>=1,'upstream incomplete group')
 # One-clock policy and hold constraints derived directly from six independently declared RTL states.
 rng=random.Random(229);reference_cases=20
 for case in range(reference_cases):
  specs=[(rng.randrange(3),rng.randrange(2),rng.randrange(2),rng.randrange(4),rng.randrange(2),rng.randrange(2)) for _ in range(6)]
  if case%4==0:specs=[(0,0,0,3,0,1)]*6
  rtl=['module generated(input logic c,a,b,r,d, output logic '+','.join('q'+str(i) for i in range(6))+', output wire alias_q);','assign alias_q=q0;'];names=['c','a','b','r']
  for i,(cs,ci,ce,rs,ri,re) in enumerate(specs):rtl+=[f"wire clk{i}={'~' if ci else ''}{names[cs]},rst{i}={'~' if ri else ''}{names[rs]};",f"always_ff @({['posedge','negedge'][ce]} clk{i} or {['posedge','negedge'][re]} rst{i}) if({'!' if re else ''}rst{i}) q{i}<=0;else q{i}<=d;"]
  rtl.append('endmodule');path=e/f'generated-{case}.sv';path.write_text('\n'.join(rtl));cfg=config([*('q'+str(i) for i in range(6)),'alias_q'],'generated');chainnames=['first','second','unused'];cfg['chaining']['assignments']=[dict(port='q'+str(i),direction='output',chain=chainnames[i%3]) for i in range(6)]
  groupdefs=[('all',chainnames),('pair',['unused','first']),('single',['second'])];x,_=inspect(cfg,groupdefs,source=path,equivalent=True)
  for row,(_,members) in zip(x['compatibility']['rows'],groupdefs):
   chosen=[s for i,s in enumerate(specs) if chainnames[i%3] in members];clocks={(cs,ce^ci) for cs,ci,ce,rs,ri,re in chosen};holds={}
   for cs,ci,ce,rs,ri,re in chosen:holds.setdefault(rs,set()).add(re^ri)
   reasons=[]
   if any(len(v)>1 for v in holds.values()):reasons.append('conflicting_levels')
   if any(cs in holds for cs,edge in clocks):reasons.append('held_clock')
   if len(clocks)>1:reasons.append('mixed_clocks')
   need(row['reasons']==reasons and row['status']==('conflict' if reasons else 'compatible'),'independent group policy');need(row['allocatedSharedBits']==len(chosen),'random alias inventory');need(len(row['heldClocks'])==sum(cs in holds for cs,edge in clocks),'independent held clock count')
 for args in [['--chain-compatibility'],['--plan-cells','--chain-compatibility'],['--config',str(f),'--chain-compatibility','--chain-resets'],['--config',str(f),'--chain-compatibility','--chain-clocks'],['--config',str(f),'--chain-compatibility','--chain-coverage'],['--config',str(f),'--compatibility-group','x','first'],['--config',str(f),'--chain-compatibility','--compatibility-group','x','missing'],['--config',str(f),'--chain-compatibility','--compatibility-group','x','first','--compatibility-group','x','first'],['--config',str(f),'--chain-compatibility','--compatibility-group','','first']]:validator.validate(run(args,2))
 for field,high in [('groups',1025),('work',10000001),('millis',60001)]:
  for value in ['0',str(high),'-1','x','1.5']:validator.validate(run(['--config',str(f),'--chain-compatibility','--max-compatibility-'+field,value],2))
  run(['--config',str(f),'--max-compatibility-'+field,'1'],2)
 mutations=[]
 for field,value in [('algorithm','wrong'),('unexpected',1)]:z=copy.deepcopy(good);z[field]=value;mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['policy']='scan_safe';mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['rows'][0]['clockGroups']=[];mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['rows'][0]['holds'][0].update(low=False,high=False);mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['rows'][0]['complete']=False;mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['rows'][0]['status']='conflict';mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['groups'][0]['chains'].append(0);mutations.append(z)
 z=copy.deepcopy(good);z['compatibility']['stop']=dict(reason='budget_work',group=0);mutations.append(z)
 z=copy.deepcopy(good);z['source']['resets']['complete']=False;mutations.append(z)
 for z in mutations:need(not validator.is_valid(z),'strict schema negative');negative+=1
 print(json.dumps(dict(calls=len(calls),checks=checks,equivalencePairs=pairs,referenceCases=reference_cases,seed=229,schemaNegative=negative,output=str(e))))
except Exception:
 print('output:',e);raise
