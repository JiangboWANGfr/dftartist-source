"""Rules → real hierarchy → original explicit planning, strict input/output checks."""
import copy,json,os,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-test-rules-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]};iv=Draft202012Validator(json.loads((ROOT/'memory/input/memory-test-rules.schema.json').read_text()))
config=json.loads((ROOT/'tests/memory-test-rules.json').read_text());iv.validate(config)
roles=[dict(role=r,pin=p,sense=s) for r,p,s in [('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none')]]
lib=dict(formatVersion=1,kind='memory-library',models=[dict(definitionName='rule_ram',words=8,dataBits=8,roles=roles)],testProfiles=[dict(definitionName='rule_ram',operationsPerWord=2,powerMicrowatts=100000)])
def file(d,name):
 p=OUT/name;p.write_text(json.dumps(d,ensure_ascii=False));return str(p)
library=file(lib,'models.json');base=['--top','rule_top','--scope','rule_top','--recursive',str(ROOT/'tests/memory-test-rules.sv'),'--memory-library',library,'--plan-tests']
def clean(x):
 if isinstance(x,dict):return {k:clean(v) for k,v in x.items() if k not in ['snapshotId','openedAt']}
 if isinstance(x,list):return list(map(clean,x))
 return x
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=40);i=len(calls);(OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-test-rules-v1')].validate(d);return d
def winner(path,rules):
 matches=[(len(r['path']),not r['recursive'],i) for i,r in enumerate(rules) if path[:len(r['path'])]==r['path'] and (r['recursive'] or len(path)==len(r['path']))]
 return max(matches)[2] if matches else None
def verify(d,rules,args):
 assert d['rules']==rules;report=d['report'];facts=report['investigation'];manual=[];used=set();expected=[]
 for i,m in enumerate(facts['mapping']['memories']):
  inst=facts['interfaces']['catalog']['instances'][facts['interfaces']['macros'][m['macro']]['instance']]['info'];which=winner(inst['path'],rules);choice=dict(memory=i)
  if which is not None:
   rule=rules[which];choice.update(rule=which,assignment=len(expected));expected.append(dict(instancePath=inst['pathText'],clockDomain=rule['clockDomain'],partition=rule['partition']));used.add(which);manual+=['--test-instance',inst['pathText'],rule['clockDomain'],rule['partition']]
  assert d['choices'][i]==choice
 assert report['plan']['request']['assignments']==expected and d['unusedRules']==[i for i in range(len(rules)) if i not in used]
 assert clean(call([*args,*manual,'--require-complete'],0 if report['plan']['complete'] else 4))==clean(report)
try:
 cases=[config,{**config,'rules':list(reversed(config['rules']))},{**config,'rules':[dict(path=['absent'],recursive=True,clockDomain='unused',partition='')]}]
 same=copy.deepcopy(config);same['rules']+=[dict(path=['rule_top','left','ram'],recursive=True,clockDomain='shadowed',partition='')];cases.append(same)
 for i,c in enumerate(cases):
  iv.validate(c);d=call([*base,'--test-rules',file(c,f'rules-{i}.json'),'--require-complete'],4 if i==2 else 0);verify(d,c['rules'],base)
  if i==0:original=d;assert d['report']['plan']['scheduledInstances']==8 and len(d['report']['plan']['controllers'])==5
 rp=file(config,'rules.json')
 for flags in [['--test-max-work','2'],['--test-max-controllers','1'],['--max-macros','2'],['--map-max-macros','2'],['--test-max-power','99999']]:
  d=call([*base,'--test-rules',rp,*flags,'--require-complete'],4);verify(d,config['rules'],[*base,*flags])
 sub=base.copy();sub[sub.index('--scope')+1]='rule_top.left';d=call([*sub,'--test-rules',rp]);verify(d,config['rules'],sub);assert len(d['choices'])==2
 empty=base.copy();empty.remove('--recursive');d=call([*empty,'--test-rules',rp]);verify(d,config['rules'],empty);assert d['choices']==[] and d['unusedRules']==list(range(5))
 # Independent pin-library mode and unmatched width retain original planner rules.
 bb=copy.deepcopy(lib);bb['models'][0]['definitionName']='missing_ram';bb['testProfiles'][0]['definitionName']='missing_ram';bb['library']=dict(source='rule-file-explicit',cells=[dict(definitionName='missing_ram',cell=dict(pins=[dict(name=p['pin'],direction='out' if p['role']=='data_out' else 'in',width=1 if p['role']=='clock' else 3 if p['role']=='address' else 8) for p in roles]))])
 bc=dict(formatVersion=1,kind='memory-test-rules',rules=[dict(path=['library_top'],recursive=True,clockDomain='explicit',partition='')]);ba=['--top','library_top','--scope','library_top.positional',str(ROOT/'tests/memory-library.sv'),'--memory-library',file(bb,'blackbox-library.json'),'--plan-tests']
 d=call([*ba,'--test-rules',file(bc,'blackbox-rules.json')]);verify(d,bc['rules'],ba);assert 'library' in d['report'] and d['report']['plan']['scheduledInstances']==1
 badWidth=copy.deepcopy(lib);badWidth['models'][0]['words']=16;badbase=base.copy();badbase[badbase.index('--memory-library')+1]=file(badWidth,'bad-width.json');d=call([*badbase,'--test-rules',rp,'--require-complete'],4);assert all(x['reason']=='interface_unmatched' for x in d['report']['plan']['memories']) and all('rule' in x for x in d['choices'])
 # Input failures occur before missing RTL, and preserve error envelope.
 invalid=[]
 for fn in [lambda x:x.update(extra=1),lambda x:x.update(formatVersion=2),lambda x:x.update(rules=[]),lambda x:x['rules'][0].update(path='rule_top'),lambda x:x['rules'][0].update(path=[]),lambda x:x['rules'][0].update(path=['']),lambda x:x['rules'][0].update(recursive=1),lambda x:x['rules'][0].update(clockDomain=''),lambda x:x['rules'][0].update(partition='\x00'),lambda x:x['rules'].append(copy.deepcopy(x['rules'][0])),lambda x:x['rules'][0].pop('partition')]:
  c=copy.deepcopy(config);fn(c);invalid.append(c)
 missing=base.copy();missing[missing.index(str(ROOT/'tests/memory-test-rules.sv'))]='/absent-before-rule-validation.sv'
 for i,c in enumerate(invalid):
  d=call([*missing,'--test-rules',file(c,f'invalid-{i}.json')],2);assert d['error']['message']!='invalid design inputs or options'
 raw=json.dumps(config).encode()
 for i,b in enumerate([raw+b'x',b'[]',raw+b'\xff',raw.replace(b'"recursive": true',b'"recursive":true,"recursiv\\u0065":true'),raw.replace(b'"default"',b'"\\uD800"'),raw.replace(b'"formatVersion": 1',b'"formatVersion": 1.0000000000000001')]):
  f=OUT/f'raw-{i}.json';f.write_bytes(b);call([*missing,'--test-rules',str(f)],2)
 cap=OUT/'cap.json';cap.write_bytes(raw+b' '*(1048576-len(raw)));d=call([*base,'--test-rules',str(cap)]);assert clean(d)==clean(original);cap.write_bytes(cap.read_bytes()+b' ');call([*missing,'--test-rules',str(cap)],2)
 symlink=OUT/'link.json';symlink.symlink_to(rp);assert clean(call([*base,'--test-rules',str(symlink)]))==clean(original)
 fifo=OUT/'input.fifo';os.mkfifo(fifo)
 for f in ['',str(OUT/'absent'),str(OUT),str(fifo)]:call([*missing,'--test-rules',f],2)
 call([*base,'--test-rules',rp,'--test-instance','rule_top.left.ram','x',''],2);call([*base,'--test-rules',rp,'--test-rules',rp],2);without=base.copy();without.remove('--plan-tests');call([*without,'--test-rules',rp],2)
 for key in ['choices','unusedRules','visitedSegments','report']:
  bad=copy.deepcopy(original);bad.pop(key);assert not validators['rtl-memory-test-rules-v1'].is_valid(bad)
 bad=copy.deepcopy(original);bad['choices'][0].pop('assignment');assert not validators['rtl-memory-test-rules-v1'].is_valid(bad)
 assert not validators['rtl-memory-test-plan-v1'].is_valid(original)
 print(json.dumps(dict(calls=len(calls),schemaNegative=6,inputShapeNegative=sum(not iv.is_valid(x) for x in invalid),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
