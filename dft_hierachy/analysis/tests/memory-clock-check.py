"""Clock allowlists: actual Design, strict input/output and old-domain equivalence."""
import copy,json,os,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-clock-check-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.glob('**/*.schema.json')]]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
schema=json.loads((ROOT/'memory/memory-clock-check.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema,registry=registry)
input_schema=json.loads((ROOT/'memory/input/memory-clock-expectations.schema.json').read_text());Draft202012Validator.check_schema(input_schema);iv=Draft202012Validator(input_schema)
def file(name,value):p=OUT/name;p.write_text(json.dumps(value,indent=2));return str(p)
lib=json.loads((ROOT/'tests/memory-clock-library.json').read_text());lib['testProfiles']=[dict(definitionName=m['definitionName'],operationsPerWord=2,powerMicrowatts=10) for m in lib['models']];library=file('library.json',lib)
base=['--top','domain_resolved','--scope','domain_resolved','--recursive',str(ROOT/'tests/memory-clock-sources.sv'),str(ROOT/'tests/memory-test-domains.sv'),'--memory-library',library,'--plan-tests']
rule=[dict(path=['domain_resolved'],recursive=True,clockDomain='D',partition='')];rf=file('rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=rule));opts=[*base,'--test-rules',rf]
sources=[dict(path='domain_resolved.clk',bit=0,edge='posedge'),dict(path='domain_resolved.clk',bit=1,edge='posedge'),dict(path='domain_resolved.clk',bit=0,edge='negedge')];expect=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain='D',sources=sources)]);ef=file('expectations.json',expect);iv.validate(expect)
def call(options,code=0):
 r=subprocess.run([BIN,*options],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*options],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,r.stdout,r.stderr);return json.loads(r.stdout)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
equivalences=0
def run(options,expectation=ef,code=0,compare=True,require=True):
 global equivalences
 d=call([*options,'--check-test-clocks',expectation,*(['--require-complete'] if require else [])],code);validator.validate(d);c=d['check'];src=d['source'];assert len(c['rows'])==len(src['domains']['rows'])
 counts={key:0 for key in ['match','mismatch','unresolved','unconstrained','unassigned']};used=set()
 for i,row in enumerate(c['rows']):
  assert row['row']==i;counts[row['status']]+=1;origin=src['domains']['rows'][i]
  if 'expectation' in row:
   e=c['request'][row['expectation']];used.add(row['expectation']);assert e['clockDomain']==src['domains']['groups'][origin['domain']]['clockDomain']
  if row['status'] in ['match','mismatch']:
   group=src['clocks']['groups'][src['clocks']['rows'][origin['clock']]['group']];actual=dict(path=group['path'],bit=group['point']['slice']['bits']['lsb'],edge=group['edge'])
   assert (actual in e['sources'])==(row['status']=='match')
   if row['status']=='match':assert e['sources'][row['source']]==actual
  if row['status']=='unresolved':assert row['reason']==('clock_not_reached' if 'clock' not in origin else 'source_unresolved')
 for status,field in [('match','matchedInstances'),('mismatch','mismatchedInstances'),('unresolved','unresolvedInstances'),('unconstrained','unconstrainedInstances'),('unassigned','unassignedInstances')]:assert counts[status]==c[field]
 assert c['unusedExpectations']==[i for i in range(len(c['request'])) if i not in used]
 assert c['complete']==(src['domains']['complete'] and not (counts['unresolved']+counts['unconstrained']+counts['unassigned']) and not c['unusedExpectations'])
 assert c['verdict']==('fail' if counts['mismatch'] else 'pass' if c['complete'] else 'unknown')
 if compare:
  old=call([*options,'--inspect-test-domains']);assert clean(old)==clean(src);equivalences+=1
 return d
try:
 d=run(opts);assert d['check']['matchedInstances']==6 and d['check']['verdict']=='pass' and d['source']['domains']['groups'][0]['status']=='mixed'
 single=copy.deepcopy(expect);single['domains'][0]['sources']=sources[:1];sf=file('single.json',single);f=run(opts,sf);assert f['check']['mismatchedInstances']==2 and f['check']['matchedInstances']==4 and f['check']['complete']
 for source in [dict(path='missing.path',bit=0,edge='posedge'),dict(path='domain_resolved.clk',bit=9,edge='posedge')]:
  wrong=copy.deepcopy(single);wrong['domains'][0]['sources']=[source];f=run(opts,file('wrong-'+str(len(calls))+'.json',wrong));assert f['check']['mismatchedInstances']==6
 part=run([*opts,'--test-max-work','1'],sf,4);assert part['check']['verdict']=='fail'
 part=run([*opts,'--test-max-work','1'],ef,4);assert part['check']['matchedInstances']==6 and part['check']['verdict']=='unknown'
 for flag,limit in [('--clock-max-work','1'),('--clock-max-depth','1'),('--map-max-macros','2'),('--max-macros','2')]:run([*opts,flag,limit],ef,4)
 run([*opts,'--clock-max-work',str(d['source']['clocks']['work'])])
 empty=file('empty.json',dict(formatVersion=1,kind='memory-clock-expectations',domains=[]));assert run(opts,empty,4)['check']['unconstrainedInstances']==6
 assert run(base,ef,4)['check']['unassignedInstances']==6
 unused=copy.deepcopy(expect);unused['domains'].append(dict(clockDomain='unused',sources=sources));uf=file('unused.json',unused);assert run(opts,uf,4)['check']['unusedExpectations']==[1]
 noobs=opts[:];noobs.remove('--recursive');assert run(noobs,ef,4)['check']['rows']==[];assert run(noobs,empty)['check']['verdict']=='pass'
 # Explicit assignments and configured rules use the same original production path.
 assignments=[dict(instancePath='domain_resolved.'+n,clockDomain='D',partition='') for n in ['direct0','direct1','inverted','double_inv','neg_inv','branch.nested']]
 manual=[v for r in assignments for v in ['--test-instance',r['instancePath'],r['clockDomain'],r['partition']]];run([*base,*manual])
 for key,rows in [('assignments',assignments),('rules',rule)]:cfg=file('config-'+key+'.json',dict(formatVersion=1,kind='memory-test-config',**{key:rows}));run([*base,'--test-config',cfg])
 # Two domains may share an allowed source; membership remains an explicit declaration.
 split=copy.deepcopy(assignments);split[0]['clockDomain']='other';splitArgs=[v for r in split for v in ['--test-instance',r['instancePath'],r['clockDomain'],r['partition']]];shared=copy.deepcopy(expect);shared['domains'].append(dict(clockDomain='other',sources=sources));run([*base,*splitArgs],file('shared.json',shared))
 full=base[:];full[1]=full[3]='domain_top';fullrule=file('full-rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=[dict(path=['domain_top'],recursive=True,clockDomain='D',partition='')]));fullExpected=copy.deepcopy(expect)
 for s in fullExpected['domains'][0]['sources']:s['path']='domain_top.clk'
 fullpath=file('full-expected.json',fullExpected);unknown=run([*full,'--test-rules',fullrule],fullpath,4);assert unknown['check']['matchedInstances']==6 and unknown['check']['unresolvedInstances']==1
 fullExpected['domains'][0]['sources']=fullExpected['domains'][0]['sources'][:1];failpath=file('full-fail.json',fullExpected);assert run([*full,'--test-rules',fullrule],failpath,4)['check']['verdict']=='fail';run([*full,'--test-rules',fullrule],failpath,0,require=False)
 # Invalid input and modes must fail before an absent HDL is opened.
 absent=base[:];absent[5]='/absent-memory-clock-check.sv'
 invalid=[]
 for key,value in [('formatVersion',2),('kind','other'),('extra',1),('domains',{})]:x=copy.deepcopy(expect);x[key]=value;invalid.append(x)
 x=copy.deepcopy(expect);x['domains']*=2;invalid.append(x)
 for key,value in [('clockDomain',''),('clockDomain','x\x00'),('clockDomain','x'*4097),('sources',[]),('sources',sources*86),('extra',True)]:x=copy.deepcopy(expect);x['domains'][0][key]=value;invalid.append(x)
 for key,value in [('path',''),('path','x\x00'),('bit',-1),('bit',1.5),('bit',True),('bit',9007199254740992),('edge','both'),('extra',0)]:x=copy.deepcopy(expect);x['domains'][0]['sources'][0][key]=value;invalid.append(x)
 for i,x in enumerate(invalid):validator.validate(call([*absent,'--check-test-clocks',file('invalid-'+str(i)+'.json',x)],2))
 rawCases=[b'{',b'{"formatVersion":1,"formatVersion":1,"kind":"memory-clock-expectations","domains":[]}',b'\xff',b'[]']
 for i,value in enumerate(rawCases):raw=OUT/f'raw-{i}.json';raw.write_bytes(value);validator.validate(call([*absent,'--check-test-clocks',str(raw)],2))
 for path in ['/absent-expected.json',str(OUT)]:validator.validate(call([*absent,'--check-test-clocks',path],2))
 fifo=OUT/'fifo';os.mkfifo(fifo);validator.validate(call([*absent,'--check-test-clocks',str(fifo)],2))
 cap=OUT/'cap.json';raw=json.dumps(expect).encode();cap.write_bytes(raw+b' '*(1048576-len(raw)));run(opts,str(cap));cap.write_bytes(cap.read_bytes()+b' ');validator.validate(call([*absent,'--check-test-clocks',str(cap)],2))
 for extra in [['--clock-sources'],['--inspect-test-domains'],['--schedule-tests'],['--time-tests'],['--test-coverage'],['--compare-test-config','x','/absent.json'],['--check-test-clocks',ef],['--clock-max-work','0']]:validator.validate(call([*absent,'--check-test-clocks',ef,*extra],2))
 noPlan=absent[:];noPlan.remove('--plan-tests');validator.validate(call([*noPlan,'--check-test-clocks',ef],2))
 # Strict output local invariants; exact index and count relations checked above.
 mutations=[]
 for key in ['source','check']:x=copy.deepcopy(d);x.pop(key);mutations.append(x)
 for key,value in [('verdict','unknown'),('verdict','fail'),('complete',False),('matchedInstances',-1)]:x=copy.deepcopy(d);x['check'][key]=value;mutations.append(x)
 for key,value in [('status','other'),('row',-1),('reason','source_unresolved'),('expectation','0')]:x=copy.deepcopy(d);x['check']['rows'][0][key]=value;mutations.append(x)
 for key in ['source','expectation']:x=copy.deepcopy(d);x['check']['rows'][0].pop(key);mutations.append(x)
 x=copy.deepcopy(d);x['check']['unusedExpectations']=[0];mutations.append(x)
 for x in mutations:assert not validator.is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(mutations),equivalences=equivalences,invalidInputs=len(invalid)+len(rawCases)+4,out=str(OUT))))
finally:(OUT/'commands.json').write_text(json.dumps(calls,indent=2))
