"""Actual RTL clock origin/edge checks, schema rejection and old mapping equivalence."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-clock-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.glob('*/*.schema.json')]]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
schema=json.loads((ROOT/'memory/memory-clock-sources.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema,registry=registry)
base=['--top','clock_top','--scope','clock_top','--recursive',str(ROOT/'tests/memory-clock-sources.sv'),'--memory-library',str(ROOT/'tests/memory-clock-library.json')]
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,r.stdout,r.stderr);return json.loads(r.stdout)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def run(args,code=4):
 d=call([*args,'--clock-sources','--require-complete'],code);validator.validate(d);c=d['clocks'];assert c['resolvedInstances']==sum(r['status']=='resolved' for r in c['rows'])
 for i,row in enumerate(c['rows']):
  assert row['memory']==i and row['macro']==d['source']['mapping']['memories'][i]['macro']
  if 'group' in row:assert i in c['groups'][row['group']]['members']
 for g,group in enumerate(c['groups']):
  for i in group['members']:assert c['rows'][i]['group']==g and c['rows'][i]['status']=='resolved'
 return d
try:
 d=run(base);old=call(base);assert clean(d['source'])==clean(old);c=d['clocks'];names={d['source']['interfaces']['catalog']['instances'][d['source']['interfaces']['macros'][r['macro']]['instance']]['info']['pathText']:r for r in c['rows']}
 assert len(names)==15 and c['resolvedInstances']==6 and len(c['groups'])==3
 g=names['clock_top.direct0']['group'];assert c['groups'][g]['path']=='clock_top.clk' and c['groups'][g]['edge']=='posedge'
 for name in ['double_inv','neg_inv','branch.nested']:assert names['clock_top.'+name]['group']==g
 assert names['clock_top.direct1']['group']!=g and names['clock_top.inverted']['group']!=g
 for name,verdict in [('constant0','constant'),('folded','constant'),('floating','undriven'),('open_pin','undriven'),('generated','generated'),('selected','logic_boundary'),('gated','logic_boundary'),('cycle','unknown'),('multiple','unknown')]:assert names['clock_top.'+name]['proof']['result']['verdict']==verdict
 # Exact complete source, root-instance port side, and mapping/analysis prefixes.
 nested=base[:];nested[3]='clock_top.branch';assert run(nested,0)['clocks']['resolvedInstances']==1
 root=['--top','clock_ram','--scope','clock_ram',str(ROOT/'tests/memory-clock-sources.sv'),'--memory-library',str(ROOT/'tests/memory-clock-library.json')];assert run(root,0)['clocks']['groups'][0]['path']=='clock_ram.CLK'
 empty=base[:];empty.remove('--recursive');assert run(empty,0)['clocks']['rows']==[]
 for flag,cap in [('--clock-max-work',1),('--clock-max-work',20),('--clock-max-depth',1),('--map-max-macros',2),('--max-macros',2),('--map-max-work',1)]:
  part=run([*base,flag,str(cap)]);assert not part['clocks']['complete'];original=call([*base,flag,str(cap)]) if not flag.startswith('--clock-') else None
  if original:assert clean(part['source'])==clean(original)
 # Optional old cone evidence does not become a second source authority.
 with_cone=run([*base,'--clock-pin','CLK']);assert [r['status'] for r in with_cone['clocks']['rows']]==[r['status'] for r in c['rows']]
 absent=base[:];absent[5]='/absent-clock-sources.sv'
 for flag,maximum in [('--clock-max-work',1000000),('--clock-max-depth',256),('--clock-max-millis',60000)]:
  for n in ['0',str(maximum+1),'-1','1.5','18446744073709551616']:
   error=call([*absent,'--clock-sources',flag,n],2);validator.validate(error)
  call([*absent,flag,'1'],2)
 for flags in [['--clock-sources','--clock-sources'],['--clock-sources','--plan-tests'],['--plan-tests','--clock-sources'],['--clock-sources','--schedule-tests'],['--clock-sources','--time-tests'],['--clock-sources','--test-coverage']]:call([*absent,*flags],2)
 no_model=absent[:-2];call([*no_model,'--clock-sources'],2)
 # Strict shape failures; cross-array math is checked above, not claimed as schema work.
 mutations=[]
 for field in ['source','limits','clocks']:x=copy.deepcopy(d);x.pop(field);mutations.append(x)
 x=copy.deepcopy(d);x['extra']=1;mutations.append(x)
 for field,value in [('status','invented'),('group',-1),('pin','0')]:x=copy.deepcopy(d);x['clocks']['rows'][0][field]=value;mutations.append(x)
 x=copy.deepcopy(d);x['clocks']['rows'][0]['reason']='impossible';mutations.append(x)
 x=copy.deepcopy(d);x['clocks']['rows'][0].pop('group');mutations.append(x)
 x=copy.deepcopy(d);x['clocks']['groups'][0]['members']=[];mutations.append(x)
 for x in mutations:assert not validator.is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(mutations),out=str(OUT))))
finally:(OUT/'commands.json').write_text(json.dumps(calls,indent=2))
