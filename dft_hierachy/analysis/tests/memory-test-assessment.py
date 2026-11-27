"""One actual investigation: test coverage plus explicit RTL clock requirements."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-assessment-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.glob('**/*.schema.json')]]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
schema=json.loads((ROOT/'memory/memory-test-assessment.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema,registry=registry)
def file(name,value):p=OUT/name;p.write_text(json.dumps(value,indent=2));return str(p)
lib=json.loads((ROOT/'tests/memory-clock-library.json').read_text());lib['testProfiles']=[dict(definitionName=m['definitionName'],operationsPerWord=2,powerMicrowatts=10) for m in lib['models']];library=file('library.json',lib)
base=['--top','domain_resolved','--scope','domain_resolved','--recursive',str(ROOT/'tests/memory-clock-sources.sv'),str(ROOT/'tests/memory-test-domains.sv'),'--memory-library',library,'--plan-tests','--schedule-tests','--time-tests']
rules=[dict(path=['domain_resolved'],recursive=True,clockDomain='D',partition='')];rf=file('rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=rules));timing=['--test-clock','D','1000','--time-wave-overhead','7'];opts=[*base,'--test-rules',rf,*timing]
sources=[dict(path='domain_resolved.clk',bit=0,edge='posedge'),dict(path='domain_resolved.clk',bit=1,edge='posedge'),dict(path='domain_resolved.clk',bit=0,edge='negedge')];expect=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain='D',sources=sources)]);ef=file('expected.json',expect)
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,r.stdout,r.stderr);return json.loads(r.stdout)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def stage_args(args,clock):
 out=[];i=0
 while i<len(args):
  arg=args[i]
  if clock and arg in ['--schedule-tests','--time-tests']:i+=1
  elif clock and arg=='--test-clock':i+=3
  elif clock and arg.startswith(('--schedule-','--time-')):i+=2
  elif not clock and arg.startswith('--clock-max-'):i+=2
  else:out.append(arg);i+=1
 return out
equivalences=0
def run(args,expectation=ef,code=0,require=True):
 global equivalences
 d=call([*args,'--assess-tests',expectation,*(['--require-complete'] if require else [])],code);validator.validate(d);a=d['assessment'];coverage=d['source']['coverage'];assert len(a['rows'])==len(coverage['rows']);counts={s:0 for s in ['satisfied','blocked','pending']}
 for i,row in enumerate(a['rows']):
  assert row['macro']==i;counts[row['status']]+=1;c=coverage['rows'][i];issues=[]
  if c['status'] in ['blocked','pending']:issues.append('test_'+c['status'])
  if 'clockCheck' not in row:assert 'memory' not in c;issues.append('clock_check_not_reached');clock=None
  else:
   clock=d['check']['rows'][row['clockCheck']];assert c['memory']==d['domains']['rows'][clock['row']]['memory'];reason=dict(mismatch='clock_mismatch',unresolved='clock_unresolved',unconstrained='clock_unconstrained',unassigned='domain_missing').get(clock['status'])
   if reason:issues.append(reason)
  assert row['issues']==issues
  wanted='blocked' if c['status']=='blocked' or (clock and clock['status']=='mismatch') else 'satisfied' if c['status']=='timed' and clock and clock['status']=='match' else 'pending';assert row['status']==wanted
 assert counts==dict(satisfied=a['satisfiedInstances'],blocked=a['blockedInstances'],pending=a['pendingInstances'])
 assert a['complete']==(coverage['complete'] and d['check']['complete']);assert a['verdict']==('fail' if counts['blocked'] else 'pass' if a['complete'] and not counts['pending'] else 'unknown')
 original=call([*stage_args(args,False),'--test-coverage']);assert clean(original)==clean(d['source']);equivalences+=1
 clock=call([*stage_args(args,True),'--check-test-clocks',expectation]);assert clean(clock['source']['source'])==clean(d['source']['source']['source']['source'])
 for key in ['clocks','domains']:assert clean(clock['source'][key])==clean(d[key])
 assert clean(clock['check'])==clean(d['check']);equivalences+=1
 return d
try:
 d=run(opts);assert d['assessment']['satisfiedInstances']==6 and d['source']['source']['timeline']['durationPicoseconds']==32014
 single=copy.deepcopy(expect);single['domains'][0]['sources']=sources[:1];sf=file('single.json',single);fail=run(opts,sf);assert fail['assessment']['blockedInstances']==2 and fail['assessment']['complete']
 run([*opts,'--test-max-work','1'],sf,4)
 for args in [['--test-max-power','1'],['--schedule-max-power','1']]:
  x=run([*opts,*args],ef,4);assert x['assessment']['blockedInstances']==6
 x=run([*opts,'--test-max-power','1'],sf,4);assert sum(row['issues']==['test_blocked','clock_mismatch'] for row in x['assessment']['rows'])==2
 noPeriod=[*base,'--test-rules',rf];x=run(noPeriod,ef,4);assert x['assessment']['blockedInstances']==4 and x['assessment']['pendingInstances']==2
 for args in [['--time-max-work','1'],['--time-max-duration','16007'],['--schedule-max-waves','1'],['--clock-max-work','1'],['--clock-max-depth','1'],['--map-max-macros','2'],['--max-macros','2'],['--test-max-work','1']]:run([*opts,*args],ef,4)
 x=run([*opts,'--map-max-macros','2'],ef,4);assert x['assessment']['satisfiedInstances']==2 and x['assessment']['rows'][2]['issues']==['test_pending','clock_check_not_reached']
 empty=file('empty.json',dict(formatVersion=1,kind='memory-clock-expectations',domains=[]));assert run(opts,empty,4)['assessment']['pendingInstances']==6
 assert run([*base,*timing],ef,4)['assessment']['blockedInstances']==6
 unused=copy.deepcopy(expect);unused['domains'].append(dict(clockDomain='unused',sources=sources));assert run(opts,file('unused.json',unused),4)['assessment']['satisfiedInstances']==6
 noobs=opts[:];noobs.remove('--recursive');run(noobs,ef,4);assert run(noobs,empty)['assessment']['verdict']=='pass'
 assignments=[dict(instancePath='domain_resolved.'+n,clockDomain='D',partition='') for n in ['direct0','direct1','inverted','double_inv','neg_inv','branch.nested']]
 manual=[v for r in assignments for v in ['--test-instance',r['instancePath'],r['clockDomain'],r['partition']]];run([*base,*manual,*timing])
 cfg=file('config.json',dict(formatVersion=1,kind='memory-test-config',rules=rules,timing=dict(clocks=[dict(clockDomain='D',periodPicoseconds=1000)],policy=dict(waveOverheadPicoseconds=7))));run([*base,'--test-config',cfg])
 full=base[:];full[1]=full[3]='domain_top';fr=file('full-rules.json',dict(formatVersion=1,kind='memory-test-rules',rules=[dict(path=['domain_top'],recursive=True,clockDomain='D',partition='')]));fe=copy.deepcopy(expect)
 for s in fe['domains'][0]['sources']:s['path']='domain_top.clk'
 x=run([*full,'--test-rules',fr,*timing],file('full.json',fe),4);assert x['assessment']['satisfiedInstances']==6 and x['assessment']['pendingInstances']==1
 fe['domains'][0]['sources']=fe['domains'][0]['sources'][:1];ff=file('full-fail.json',fe);x=run([*full,'--test-rules',fr,*timing],ff,4);assert x['assessment']['blockedInstances']==2 and x['assessment']['pendingInstances']==1;run([*full,'--test-rules',fr,*timing],ff,0,False)
 absent=opts[:];absent[5]='/absent-assessment.sv'
 for extra in [['--clock-sources'],['--inspect-test-domains'],['--check-test-clocks',ef],['--test-coverage'],['--compare-test-config','x',cfg],['--assess-tests',ef],['--clock-max-work','0'],['--time-max-work','0'],['--test-max-work','0'],['--schedule-max-work','0']]:validator.validate(call([*absent,'--assess-tests',ef,*extra],2))
 for stage in ['--plan-tests','--schedule-tests','--time-tests']:a=absent[:];a.remove(stage);validator.validate(call([*a,'--assess-tests',ef],2))
 invalid=copy.deepcopy(expect);invalid['domains'][0]['sources'][0]['edge']='both';validator.validate(call([*absent,'--assess-tests',file('bad.json',invalid)],2));validator.validate(call([*absent,'--assess-tests','/missing-expectations.json'],2))
 mutations=[]
 for key in ['source','clocks','domains','check','clockLimits','assessment']:x=copy.deepcopy(d);x.pop(key);mutations.append(x)
 for key,value in [('verdict','unknown'),('verdict','fail'),('complete',False),('pendingInstances',-1),('reasons',['clock_mismatch'])]:x=copy.deepcopy(d);x['assessment'][key]=value;mutations.append(x)
 for key,value in [('status','other'),('macro',-1),('clockCheck','0'),('issues',['test_pending'])]:x=copy.deepcopy(d);x['assessment']['rows'][0][key]=value;mutations.append(x)
 x=copy.deepcopy(d);x['assessment']['rows'][0].pop('clockCheck');mutations.append(x)
 for x in mutations:assert not validator.is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(mutations),equivalences=equivalences,out=str(OUT))))
finally:(OUT/'commands.json').write_text(json.dumps(calls,indent=2))
