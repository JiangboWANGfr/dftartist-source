"""Actual CLI / RTL / offline schema checks, with all command streams retained."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();core_path=Path(sys.argv[2]).resolve();root=Path(__file__).resolve().parent
schema=json.loads((root.parent/'wrapper/boundary-report.schema.json').read_text());core=json.loads(core_path.read_text())
validator=Draft202012Validator(schema,registry=Registry().with_resource(core['$id'],Resource.from_contents(core)))
Draft202012Validator.check_schema(schema)
e=Path(tempfile.mkdtemp(prefix='wrapper-boundary-cli-'));calls=[];checks=0
def need(v,message):
 global checks
 checks+=1
 if not v:raise AssertionError(message)
def run(top='boundary_top',scope=None,args=(),file=None,exit=0):
 argv=[str(binary),'--top',top,'--scope',scope or top,str(file or root/'wrapper-boundary.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True)
 i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append({'argv':argv,'cwd':os.getcwd(),'exit':x.returncode,'seconds':time.time()-start});(e/'commands.json').write_text(json.dumps(calls,indent=2))
 need(x.returncode==exit,f'exit {x.returncode} != {exit}: {argv}: {x.stdout!r}');r=json.loads(x.stdout);validator.validate(r);return r
def rows(r):return {(r['ports'][x['port']]['name'],x['bit'],x['upstream']):x for x in r['rows']}
def terminals(row):
 out=[]
 for t in row['terminals']:
  need(t['step']<len(row['steps']),'step link');hop=row['steps'][t['step']]['response']['result']['hops'][t['hop']] if 'hop' in t else None
  nxt=hop['next'][t['continuation']] if 'continuation' in t else None
  out.append((t['kind'],hop['via'] if hop else None,nxt['slice'] if nxt else None))
 return out
try:
 full=run();rr=rows(full);need(not full['complete'],'unknown macro partial')
 need(rr['c',0,False]['summary']=='control','clock control');need(rr['r',0,False]['summary']=='control','reset control')
 need({x[0] for x in terminals(rr['r',0,False])}=={'register_async','register_control'},'reset event plus condition')
 for p,s in [('pass','boundary'),('through','boundary'),('one','constant'),('unused','dangling'),('out_unknown','unknown')]:need(next(v for k,v in rr.items() if k[0]==p)['summary']==s,p)
 for row in full['rows']:terminals(row)
 flat=run('boundary_flat',args=['--require-complete']);need(flat['complete'],'flat complete')
 selected=run(args=['--port','d','--require-complete']);need(selected['complete'] and len(selected['rows'])==4,'selected bits')
 paged=run(args=['--port','d','--page-size','1','--require-complete']);need([terminals(r) for r in paged['rows']]==[terminals(r) for r in selected['rows']],'paging retains terminals')
 run(args=['--require-complete'],exit=4)
 for n in [1,2,3,4]:
  r=run(args=['--port','d','--max-bits',str(n),'--require-complete'],exit=0 if n==4 else 4);need(len(r['rows'])==n,'bit cap')
 for n in [1,2,3,7,selected['work']-1,selected['work']]:
  r=run(args=['--port','d','--max-work',str(n),'--require-complete'],exit=0 if n==selected['work'] else 4);need(r['work']==n,'work cap');need([terminals(z) for z in r['rows']]==[terminals(z) for z in selected['rows'][:len(r['rows'])]],'row atomic prefix')
 for name in ['--max-work','--max-bits','--max-ports','--max-depth','--max-millis','--page-size']:
  for value in ['0','-1','1.5','18446744073709551616']:run(args=[name,value],exit=2)
 for args in [['--port','d','--port','d'],['--port',''],['--bogus','1'],['--max-depth','257'],['--page-size','1001'],['--max-work','1','--max-work','2'],['--port','\udcff']]:run(args=args,exit=2)
 run(scope='missing',exit=3);run(args=['--port','missing'],exit=3)
 shell=run('boundary_shell',scope='boundary_shell.u',args=['--require-complete']);need([x['summary'] for x in shell['rows']]==['boundary','boundary'],'nested isolation')
 nested=run(scope='boundary_top.u',args=['--port','d','--require-complete']);need(all(len(x['terminals'])==1 for x in nested['rows']),'nested no siblings')
 diamond=run('boundary_diamond',args=['--require-complete']);need(diamond['complete'],'diamond merge')
 cycle=run('boundary_cycle',args=['--require-complete'],exit=4);need(all('cycle' in x['reasons'] for x in cycle['rows']),'cycles explicit')
 io=run('boundary_inout');need([(r['bit'],r['upstream']) for r in io['rows']]==[(0,False),(0,True),(1,False),(1,True)],'inout ordering')
 opaque=run('boundary_opaque',scope='boundary_opaque.u',args=['--require-complete'],exit=4);need(opaque['unsupportedPorts']==[0,1] and opaque['rows']==[],'unknown direction ports explicit')
 mixed=run('boundary_mixed',args=['--port','d','--require-complete']);need(mixed['rows'][0]['summary']=='mixed','mixed boundary and data')
 # Hand-built permutation RTL: independent expected state-bit mapping, no production graph algorithm.
 rng=random.Random(223)
 for case in range(24):
  width=rng.randrange(1,13);perm=list(range(width));rng.shuffle(perm);f=e/f'permutation-{case}.sv'
  f.write_text(f'module leaf(input logic c,input logic [{width-1}:0] d,output logic [{width-1}:0] q);always_ff @(posedge c)q<=d;endmodule\nmodule top(input logic c,input logic [{width-1}:0] d,output wire [{width-1}:0] q);leaf u(c,{{'+','.join(f'd[{i}]' for i in perm)+'},q);endmodule\n')
  r=run('top',args=['--port','d','--require-complete'],file=f);need(len(r['rows'])==width,'random width')
  for bit,row in enumerate(r['rows']):
   ts=terminals(row);need(len(ts)==1 and ts[0][0]=='register_data','random single data sink');need(ts[0][2]['bits']=={'lsb':width-1-perm.index(bit),'width':1},'random expected permutation')
 # Strict new envelope/links/limits and quality constraints. Core reused facts remain Core-extensible.
 for mutation in range(9):
  bad=copy.deepcopy(flat)
  if mutation==0:bad['algorithm']='rtl-object-catalog-v1'
  elif mutation==1:bad['extra']=1
  elif mutation==2:bad['rows'][0]['extra']=1
  elif mutation==3:bad['rows'][0]['summary']='safe_scan_cell'
  elif mutation==4:bad['rows'][0]['terminals'][0]['step']=-1
  elif mutation==5:bad['request']['limits']['pageSize']=0
  elif mutation==6:bad['rows'][0]['hasConservative']=True
  elif mutation==7:bad['complete']=False
  else:bad['rows'][0]['terminals'][0]['continuation']='0'
  need(not validator.is_valid(bad),'schema rejects mutation')
 print(json.dumps({'passed':True,'calls':len(calls),'checks':checks,'seed':223,'referenceCases':24,'output':str(e)}))
except Exception:
 print(json.dumps({'passed':False,'calls':len(calls),'checks':checks,'output':str(e)}));raise
