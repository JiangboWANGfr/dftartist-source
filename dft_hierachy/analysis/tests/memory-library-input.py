"""Versioned memory library files, direct-argument parity and pre-open rejection."""
import copy,json,os,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-library-input-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]};inputValidator=Draft202012Validator(json.loads((ROOT/'memory/input/memory-library.schema.json').read_text()))
config=json.loads((ROOT/'tests/memory-library-input.json').read_text());inputValidator.validate(config)
base=['--top','plan_top','--scope','plan_top','--recursive',str(ROOT/'tests/memory-test-plan.sv')]
assign=[x for n in ['a0','b0','c0','d0','e0','f0','g0','h0','x0'] for x in ['--test-instance','plan_top.'+n,'other' if n=='d0' else 'clk','separate' if n=='e0' else '']]
policy=['--test-max-controller-memories','3','--test-max-parallel','3','--test-max-power','250000']
def direct(c,plan=False):
 a=[]
 for m in c['models']:
  a+=['--model',m['definitionName'],str(m['words']),str(m['dataBits']),'--mask-lane',m['definitionName'],str(m.get('maskLaneBits',1))]
  for r in m['roles']:a+=['--role',m['definitionName'],r['role'],r['pin'],r['sense']]
 if 'library' in c:
  a+=['--library-source',c['library']['source']]
  for cell in c['library']['cells']:
   for p in cell['cell']['pins']:a+=['--library-pin',cell['definitionName'],p['name'],p['direction'],str(p['width'])]
 if plan:
  for p in c.get('testProfiles',[]):a+=['--test-profile',p['definitionName'],str(p['operationsPerWord']),str(p['powerMicrowatts'])]
 return a
def file(c,name='library.json'):
 p=OUT/name;p.write_text(json.dumps(c,ensure_ascii=False));return str(p)
def clean(d):
 if isinstance(d,dict):return {k:clean(v) for k,v in d.items() if k not in ['snapshotId','openedAt']}
 if isinstance(d,list):return list(map(clean,d))
 return d
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-memory-map-v1')].validate(d);return d
try:
 path=file(config,'models and costs 库.json')
 raw=call([*base,*direct(config)]);loaded=call([*base,'--memory-library',path]);assert clean(raw)==clean(loaded)
 planned=call([*base,*direct(config,True),'--plan-tests',*assign,*policy,'--require-complete'],4);p=call([*base,'--memory-library',path,'--plan-tests',*assign,*policy,'--require-complete'],4);assert clean(planned)==clean(p) and p['plan']['scheduledInstances']==8
 for opts in [['--map-max-macros','2'],['--max-macros','2'],['--test-max-work','2'],['--test-max-controllers','1'],['--clock-pin','CLK']]:
  p=call([*base,'--memory-library',path,'--plan-tests',*assign,*policy,*opts,'--require-complete'],4);q=call([*base,*direct(config,True),'--plan-tests',*assign,*policy,*opts,'--require-complete'],4);assert clean(p)==clean(q)
 # Blackbox named/positional/hole behavior uses independently declared library pins.
 black=copy.deepcopy(config);black['models']=black['models'][:1];black['models'][0]['definitionName']='missing_ram';black['testProfiles']=[dict(definitionName='missing_ram',operationsPerWord=10,powerMicrowatts=1000)]
 pins=[dict(name=n,direction=d,width=w) for n,d,w in [('CLK','in',1),('A','in',3),('D','in',8),('Q','out',8)]]
 black['library']=dict(source='explicit pins 库',cells=[dict(definitionName='missing_ram',cell=dict(pins=pins))]);inputValidator.validate(black)
 bb=['--top','library_top','--scope','library_top.positional',str(ROOT/'tests/memory-library.sv')];bp=file(black,'blackbox.json')
 original=call([*bb,*direct(black)]);loaded=call([*bb,'--memory-library',bp]);assert clean(original)==clean(loaded) and loaded['analysis']['mapping']['matchedInstances']==1
 loaded=call([*bb,'--memory-library',bp,'--plan-tests','--test-instance','library_top.positional','clk','']);assert loaded['plan']['scheduledInstances']==1
 attrs=copy.deepcopy(black);attrs['library']['cells'][0]['cell']['attrs']={'vendor':'explicit\nname'};attrs['library']['cells'][0]['cell']['pins'][0]['attrs']={'doc':'clock'};inputValidator.validate(attrs)
 emptyAttrs=copy.deepcopy(black);emptyAttrs['library']['cells'][0]['cell']['attrs']={};inputValidator.validate(emptyAttrs);assert clean(call([*bb,'--memory-library',file(emptyAttrs,'empty-attrs.json')]))==clean(original)
 loaded=call([*bb,'--memory-library',file(attrs,'attrs.json')]);c=loaded['library']['cells'][0]['cell'];assert c['attrs']['vendor']=='explicit\nname' and c['pins'][0]['attrs']=={'doc':'clock'} and c['attrs']['dft.library.source']==attrs['library']['source']
 assert loaded['analysis']['interfaces']['catalog']['snapshot']['inputHash']!=original['analysis']['interfaces']['catalog']['snapshot']['inputHash']
 # Map-only files need no costs; requesting planning is still explicit and validated.
 noCost=copy.deepcopy(config);noCost.pop('testProfiles');np=file(noCost,'no-costs.json');assert clean(call([*base,'--memory-library',np]))==clean(raw)
 assert call([*base,'--memory-library',np,'--plan-tests'],2)['error']['code']=='invalid_arguments'
 # Decimal JSON integers and Unicode escapes follow the shared exact decoder.
 decimal=OUT/'decimal.json';decimal.write_text(json.dumps(config).replace('"words": 8','"words": 8.0').replace('"operationsPerWord": 2','"operationsPerWord": 2e0'));assert clean(call([*base,'--memory-library',str(decimal)]))==clean(raw)
 linked=OUT/'link.json';linked.symlink_to(path);assert clean(call([*base,'--memory-library',str(linked)]))==clean(raw)
 # Files and bad declarations reject before an intentionally missing RTL input.
 missing=['--top','plan_top','--scope','plan_top','/missing-input-before-library.sv'];negative=[]
 variants=[]
 for fn in [lambda x:x.update(extra=1),lambda x:x.update(formatVersion=2),lambda x:x.update(kind='other'),lambda x:x.update(models=[]),lambda x:x['models'][0].update(words='8'),lambda x:x['models'][0].update(words=True),lambda x:x['models'][0].update(dataBits=65537),lambda x:x['models'][0]['roles'][0].update(sense='none'),lambda x:x['models'][0]['roles'][0].update(pin='\x00'),lambda x:x['models'].append(copy.deepcopy(x['models'][0])),lambda x:x['testProfiles'][0].update(powerMicrowatts=0),lambda x:x['testProfiles'][0].update(definitionName='not-modeled'),lambda x:x['testProfiles'].pop()]:
  bad=copy.deepcopy(config);fn(bad);variants.append(bad)
 for fn in [lambda x:x['library']['cells'][0]['cell'].update(attrs={'dft.library.source':'forged'}),lambda x:x['library']['cells'][0]['cell']['pins'][0].update(direction='bad'),lambda x:x['library']['cells'][0]['cell']['pins'][0].update(width=None),lambda x:x['library']['cells'].append(copy.deepcopy(x['library']['cells'][0]))]:
  bad=copy.deepcopy(black);fn(bad);variants.append(bad)
 for i,bad in enumerate(variants):
  f=file(bad,f'bad-{i}.json');d=call([*missing,'--memory-library',f],2);assert d['error']['code']=='invalid_arguments' and d['error']['message']!='invalid design inputs or options';negative.append(dict(document=bad,schemaRejected=not inputValidator.is_valid(bad)))
 rawBad=[b'[]',b'{',json.dumps(config).encode()+b'x',b'{"n":0,"\\u006e":1}',b'{"bad":"\\uD800"}',json.dumps(config).encode()+b'\xff',b'{"n":'+b'['*128+b'0'+b']'*128+b'}',json.dumps(config).encode().replace(b'"words": 8',b'"words": 8.0000000000000001')]
 for i,rawbytes in enumerate(rawBad):
  f=OUT/f'raw-{i}.json';f.write_bytes(rawbytes);d=call([*missing,'--memory-library',str(f)],2);assert d['error']['message']!='invalid design inputs or options'
 capped=OUT/'cap.json';body=json.dumps(config).encode();capped.write_bytes(body+b' '*(1048576-len(body)));assert clean(call([*base,'--memory-library',str(capped)]))==clean(raw);capped.write_bytes(capped.read_bytes()+b' ');assert '1 MiB' in call([*missing,'--memory-library',str(capped)],2)['error']['message']
 fifo=OUT/'input.fifo';os.mkfifo(fifo)
 for f in [str(OUT),str(OUT/'absent.json'),str(fifo),'']:
  d=call([*missing,'--memory-library',f],2);assert d['error']['message']!='invalid design inputs or options'
 for flags in [['--definition','plan_ram'],['--model','x','8','8'],['--role','x','clock','CLK','posedge'],['--mask-lane','x','1'],['--library-source','label'],['--library-pin','x','CLK','in','1'],['--test-profile','x','1','1']]:
  d=call([*base,'--memory-library',path,*flags],2);assert 'Do not combine' in d['error']['message']
 assert call([*base,'--memory-library',path,'--memory-library',path],2)['error']['code']=='invalid_arguments'
 assert call([*base,'--memory-library',path,'--test-max-work','1'],2)['error']['code']=='invalid_arguments'
 (OUT/'schema-negative.json').write_text(json.dumps(negative,indent=2));print(json.dumps(dict(calls=len(calls),schemaNegative=sum(x['schemaRejected'] for x in negative),semanticOnlyNegative=sum(not x['schemaRejected'] for x in negative),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
