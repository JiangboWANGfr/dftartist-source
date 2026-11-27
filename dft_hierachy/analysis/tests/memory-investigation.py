"""Anonymous original facts and the shared investigation CLI path."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-investigation-cli-'));calls=[]
schemas=[json.loads(Path(sys.argv[2]).read_text()),json.loads((ROOT/'objects/object-catalog.schema.json').read_text()),*[json.loads(f.read_text()) for f in (ROOT/'memory').glob('*.schema.json')]]
reg=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas);validators={s['oneOf'][0]['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas[1:]}
base=['--top','library_top','--scope','library_top','--recursive',str(ROOT/'tests/memory-library.sv')]
def model(name):return ['--model',name,'8','8',*[x for r,p,s in [('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none')] for x in ['--role',name,r,p,s]]]
models=[*model('missing_ram'),*model('known_ram')]
lib=['--library-source','fixture',*[str(x) for p,d,w in [('CLK','in',1),('A','in',3),('D','in',8),('Q','out',8)] for x in ['--library-pin','missing_ram',p,d,w]]]
def clean(d):
 if isinstance(d,dict):return {k:clean(v) for k,v in d.items() if k not in ['snapshotId','openedAt']}
 if isinstance(d,list):return list(map(clean,d))
 return d
def call(args,code=0):
 r=subprocess.run([BIN,*args],capture_output=True,timeout=45);n=len(calls);(OUT/f'{n}.stdout').write_bytes(r.stdout);(OUT/f'{n}.stderr').write_bytes(r.stderr);calls.append(dict(argv=[BIN,*args],exit=r.returncode,expectedExit=code));(OUT/'commands.json').write_text(json.dumps(calls,indent=2));assert r.returncode==code,(args,r.stdout,r.stderr);d=json.loads(r.stdout);validators[d.get('algorithm','rtl-macro-interfaces-v1')].validate(d);return d
try:
 raw=call([*base,'--definition','missing_ram','--definition','known_ram'])
 full=call([*base,*models,'--require-complete'],4);assert clean(full['interfaces'])==clean(raw);m=full['mapping'];assert len(m['memories'])==5 and m['matchedInstances']==1 and m['matchedCapacityBits']==64
 for row in m['memories']:
  pins=raw['macros'][row['macro']]['pins']
  if all(p['port']['name']=='' for p in pins):
   assert len({p['port']['ref'] for p in pins})==4
   assert all('pin' not in role and not role['compatible'] for role in row['roles'])
   assert [i['code'] for i in row['issues']]==['pin_missing']*4+['unmapped_pin']*4
 for scope in ['library_top.positional','library_top.hole']:
  args=base.copy();args[3]=scope;d=call([*args,*models,'--require-complete'],4);assert len(d['mapping']['memories'])==1 and d['mapping']['matchedInstances']==0
 fixed=call([*base,*models,*lib,'--require-complete'],4);assert fixed['analysis']['mapping']['matchedInstances']==4
 for flag,value in [('--map-max-work','1'),('--map-max-macros','1'),('--max-macros','1'),('--max-pins','1'),('--max-instances','1')]:
  d=call([*base,*models,flag,value,'--require-complete'],4);assert not d['mapping']['complete'];assert d['mapping']['memories']==m['memories'][:len(d['mapping']['memories'])]
 for page in ['1','2','2000']:
  d=call([*base,*models,'--page-size',page]);assert d['mapping']['memories']==m['memories']
 d=call([*base,*models]);assert clean(d)==clean(full)
 # Formal open error classification: missing explicit source/filelist -> Core BadRequest.
 for inp in [['/missing-memory-input.sv'],['-f','/missing-memory.f'],['-F','/missing-memory.f']]:
  d=call(['--top','library_top','--scope','library_top',*inp,*models],2);assert d['error']['code']=='invalid_arguments'
 bad=OUT/'bad.sv';bad.write_text('module broken(input a); assign = ; endmodule\n')
 d=call(['--top','broken','--scope','broken',str(bad),'--definition','missing_ram'],3);assert d['error']['code']=='design_invalid'
 args=base.copy();args[3]='absent';assert call([*args,*models],3)['error']['code']=='not_found'
 for flags in [['--map-max-work','0'],['--max-pins','0'],['--page-size','0'],['--clock-pin','x','--clock-pin','x']]:
  assert call([*args,*models,*flags],2)['error']['code']=='invalid_arguments'
 print(json.dumps(dict(calls=len(calls),output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
