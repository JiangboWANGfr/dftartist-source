"""Author RTL/model oracle: explicit geometry, role direction, and atomic row budgets."""
import copy,json,subprocess,sys,tempfile
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ROOT=Path(__file__).resolve().parent.parent;BIN=sys.argv[1];OUT=Path(tempfile.mkdtemp(prefix='hier-memory-map-cli-'));records=[]
resources=[json.loads(Path(sys.argv[2]).read_text()),*[json.loads((ROOT/f).read_text()) for f in ['objects/object-catalog.schema.json','memory/macro-interfaces.schema.json']]]
schema=json.loads((ROOT/'memory/memory-map.schema.json').read_text());Draft202012Validator.check_schema(schema)
v=Draft202012Validator(schema,registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in resources))
BASE=['--top','map_top','--scope','map_top','--recursive',str(ROOT/'tests/memory-map.sv')]
A=[('clock','CLK','posedge'),('address','A','none'),('data_in','D','none'),('data_out','Q','none'),('write_enable','WE','low'),('chip_enable','CEN','low'),('write_mask','MASK','high')]
B=[('address','addr','none'),('data_in','din','none'),('data_out','dout','none'),('clock','ck','negedge')]
def roles(definition,rs):return [x for role,pin,sense in rs for x in ['--role',definition,role,pin,sense]]
MODELS=['--model','mapped_ram','8','8','--mask-lane','mapped_ram','4',*roles('mapped_ram',A),'--model','plain_ram','3','4',*roles('plain_ram',B)]
def call(args,expected=0):
 cmd=[BIN,*args];r=subprocess.run(cmd,capture_output=True,timeout=40);i=len(records)
 (OUT/f'{i}.stdout').write_bytes(r.stdout);(OUT/f'{i}.stderr').write_bytes(r.stderr)
 records.append(dict(argv=[x.decode('utf8','backslashreplace') if isinstance(x,bytes) else x for x in cmd],exit=r.returncode,expectedExit=expected));(OUT/'commands.json').write_text(json.dumps(records,indent=2))
 assert r.returncode==expected,(cmd,r.stdout,r.stderr);d=json.loads(r.stdout);v.validate(d)
 if 'mapping' in d:
  source=d['interfaces'];mapped=d['mapping'];assert source['catalog']['snapshot']['snapshotId']==mapped['snapshotId']
  matched=[x for x in mapped['memories'] if x['status']=='matched'];assert len(matched)==mapped['matchedInstances']
  assert int(mapped['matchedCapacityBits'])==sum(mapped['request']['models'][x['model']]['words']*mapped['request']['models'][x['model']]['dataBits'] for x in matched)
  for row in mapped['memories']:
   macro=source['macros'][row['macro']];model=mapped['request']['models'][row['model']]
   assert source['catalog']['instances'][macro['instance']]['info']['defName']==model['definitionName']
   for role in row['roles']:
    if 'pin' in role:assert model['roles'][role['role']]['pin']==macro['pins'][role['pin']]['port']['name']
 return d
try:
 full=call([*BASE,*MODELS,'--require-complete'],4);mapping=full['mapping'];assert len(mapping['memories'])==9 and mapping['matchedInstances']==8 and mapping['matchedCapacityBits']==460
 mismatched=[x for x in mapping['memories'] if x['status']=='mismatch'];assert len(mismatched)==1
 assert {(x['code'],x['role'],x['expected'],x['actual']) for x in mismatched[0]['issues']}=={('pin_width','address','3','2'),('pin_width','data_in','8','4'),('pin_width','data_out','8','4')}
 for page in ['1','2','2000']:
  d=call([*BASE,*MODELS,'--page-size',page]);assert d['mapping']['memories']==mapping['memories']
 local=[*BASE];local[local.index('--scope')+1]='map_top.left.a'
 positive=call([*local,*MODELS,'--require-complete']);assert positive['mapping']['complete'] and positive['mapping']['matchedCapacityBits']==64
 call([*local,*MODELS,'--clock-pin','CLK','--require-complete'])
 reordered=[*roles('mapped_ram',A),*roles('plain_ram',B),'--mask-lane','mapped_ram','4','--model','mapped_ram','8','8','--model','plain_ram','3','4']
 d=call([*BASE,*reordered]);assert d['mapping']['memories']==mapping['memories']
 exact=call([*BASE,*MODELS,'--map-max-macros','9','--map-max-work',str(mapping['work'])]);assert exact['mapping']['memories']==mapping['memories']
 for flag,value in [('map-max-macros','1'),('map-max-macros','8'),('map-max-work','1'),('map-max-work','23'),('max-macros','1'),('max-instances','1')]:
  d=call([*BASE,*MODELS,'--'+flag,value,'--require-complete'],4);assert not d['mapping']['complete']
  for i,row in enumerate(d['mapping']['memories']):assert row==mapping['memories'][i]
 wrong=['--model','mapped_ram','8','8','--mask-lane','mapped_ram','4',*roles('mapped_ram',[('clock','missing','posedge'),*A[1:]])]
 d=call([*local,*wrong,'--require-complete'],4);assert {x['code'] for x in d['mapping']['memories'][0]['issues']}=={'pin_missing','unmapped_pin'}
 # Explicitly swap input/output role pins; equal widths still cannot pass the direction checks.
 swap=[*A];swap[2]=('data_in','Q','none');swap[3]=('data_out','D','none')
 d=call([*local,'--model','mapped_ram','8','8','--mask-lane','mapped_ram','4',*roles('mapped_ram',swap),'--require-complete'],4)
 assert [x['code'] for x in d['mapping']['memories'][0]['issues']]==['pin_direction','pin_direction']
 nohits=[*BASE];nohits[nohits.index('--scope')+1]='map_top.plain'
 d=call([*nohits,'--model','mapped_ram','8','8','--mask-lane','mapped_ram','4',*roles('mapped_ram',A),'--require-complete']);assert not d['mapping']['memories'] and d['mapping']['complete']
 for extra in [['--definition','mapped_ram'],['--model','mapped_ram','8','8'],['--role','ghost','clock','C','posedge'],['--role','mapped_ram','clock','CLK2','posedge'],['--mask-lane','mapped_ram','2'],['--map-max-work','0'],['--map-max-macros','10001'],['--map-max-millis','60001']]:call([*BASE,*MODELS,*extra],2)
 for words,bits in [('0','8'),('1','8'),('4294967297','8'),('8','0'),('8','65537'),('x','8')]:call([*BASE,'--model','mapped_ram',words,bits,*roles('mapped_ram',A)],2)
 for rs in [[*A[:3]],[('clock','CLK','low'),*A[1:]],[('bad','CLK','posedge'),*A[1:]],[('clock',b'\xff','posedge'),*A[1:]]]:call([*BASE,'--model','mapped_ram','8','8',*roles('mapped_ram',rs)],2)
 call([*BASE,'--role','mapped_ram','clock','CLK','posedge','--definition','mapped_ram'],2)
 call([*BASE,'--map-max-work','2','--definition','mapped_ram'],2)
 call(['--top','map_top','--scope','map_top','/missing.sv','--model','mapped_ram','0','8',*roles('mapped_ram',A)],2)
 for i in range(6):
  bad=copy.deepcopy(positive)
  if i==0:bad['extra']=1
  if i==1:bad['mapping']['memories'][0]['roles'][0]['extra']=1
  if i==2:bad['mapping']['request']['models'][0]['roles'][0]['sense']='none'
  if i==3:bad['mapping']['memories'][0]['status']='unmapped'
  if i==4:del bad['mapping']['memories'][0]['model']
  if i==5:del bad['mapping']['memories'][0]['roles'][0]['pin']
  assert not v.is_valid(bad)
 print(json.dumps(dict(calls=len(records),schemaNegativeCases=6,output=str(OUT))))
except BaseException:
 print('Raw first-failure evidence:',OUT);raise
