"""Public macro consumer: original pin bindings, structural clocks, and strict boundaries."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1]
resources=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text())]
schema=json.loads((ROOT/'memory/macro-interfaces.schema.json').read_text());Draft202012Validator.check_schema(schema)
v=Draft202012Validator(schema,registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in resources))
OUT=Path(tempfile.mkdtemp(prefix='hier-macro-interfaces-cli-'));records=[]
BASE=['--top','macro_top','--scope','macro_top','--recursive','--definition','ram_model','--clock-pin','CLK',str(ROOT/'tests/macro-interfaces.sv')]
def call(args,code=0):
 cmd=[BIN,*args];r=subprocess.run(cmd,capture_output=True,timeout=40);i=len(records)
 (OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr)
 records.append(dict(argv=[x.decode('utf8','backslashreplace') if isinstance(x,bytes) else x for x in cmd],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(records,indent=2))
 assert r.returncode==code,(cmd,r.stdout,r.stderr);d=json.loads(r.stdout.decode('utf8'));v.validate(d)
 if 'macros' in d:
  for m in d['macros']:
   owner=d['catalog']['instances'][m['instance']]['info']
   for p in m['pins']:
    assert p['object']['inst']==owner['ref'] and p['object']['ref']==p['port']['ref']
    for b in p['bindings']:assert b['inst']==owner['ref'] and b['pin']==p['port']['ref'] and b['port']==p['port']['name']
 return d
try:
 full=call([*BASE,'--require-complete']);assert full['complete'] and len(full['macros'])==7
 assert sum(len(m['pins']) for m in full['macros'])==21
 for m in full['macros']:
  assert [p['port']['name'] for p in m['pins']]==['CLK','D','Q']
  assert [p['port']['width'] for p in m['pins']]==[1,4,4]
  assert [p['port']['direction'] for p in m['pins']]==['in','in','out']
  assert all(len(p['bindings'])==1 for p in m['pins']) and 'clock' in m['pins'][0]
  assert all('clock' not in p for p in m['pins'][1:])
  path=full['catalog']['instances'][m['instance']]['info']['pathText']
  segments={p['port']['name']:p['bindings'][0]['segments'] for p in m['pins']}
  if path=='macro_top.\\ram.dot ':
   assert segments['CLK']==[{'pinBits':{'lsb':0,'width':1},'target':{'kind':'const','value':"1'b0"}}]
   assert segments['D']==[{'pinBits':{'lsb':0,'width':4},'target':{'kind':'const','value':"4'b0101"}}]
   assert segments['Q']==[{'pinBits':{'lsb':0,'width':4},'target':{'kind':'unconnected'}}]
  if path in ('macro_top.left.b','macro_top.right.b'):
   # RTL {d[0],d[1],d[2],d[3]} maps least-significant pin bit to d[3].
   assert [(s['pinBits'],s['target']['kind'],s['target']['bits']) for s in segments['D']]==[({'lsb':i,'width':1},'signal',{'lsb':3-i,'width':1}) for i in range(4)]
   assert len({s['target']['signal'] for s in segments['D']})==1
   assert segments['Q'][0]['pinBits']=={'lsb':0,'width':4} and segments['Q'][0]['target']['bits']=={'lsb':4,'width':4}
 multiple=call([*BASE,'--definition','macro_bank','--require-complete'],4)
 assert len(multiple['macros'])==9 and sum(bool(m['missingClockPins']) for m in multiple['macros'])==2
 for size in ['1','2','2000']:
  page=call([*BASE,'--page-size',size,'--require-complete']);assert page['macros']==full['macros']
 exact=call([*BASE,'--max-macros','7','--max-pins','21','--max-bindings','21','--max-queries',str(full['queries']),'--max-work',str(full['work']),'--max-trace-nodes',str(full['traceNodes']),'--max-trace-edges',str(full['traceEdges']),'--require-complete']);assert exact['macros']==full['macros']
 for flag in ['macros','pins','bindings','queries','work','trace-nodes','trace-edges','instances']:
  cut=call([*BASE,'--max-'+flag,'1','--require-complete'],4);assert not cut['complete'] and cut['reasons']
  # Complete macro rows only, with original owner indices.
  for i,m in enumerate(cut['macros']):assert len(m['pins'])==3 and m['instance']==full['macros'][i]['instance']
 missing=call([*BASE,'--clock-pin','MISSING','--require-complete'],4)
 assert len(missing['macros'])==7 and all(m['missingClockPins']==['MISSING'] for m in missing['macros'])
 args=['--top','macro_top','--scope','macro_top.left.a','--definition','ram_model','--clock-pin','CLK',str(ROOT/'tests/macro-interfaces.sv')]
 sub=call([*args,'--require-complete']);assert len(sub['macros'])==1 and sub['macros'][0]['parent']['pathText']=='macro_top.left'
 empty=call(['--top','macro_top','--scope','macro_top','--definition','RAM','--recursive',str(ROOT/'tests/macro-interfaces.sv'),'--require-complete']);assert empty['complete'] and not empty['macros']
 root=call(['--top','macro_top','--scope','macro_top','--definition','macro_top','--clock-pin','CLK',str(ROOT/'tests/macro-interfaces.sv'),'--require-complete']);assert len(root['macros'])==1 and 'parent' not in root['macros'][0]
 logic=call(['--top','macro_logic','--scope','macro_logic','--recursive','--definition','ram_model','--clock-pin','CLK',str(ROOT/'tests/macro-interfaces.sv'),'--require-complete'],4);assert 'clock_boundary' in logic['reasons'] and logic['macros'][0]['pins'][0]['clock']['result']['nodes']
 opaque=call(['--top','macro_top','--scope','macro_top','--recursive','--definition','unknown_ram',str(ROOT/'tests/macro-interfaces.sv')]);assert len(opaque['macros'])==1 and opaque['catalog']['instances'][opaque['macros'][0]['instance']]['info']['kind']=='blackbox'
 mixed=call(['--top','macro_mixed','--scope','macro_mixed','--recursive','--definition','ram_model','--clock-pin','CLK',str(ROOT/'tests/macro-interfaces.sv'),'--require-complete'],4);assert 'clock_trace_partial' in mixed['reasons'] and any(x['reason']=='blackbox' for x in mixed['macros'][0]['pins'][0]['clock']['result']['frontier'])
 for extra in [['--definition','ram_model'],['--clock-pin','CLK'],['--definition',''],['--clock-pin',b'\xff'],['--max-work','0'],['--max-catalog-queries','2'],['--max-depth','1025'],['--max-trace-nodes','1000001'],['--max-pins','x'],['--scope','macro_top'],['--unknown','x']]:
  assert call([*BASE,*extra],2)['error']['code']=='invalid_arguments'
 call(['--top','macro_top','--scope','macro_top',str(ROOT/'tests/macro-interfaces.sv')],2)
 call(['--top','macro_top','--scope','missing','--definition','ram_model',str(ROOT/'tests/macro-interfaces.sv')],3)
 call(['--top','macro_top','--scope','macro_top.CLK','--definition','ram_model',str(ROOT/'tests/macro-interfaces.sv')],2)
 call(['--top','macro_top','--scope','macro_top','--definition','ram_model','--max-queries','0','/missing.sv'],2)
 for n in range(4):
  bad=copy.deepcopy(full)
  if n==0:bad['extra']=True
  if n==1:bad['macros'][0]['extra']=True
  if n==2:del bad['macros'][0]['parentStatus']
  if n==3:bad['macros'][0]['pins'][0]['clock']['extra']=True
  assert not v.is_valid(bad)
 print(json.dumps(dict(calls=len(records),schemaNegativeCases=4,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
