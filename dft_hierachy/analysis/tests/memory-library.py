"""Author oracle for explicit external-library inputs; no model-to-library inference."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-library-cli-'));records=[]
resources=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads((ROOT/f).read_text()) for f in ['objects/object-catalog.schema.json','memory/macro-interfaces.schema.json','memory/memory-map.schema.json']]]
schema=json.loads((ROOT/'memory/library-memory.schema.json').read_text());Draft202012Validator.check_schema(schema)
v=Draft202012Validator(schema,registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in resources))
BASE=['--top','library_top','--scope','library_top.named',str(ROOT/'tests/memory-library.sv')]
PINS=[('CLK','in','1'),('A','in','3'),('D','in','8'),('Q','out','8')]
ROLES=[('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none')]
MODEL=['--model','missing_ram','8','8',*[x for r,p,s in ROLES for x in ['--role','missing_ram',r,p,s]]]
def pins(definition='missing_ram',entries=PINS):return [x for pin,d,w in entries for x in ['--library-pin',definition,pin,d,w]]
LIB=['--library-source','fixture-v1',*pins()]
def call(args,expected=0):
 cmd=[BIN,*args];r=subprocess.run(cmd,capture_output=True,timeout=45);i=len(records)
 (OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr)
 records.append(dict(argv=[x.decode('utf8','backslashreplace') if isinstance(x,bytes) else x for x in cmd],exit=r.returncode,expectedExit=expected));(OUT/'commands.json').write_text(json.dumps(records,indent=2))
 assert r.returncode==expected,(cmd,r.stdout,r.stderr);d=json.loads(r.stdout);v.validate(d)
 if 'library' in d:
  lib=d['library'];assert [x['definitionName'] for x in lib['cells']]==sorted(x['definitionName'] for x in lib['cells'])
  assert all(x['cell']['attrs']['dft.library.source']==lib['source'] for x in lib['cells'])
 return d
try:
 full=call([*BASE,*LIB,*MODEL]);a=full['analysis'];assert a['mapping']['matchedInstances']==1 and a['mapping']['matchedCapacityBits']==64
 source=a['interfaces'];assert not source['catalog']['snapshot']['inputHashComplete'];h=source['catalog']['snapshot']['inputHash']
 assert [(p['name'],p['direction'],str(p['width'])) for p in full['library']['cells'][0]['cell']['pins']]==PINS
 macro=call([*BASE,*LIB,'--definition','missing_ram']);assert macro['analysis']['algorithm']=='rtl-macro-interfaces-v1'
 # Derived completeness, not the matched count, determines strict exit.
 call([*BASE,*LIB,*MODEL,'--require-complete'],0 if a['mapping']['complete'] else 4)
 for scope in ['library_top.positional','library_top.hole','library_top.extra']:
  base=BASE.copy();base[3]=scope;d=call([*base,*LIB,*MODEL]);m=d['analysis']['mapping'];assert m['matchedInstances']==(0 if scope.endswith('extra') else 1)
  if scope.endswith('hole'):assert d['analysis']['interfaces']['macros'][0]['pins'][1]['bindings'][0]['segments'][0]['target']['kind']=='unconnected'
 reordered=call([*BASE,*pins(),'--library-source','fixture-v1',*MODEL]);assert reordered['analysis']['interfaces']['catalog']['snapshot']['inputHash']==h
 for entries in [[('CLK','in','1'),('A','in','4'),*PINS[2:]],[*PINS[:3],('Q','unknown','8')],PINS[:3]]:
  d=call([*BASE,'--library-source','changed',*pins(entries=entries),*MODEL,'--require-complete'],4);assert d['analysis']['mapping']['matchedInstances']==0
  assert d['analysis']['interfaces']['catalog']['snapshot']['inputHash']!=h
 # Swapping equal-width pins changes positional connectivity, even though name matching still succeeds.
 swapped=[*PINS[:2],PINS[3],PINS[2]];base=BASE.copy();base[3]='library_top.positional'
 d=call([*base,'--library-source','fixture-v1',*pins(entries=swapped),*MODEL]);ps=d['analysis']['interfaces']['macros'][0]['pins'];assert [p['port']['name'] for p in ps]==[p[0] for p in swapped]
 assert d['analysis']['interfaces']['catalog']['snapshot']['inputHash']!=h
 extra=call([*BASE,*LIB,*pins('unused'),*MODEL]);assert extra['analysis']['interfaces']['catalog']['snapshot']['inputHash']==h and len(extra['library']['cells'])==2
 sourceChanged=call([*BASE,'--library-source','revision2',*pins(),*MODEL]);assert sourceChanged['analysis']['interfaces']['catalog']['snapshot']['inputHash']!=h
 base=BASE.copy();base[3]='library_top.known'
 known=call([*base,'--library-source','fixture-v1',*pins('known_ram',[('wrong','out','99')]),'--definition','known_ram']);assert [p['port']['name'] for p in known['analysis']['macros'][0]['pins']]==['CLK','A','D','Q']
 for args in [['--library-source','x'],pins(),['--library-source',''],['--library-source',b'\xff',*pins()],['--library-source','x',*pins(entries=[('A','input','3')])],['--library-source','x',*pins(entries=[('A','in','0')])],['--library-source','x',*pins(entries=[('A','in','65537')])],['--library-source','x',*pins(entries=[('A','in','-1')])],['--library-source','x',*pins(entries=[('A','in','x')])],['--library-source','x',*pins(entries=[('','in','3')])],['--library-source','x',*pins(entries=[(b'\xff','in','3')])],[*LIB,*pins(entries=[PINS[0]])],[*LIB,'--library-source','dup'],['--library-pin','missing_ram','A']]:
  call([*BASE,*MODEL,*args],2)
 missing=BASE.copy();missing[-1]='/missing.sv';call([*missing,*MODEL,'--library-source','x',*pins(entries=[('A','in','0')])],2)
 for i in range(8):
  bad=copy.deepcopy(full)
  if i==0:bad['extra']=1
  if i==1:bad['library']['extra']=1
  if i==2:bad['library']['cells'][0]['cell']['pins'][0]['direction']='input'
  if i==3:bad['library']['cells'][0]['cell']['pins'][0]['width']=0
  if i==4:del bad['library']['cells'][0]['cell']['attrs']['dft.library.source']
  if i==5:bad['analysis']['mapping']['memories'][0]['roles'][0]['extra']=1
  if i==6:bad['analysis']={'formatVersion':1,'error':{'code':'invalid_arguments','message':'x'}}
  if i==7:bad['library']['source']=''
  assert not v.is_valid(bad)
 print(json.dumps(dict(calls=len(records),schemaNegativeCases=8,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
