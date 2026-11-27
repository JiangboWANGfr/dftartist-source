"""Declared domain inspection on actual RTL, including original report equivalence."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-domain-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.glob('*/*.schema.json')]]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
schema=json.loads((ROOT/'memory/memory-test-domains.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema,registry=registry)
def file(name,value):p=OUT/name;p.write_text(json.dumps(value,indent=2));return str(p)
lib=json.loads((ROOT/'tests/memory-clock-library.json').read_text());lib['testProfiles']=[dict(definitionName=m['definitionName'],operationsPerWord=2,powerMicrowatts=10) for m in lib['models']];library=file('library.json',lib)
base=['--top','domain_resolved','--scope','domain_resolved','--recursive',str(ROOT/'tests/memory-clock-sources.sv'),str(ROOT/'tests/memory-test-domains.sv'),'--memory-library',library]
names=['direct0','direct1','inverted','double_inv','neg_inv','branch.nested']
assignments=[dict(instancePath='domain_resolved.'+n,clockDomain='D',partition='A' if n=='direct0' else 'B') for n in names]
def args(rows):return [v for r in rows for v in ['--test-instance',r['instancePath'],r['clockDomain'],r['partition']]]
def call(options,code=0):
 r=subprocess.run([BIN,*options],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*options],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,r.stdout,r.stderr);return json.loads(r.stdout)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
equivalences=0
def run(options,code=0,compare=True):
 global equivalences
 d=call([*options,'--inspect-test-domains','--require-complete'],code);validator.validate(d)
 source=d['source'];s=source.get('report',source);rows=d['domains']['rows'];groups=d['domains']['groups'];clocks=d['clocks']
 assert len(rows)==len(s['mapping']['memories']) if 'mapping' in s else len(rows)==len(s['investigation']['mapping']['memories'])
 assigned=resolved=0
 for i,r in enumerate(rows):
  assert r['memory']==i and ('assignment' in r)==('domain' in r)
  if 'clock' in r:assert clocks['rows'][r['clock']]['memory']==i
  if 'assignment' in r:
   assigned+=1;g=groups[r['domain']];assert i in g['members'] and g['clockDomain']==s['plan']['request']['assignments'][r['assignment']]['clockDomain']
 for j,g in enumerate(groups):
  ids=[];count=0
  for i in g['members']:
   r=rows[i];assert r['domain']==j
   if 'clock' in r and 'group' in clocks['rows'][r['clock']]:
    count+=1;cg=clocks['rows'][r['clock']]['group']
    if cg not in ids:ids.append(cg)
  assert ids==g['clockGroups'] and count==g['resolvedInstances'];resolved+=count
  assert g['sourcesComplete']==(count==len(g['members']))
  assert g['status']==('mixed' if len(ids)>1 else 'uniform' if count==len(g['members']) else 'unresolved')
  assert g['controllers']==[i for i,c in enumerate(s['plan']['controllers']) if c['clockDomain']==g['clockDomain']]
 assert assigned==d['domains']['assignedInstances'] and resolved==d['domains']['resolvedInstances']
 assert d['domains']['unassignedMemories']==[i for i,r in enumerate(rows) if 'assignment' not in r]
 assert d['domains']['complete']==(s['plan']['complete'] and clocks['complete'] and assigned==len(rows))
 if compare:
  oldargs=[];i=0
  while i<len(options):
   if options[i].startswith('--clock-max-'):i+=2;continue
   oldargs.append(options[i]);i+=1
  old=call(oldargs);assert clean(source)==clean(old);equivalences+=1
 return d
try:
 opts=[*base,'--plan-tests',*args(assignments)];d=run(opts);g=d['domains']['groups'][0];assert d['domains']['complete'] and g['status']=='mixed' and len(g['controllers'])==3 and len(g['clockGroups'])==3
 oldclock=call([*base,'--clock-sources']);assert clean(oldclock['clocks'])==clean(d['clocks']);equivalences+=1
 split=copy.deepcopy(assignments)
 for r in split:r['clockDomain']='bit1' if r['instancePath'].endswith('direct1') else 'negative' if r['instancePath'].endswith('inverted') else 'bit0'
 uniform=run([*base,'--plan-tests',*args(split)]);assert len(uniform['domains']['groups'])==3 and all(g['status']=='uniform' for g in uniform['domains']['groups'])
 missing=run([*base,'--plan-tests',*args(assignments[:-1])],4);assert len(missing['domains']['unassignedMemories'])==1
 for flags in [['--test-max-work','1'],['--clock-max-work','1'],['--clock-max-depth','1'],['--map-max-macros','2'],['--max-macros','2'],['--test-max-controllers','1']]:
  part=run([*opts,*flags],4)
  if flags[0] in ['--test-max-work','--clock-max-work']:assert len(part['domains']['rows'])==6 and part['domains']['assignedInstances']==6
 exact=run([*opts,'--clock-max-work',str(d['clocks']['work'])]);assert exact['domains']['complete']
 empty=base[:];empty.remove('--recursive');assert run([*empty,'--plan-tests',*args(assignments)],4)['domains']['groups']==[];assert run([*empty,'--plan-tests'])['domains']['complete']
 rule=[dict(path=['domain_resolved'],recursive=True,clockDomain='D',partition='B')];rf=file('rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=rule));ruled=run([*base,'--plan-tests','--test-rules',rf]);assert ruled['source']['algorithm']=='rtl-memory-test-rules-v1'
 for key,rows in [('assignments',assignments),('rules',rule)]:
  cfg=file('config-'+key+'.json',dict(formatVersion=1,kind='memory-test-config',**{key:rows}));run([*base,'--plan-tests','--test-config',cfg])
 full=base[:];full[1]=full[3]='domain_top';fullrule=file('full-rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=[dict(path=['domain_top'],recursive=True,clockDomain='D',partition='')]))
 mixed=run([*full,'--plan-tests','--test-rules',fullrule],4);assert mixed['domains']['groups'][0]['status']=='mixed' and not mixed['domains']['groups'][0]['sourcesComplete'] and mixed['domains']['resolvedInstances']==6
 badlib=copy.deepcopy(lib);badlib['models'][0]['dataBits']=16;badbase=base[:-1]+[file('mismatched-library.json',badlib)];m=run([*badbase,'--plan-tests',*args(assignments)],4);assert m['domains']['assignedInstances']==6
 absent=base[:];absent[5]='/absent-domains.sv'
 for flags in [[],['--plan-tests','--inspect-test-domains'],['--plan-tests','--clock-sources'],['--plan-tests','--schedule-tests'],['--plan-tests','--time-tests'],['--plan-tests','--test-coverage'],['--plan-tests','--compare-test-config','x','/absent-config.json'],['--plan-tests','--clock-max-work','0'],['--plan-tests','--clock-max-work','1000001'],['--plan-tests','--clock-max-depth','257'],['--plan-tests','--clock-max-millis','0']]:
  validator.validate(call([*absent,*flags,'--inspect-test-domains'],2))
 invalid=file('invalid-config.json',dict(formatVersion=1,kind='memory-test-config',assignments=assignments,timing=dict(clocks=[dict(clockDomain='D',periodPicoseconds=0)])))
 validator.validate(call([*absent,'--plan-tests','--inspect-test-domains','--test-config',invalid],2))
 mutations=[]
 for field in ['source','limits','clocks','domains']:x=copy.deepcopy(d);x.pop(field);mutations.append(x)
 x=copy.deepcopy(d);x['extra']=1;mutations.append(x)
 for field,value in [('memory',-1),('clock','0'),('extra',1)]:x=copy.deepcopy(d);x['domains']['rows'][0][field]=value;mutations.append(x)
 x=copy.deepcopy(d);x['domains']['rows'][0].pop('assignment');mutations.append(x)
 for field,value in [('members',[]),('status','invented'),('clockGroups',[0]),('controllers',[-1])]:x=copy.deepcopy(d);x['domains']['groups'][0][field]=value;mutations.append(x)
 x=copy.deepcopy(d);x['domains']['reasons']=['plan_partial'];mutations.append(x)
 for x in mutations:assert not validator.is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(mutations),equivalences=equivalences,out=str(OUT))))
finally:(OUT/'commands.json').write_text(json.dumps(calls,indent=2))
