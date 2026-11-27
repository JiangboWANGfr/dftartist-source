"""Actual RTL, named config inputs and shared-source assessment comparison."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-assessment-comparison-cli-'));calls=[];equivalences=0
schemas=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads(f.read_text()) for f in ROOT.glob('**/*.schema.json')]]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
schema=json.loads((ROOT/'memory/memory-test-assessment-comparison.schema.json').read_text());Draft202012Validator.check_schema(schema);validator=Draft202012Validator(schema,registry=registry)
def file(name,value):p=OUT/name;p.write_text(json.dumps(value,indent=2));return str(p)
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(i,r.stdout,r.stderr);return json.loads(r.stdout)
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
lib=json.loads((ROOT/'tests/memory-clock-library.json').read_text());lib['testProfiles']=[dict(definitionName=m['definitionName'],operationsPerWord=2,powerMicrowatts=10) for m in lib['models']];library=file('library.json',lib)
base=['--top','domain_resolved','--scope','domain_resolved','--recursive',str(ROOT/'tests/memory-clock-sources.sv'),str(ROOT/'tests/memory-test-domains.sv'),'--memory-library',library,'--plan-tests','--schedule-tests','--time-tests']
config=dict(formatVersion=1,kind='memory-test-config',rules=[dict(path=['domain_resolved'],recursive=True,clockDomain='D',partition='')],timing=dict(clocks=[dict(clockDomain='D',periodPicoseconds=1000)],policy=dict(waveOverheadPicoseconds=7)))
cf=file('config.json',config);sources=[dict(path='domain_resolved.clk',bit=0,edge='posedge'),dict(path='domain_resolved.clk',bit=1,edge='posedge'),dict(path='domain_resolved.clk',bit=0,edge='negedge')]
expect=dict(formatVersion=1,kind='memory-clock-expectations',domains=[dict(clockDomain='D',sources=sources)]);ef=file('expect.json',expect)
limited=copy.deepcopy(expect);limited['domains'][0]['sources']=sources[:1];lf=file('limited.json',limited);empty=file('empty.json',dict(formatVersion=1,kind='memory-clock-expectations',domains=[]))
def run(configs,expects,args=base,code=0,clock=(),require=True):
 global equivalences
 cargs=[v for name,f in configs for v in ['--compare-test-config',name,f]];eargs=[v for name,f in expects for v in ['--compare-clock-expectations',name,f]]
 d=call([*args,*cargs,*eargs,*clock,*(['--require-complete'] if require else [])],code);validator.validate(d)
 original=call([*args,*cargs]);assert clean(original)==clean(d['source']);equivalences+=1
 assert len(d['configurations'])==len(d['rows'])==len(configs);assert d['complete']==all(v['assessment']['complete'] for v in d['configurations'])
 for i,(name,f) in enumerate(configs):
  v=d['configurations'][i];a=v['assessment'];row=d['rows'][i];reference=d['configurations'][0]['assessment'];assert row['comparable']==(reference['complete'] and a['complete']);assert ('delta' in row)==row['comparable'];assert len(row['transitions'])==len(a['rows'])
  for j,t in enumerate(row['transitions']):assert t==dict(macro=j,referenceStatus=reference['rows'][j]['status'],status=a['rows'][j]['status'])
  if row['comparable']:assert row['delta']=={k:a[k]-reference[k] for k in ['satisfiedInstances','blockedInstances','pendingInstances']}
  single=call([*args,'--test-config',f,'--assess-tests',dict(expects)[name],*clock]);restored=dict(formatVersion=1,algorithm='rtl-memory-test-assessment-v1',source=dict(formatVersion=1,algorithm='rtl-memory-test-coverage-v1',source=d['source']['configurations'][i]['report'],coverage=v['coverage']),clockLimits=d['clockLimits'],clocks=d['clocks'],domains=v['domains'],check=v['check'],assessment=a)
  assert clean(single)==clean(restored);equivalences+=1
 return d
try:
 cases=[('base',cf),('candidate',cf)];allok=[('base',ef),('candidate',ef)];mixed=[('candidate',lf),('base',ef)]
 d=run(cases,allok);assert d['complete'] and d['configurations'][1]['assessment']['satisfiedInstances']==6
 x=run(cases,mixed);assert x['rows'][1]['delta']==dict(satisfiedInstances=-2,blockedInstances=2,pendingInstances=0) and x['configurations'][1]['assessment']['verdict']=='fail'
 x=run(cases,[('base',lf),('candidate',ef)]);assert x['rows'][1]['delta']['satisfiedInstances']==2
 x=run(cases,[('base',ef),('candidate',empty)],code=4);assert x['source']['complete'] and not x['rows'][1]['comparable'] and x['rows'][0]['comparable']
 x=run(cases,[('base',empty),('candidate',ef)],code=4);assert all(not v['comparable'] for v in x['rows'])
 x=run(cases,allok,clock=['--clock-max-work','1'],code=4);assert all(v['assessment']['pendingInstances']==6 for v in x['configurations'])
 run(cases,mixed,clock=['--clock-max-depth','1'],code=4)
 x=run(cases,allok,args=[*base,'--map-max-macros','2'],code=4);assert len(x['rows'][1]['transitions'])==6 and x['configurations'][1]['assessment']['pendingInstances']==4
 for label,section,limits in [('planning','planning',dict(maxWork=1)),('timing','timing',dict(maxWork=1)),('scheduling','scheduling',dict(maxWaves=1))]:
  cfg=copy.deepcopy(config);cfg.setdefault(section,{})['limits']=limits;run([('base',cf),('candidate',file(label+'.json',cfg))],mixed,code=4)
 cfg=copy.deepcopy(config);cfg['timing']['clocks'][0]['periodPicoseconds']=100;fast=file('fast.json',cfg);x=run([('base',cf),('candidate',fast)],allok);assert x['source']['rows'][1]['delta']['durationPicoseconds']==-28800 and x['rows'][1]['delta']['satisfiedInstances']==0
 cfg=copy.deepcopy(config);cfg['planning']=dict(policy=dict(maxPowerMicrowatts=1));blocked=file('blocked.json',cfg);x=run([('base',cf),('candidate',blocked)],mixed,code=4);assert x['configurations'][1]['assessment']['blockedInstances']==6
 cfg=copy.deepcopy(config);cfg.pop('rules');cfg['assignments']=[dict(instancePath='domain_resolved.'+n,clockDomain='D',partition='') for n in ['direct0','direct1','inverted','double_inv','neg_inv','branch.nested']];run([('base',cf),('candidate',file('explicit.json',cfg))],allok)
 unseen=base[:];unseen.remove('--recursive');run(cases,[('base',empty),('candidate',empty)],args=unseen)
 extra=copy.deepcopy(expect);extra['domains'].append(dict(clockDomain='unused',sources=sources));run(cases,[('base',ef),('candidate',file('unused.json',extra))],code=4)
 run(cases,[('base',ef),('candidate',empty)],code=0,require=False)
 run([(str(i),cf) for i in range(8)],[(str(i),ef) for i in reversed(range(8))])
 absent=base[:];absent[5]='/absent-assessment-comparison.sv';cargs=[v for n,f in cases for v in ['--compare-test-config',n,f]];eargs=[v for n,f in allok for v in ['--compare-clock-expectations',n,f]]
 def bad(args):validator.validate(call([*absent,*args],2))
 bad(eargs);bad([*cargs,'--compare-clock-expectations','base',ef]);bad([*cargs,*eargs,'--compare-clock-expectations','base',ef]);bad([*cargs,'--compare-clock-expectations','base',ef,'--compare-clock-expectations','other',ef]);bad([*cargs,*eargs,'--compare-clock-expectations','other',ef])
 for extra in [['--assess-tests',ef],['--check-test-clocks',ef],['--test-coverage'],['--inspect-test-domains'],['--clock-sources'],['--test-config',cf],['--clock-max-work','0'],['--time-max-work','1'],['--test-instance','x','D','']]:bad([*cargs,*eargs,*extra])
 for stage in ['--plan-tests','--schedule-tests','--time-tests']:
  a=absent[:];a.remove(stage);validator.validate(call([*a,*cargs,*eargs],2))
 bad([*cargs,'--compare-clock-expectations','base',ef,'--compare-clock-expectations','candidate','/missing-expectations.json'])
 malformed=copy.deepcopy(expect);malformed['domains'][0]['sources'][0]['bit']=-1;bad([*cargs,'--compare-clock-expectations','base',ef,'--compare-clock-expectations','candidate',file('bad.json',malformed)])
 bad([*cargs,*[v for i in range(9) for v in ['--compare-clock-expectations',str(i),ef]]])
 mutations=[]
 for k in ['source','clocks','clockLimits','configurations','rows']:x=copy.deepcopy(d);x.pop(k);mutations.append(x)
 for k,v in [('reference',1),('complete','true'),('configurations',[]),('rows',[])]:x=copy.deepcopy(d);x[k]=v;mutations.append(x)
 for k,v in [('comparable',False),('delta',dict(satisfiedInstances=0.5,blockedInstances=0,pendingInstances=0))]:x=copy.deepcopy(d);x['rows'][0][k]=v;mutations.append(x)
 x=copy.deepcopy(d);x['rows'][0].pop('delta');mutations.append(x)
 for k,v in [('macro',-1),('referenceStatus','unknown'),('status','bad')]:x=copy.deepcopy(d);x['rows'][0]['transitions'][0][k]=v;mutations.append(x)
 x=copy.deepcopy(d);x['configurations'][0]['assessment']['surprise']=1;mutations.append(x)
 for x in mutations:assert not validator.is_valid(x)
 print(json.dumps(dict(calls=len(calls),schemaNegative=len(mutations),equivalences=equivalences,out=str(OUT))))
finally:(OUT/'commands.json').write_text(json.dumps(calls,indent=2))
