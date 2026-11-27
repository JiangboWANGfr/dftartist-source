"""Config/manual parity on real RTL; strict input failures precede design opening."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent
schema=json.loads((root.parent/'wrapper/wrapper-config.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema)
reports=[json.loads((root.parent/'wrapper'/n).read_text()) for n in ['boundary-report.schema.json','cell-plan-report.schema.json','chain-plan-report.schema.json']]
core=json.loads(Path(sys.argv[2]).read_text());registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in [core,*reports]])
validators={mode:Draft202012Validator(s,registry=registry) for mode,s in zip(['boundary','cells','chains'],reports)}
e=Path(tempfile.mkdtemp(prefix='wrapper-config-cli-'));calls=[];checks=0;pairs=0;negative=0
def need(ok,why):
 global checks
 checks+=1
 if not ok:raise AssertionError(why)
def run(args,exit=0,source=None):
 argv=[str(binary),'--top','chain_top',str(source or root/'wrapper-chains.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2))
 need(x.returncode==exit,f'exit {x.returncode}!={exit}: {argv}: {x.stdout!r}');return json.loads(x.stdout)
def config(c):
 p=e/f'config-{len(calls)}.json';p.write_text(json.dumps(c,ensure_ascii=False));return str(p)
def norm(x,sid=None):
 if sid is None:
  node=x
  while 'source' in node:node=node['source']
  sid=node.get('snapshot',{}).get('snapshotId')
 if isinstance(x,dict):return {k:norm(v,sid) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return [norm(v,sid) for v in x]
 if isinstance(x,str) and sid and x.startswith('m3:'):return x.replace(str(len(sid))+':'+sid,'<snapshot>')
 return x
def flags(c):
 b=c['boundary'];args=['--scope',b['scope']]
 for p in b.get('ports',[]):args+=['--port',p]
 groups=[(b.get('limits',{}),{'maxPorts':'max-ports','maxBits':'max-bits','maxWork':'max-work','maxDepth':'max-depth','maxMillis':'max-millis','pageSize':'page-size'})]
 if c['mode']!='boundary':
  args+=['--plan-'+c['mode']];p=c.get('planning',{});groups += [(p.get('policy',{}),{'maxInputCandidates':'max-input-candidates','maxOutputCandidates':'max-output-candidates'}),(p.get('limits',{}),{'maxRows':'max-plan-rows','maxWork':'max-plan-work','maxMillis':'max-plan-millis'})]
  for r in p.get('rules',[]):
   args+=['--cell-bit-rule' if 'bits' in r else '--cell-rule',r['port']]
   if 'bits' in r:args += [str(r['bits']['lsb']),str(r['bits']['width'])]
   args += [r['direction'],r['action']]
 if c['mode']=='chains':
  p=c['chaining']
  for r in p['chains']:args+=['--chain',r['name'],str(r['capacity'])]
  if 'defaultChain' in p:args+=['--chain-default',p['defaultChain']]
  for r in p.get('assignments',[]):
   args+=['--chain-bits' if 'bits' in r else '--chain-port',r['port']]
   if 'bits' in r:args += [str(r['bits']['lsb']),str(r['bits']['width'])]
   args += [r['direction'],r['chain']]
  groups += [(p.get('limits',{}),{'maxRows':'max-chain-rows','maxSegments':'max-chain-segments','maxWork':'max-chain-work','maxMillis':'max-chain-millis'})]
 for values,names in groups:
  for key,value in values.items():args+=['--'+names[key],str(value)]
 return args
def parity(c,exit=0):
 global pairs
 validator.validate(c);a=run(['--config',config(c),'--require-complete'],exit);b=run(flags(c)+['--require-complete'],exit);validators[c['mode']].validate(a);need(norm(a)==norm(b),'manual/config full equality');pairs+=1;return a
base=dict(formatVersion=1,kind='wrapper-config',mode='boundary',boundary=dict(scope='chain_top',ports=['q','alias_q']))
full=copy.deepcopy(base);full.update(mode='chains',planning=dict(policy=dict(maxInputCandidates=3,maxOutputCandidates=2),rules=[dict(port='q',direction='output',action='dedicated',bits=dict(lsb=0,width=1))],limits=dict(maxRows=100,maxWork=10000,maxMillis=60000)),chaining=dict(chains=[dict(name='scan',capacity=10),dict(name='备用',capacity=2)],defaultChain='scan',assignments=[dict(port='q',direction='output',chain='备用',bits=dict(lsb=0,width=1))],limits=dict(maxRows=100,maxSegments=100,maxWork=1000,maxMillis=60000)))
full['boundary']['limits']=dict(maxPorts=4,maxBits=100,maxWork=10000,maxDepth=64,maxMillis=60000,pageSize=1)
try:
 parity(base);parity(dict(base,mode='cells'));good=parity(full);need(good['layout']['counts']['dedicatedBits']==1,'dedicated in configured chain')
 rng=random.Random(226)
 for case in range(24):
  c=copy.deepcopy(full);c['chaining']['chains'][0]['capacity']=rng.randrange(1,7);c['planning']['rules'][0]['action']=rng.choice(['exclude','share','dedicated']);c['chaining']['assignments'][0]['chain']='scan';c['chaining']['limits']['maxWork']=rng.randrange(1,28)
  # Exit is checked against a bounded run without require-complete before parity.
  probe=run(['--config',config(c)]);parity(c,0 if probe['layout']['complete'] else 4)
 for group,key in [('boundary','maxBits'),('planning','maxRows'),('chaining','maxSegments')]:
  c=copy.deepcopy(full);c[group]['limits'][key]=1;parity(c,4)
 # Every manual option conflicts, independently of its value/order.
 manual=flags(full);opts=[];i=0
 while i<len(manual):
  n={'--plan-chains':1,'--chain':3,'--cell-rule':4,'--cell-bit-rule':6,'--chain-port':4,'--chain-bits':6}.get(manual[i],2);opts.append(manual[i:i+n]);i+=n
 opts += [['--plan-cells'],['--cell-rule','q','output','exclude'],['--chain-port','q','output','scan']]
 f=config(full)
 for arg in opts:
  for combo in [['--config',f,*arg],[*arg,'--config',f]]:run(combo,2,source=e/'missing.sv')
 for args in [['--config',f,'--config',f],['--config'],['--config',str(e)],['--config',''],['--config',str(e/'missing')]]:run(args,2)
 fifo=e/'fifo';os.mkfifo(fifo);run(['--config',str(fifo)],2)
 link=e/'link.json';link.symlink_to(f);need(norm(run(['--config',str(link)]))==norm(good),'regular symlink')
 # Strict schema shape failures and semantic-only cross-field failures.
 bads=[]
 def change(path,value,source=full):
  c=copy.deepcopy(source);o=c
  for k in path[:-1]:o=o[k]
  o[path[-1]]=value;return c
 for path,value in [(['mode'],'unknown'),(['formatVersion'],2),(['planning'],None),(['chaining','unknown'],1),(['boundary','ports'],None),(['boundary','limits','maxDepth'],257),(['planning','policy','maxOutputCandidates'],0),(['planning','rules',0,'direction'],'bad'),(['planning','rules',0,'action'],'bad'),(['planning','rules',0,'bits','width'],0),(['chaining','chains',0,'capacity'],False),(['chaining','chains',0,'capacity'],9007199254740992),(['chaining','assignments',0,'extra'],1),(['chaining','limits','maxSegments'],0),(['boundary','scope'],'')]:bads.append(change(path,value))
 bads += [dict(base,planning={}),dict(base,chaining=full['chaining']),dict(base,mode='chains'),dict(full,mode='cells')]
 for c in bads:
  need(not validator.is_valid(c),'schema rejects malformed config');negative+=1;run(['--config',config(c)],2,source=e/'missing.sv')
 for c in [change(['chaining','defaultChain'],'absent'),change(['chaining','assignments',0,'chain'],'absent'),change(['boundary','ports'],['q','q']),change(['chaining','chains'],[dict(name='s',capacity=1)]*2),change(['planning','rules'],full['planning']['rules']*2),change(['chaining','assignments'],full['chaining']['assignments']*2),change(['planning','rules',0,'bits'],dict(lsb=9007199254740991,width=1)),change(['boundary','scope'],'é'*2049),change(['planning','rules',0,'port'],'\x00')]:run(['--config',config(c)],2,source=e/'missing.sv')
 # Strict decoder and exact-number semantics are stronger than Python float JSON parsing.
 raw=json.dumps(full)
 malformed=['[]','null',raw+'x',raw.replace('"formatVersion": 1','"formatVersion": 1, "f\\u006frmatVersion": 1'),raw.replace('"capacity": 10','"capacity": 10.0000000000000001'),raw.replace('"capacity": 10','"capacity": 1e999'),raw.replace('"scope": "chain_top"','"scope": "\\ud800"'),'{"a":'+ '['*200+'0'+']'*200+'}']
 for value in malformed:
  f=e/f'raw-{len(calls)}.json';f.write_text(value);run(['--config',str(f)],2,source=e/'missing.sv')
 for data in [raw.encode()+b'\xff',raw.encode()+b' '*(1048577-len(raw.encode()))]:
  f=e/f'bytes-{len(calls)}.json';f.write_bytes(data);run(['--config',str(f)],2,source=e/'missing.sv')
 exact=e/'exact.json';data=json.dumps(base).encode();exact.write_bytes(data+b' '*(1048576-len(data)));run(['--config',str(exact)])
 # Syntactically valid requests still use the original actual-target errors.
 run(['--config',config(change(['boundary','scope'],'missing'))],3)
 run(['--config',config(change(['planning','rules',0,'bits'],dict(lsb=4,width=1)))],2)
 # Input options remain outside config: -F uses the filelist directory.
 inputs=e/'inputs';inputs.mkdir();(inputs/'design.sv').write_bytes((root/'wrapper-chains.sv').read_bytes());(inputs/'rtl.f').write_text('design.sv\n')
 x=subprocess.run([str(binary),'--top','chain_top','-F',str(inputs/'rtl.f'),'-I',str(inputs),'-D','CONFIG_TEST=1','--config',config(base)],capture_output=True)
 i=len(calls);(e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=x.args,cwd=os.getcwd(),exit=x.returncode));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==0,'-F input relative semantics');validators['boundary'].validate(json.loads(x.stdout))
 print(json.dumps(dict(calls=len(calls),checks=checks,pairs=pairs,schemaNegative=negative,evidence=str(e))))
except Exception:
 print('evidence='+str(e));raise
