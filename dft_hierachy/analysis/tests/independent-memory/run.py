#!/usr/bin/env python3
"""B57: DESIGN 7.7/7.8/7.9, closed own RTL; no implementation-derived oracle."""
import argparse,copy,datetime,json,subprocess,time,traceback
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False)
resources=[];schemas={}
for f in [P/'protocol/schema/hier.schema.json',P/'analysis/objects/object-catalog.schema.json',*sorted((P/'analysis/memory').glob('*.schema.json'))]:
 s=json.loads(f.read_text());resources.append((s['$id'],Resource.from_contents(s)))
 if f.name!='hier.schema.json':schemas[s['oneOf'][0]['properties']['algorithm']['const']]=s
reg=Registry().with_resources(resources);validators={k:Draft202012Validator(s,registry=reg) for k,s in schemas.items()};cases=[];calls=[]
def need(v,msg='independent contract assertion'):
 if not v:raise AssertionError(msg)
def test(name):
 def run(f):
  try:f();cases.append(dict(name=name,passed=True))
  except Exception as e:cases.append(dict(name=name,passed=False,error=str(e),traceback=traceback.format_exc()))
 return run
def clean(d):
 if isinstance(d,dict):return {k:clean(v) for k,v in d.items() if k not in ['snapshotId','openedAt']}
 if isinstance(d,list):return [clean(v) for v in d]
 return d
roles=[('address','ADDR','none'),('data_in','WD','none'),('data_out','RD','none'),('clock','CLK','posedge'),('write_enable','WE','low'),('write_mask','BE','high')]
pins=[('ADDR','in',2),('WD','in',6),('RD','out',6),('CLK','in',1),('WE','in',1),('BE','in',2)]
def model(defn='B57Bank',words=3,bits=6):return ['--model',defn,str(words),str(bits),'--mask-lane',defn,'3']+[x for role,pin,sense in roles for x in ['--role',defn,role,pin,sense]]
def lib(defn='B57Ext',source='own:声明0'):return ['--library-source',source]+[str(x) for p,d,w in pins for x in ['--library-pin',defn,p,d,w]]
def schema(d):
 if 'error' in d:validators['rtl-macro-interfaces-v1'].validate(d);return
 validators[d['algorithm']].validate(d)
 for k,v in validators.items():
  if k!=d['algorithm']:need(not v.is_valid(d),'format is distinct')
def macro(d):
 schema(d);cat=d['catalog'];need(cat['request']['kinds']==['instance'] and cat['request']['text']=='','original instance-only catalog');ix=[m['instance'] for m in d['macros']];need(ix==sorted(set(ix)))
 for m in d['macros']:
  inst=cat['instances'][m['instance']]['info'];need(inst['defName'] in d['request']['definitionNames']);need(('parent' in m)==('parentStatus' in m))
  for p in m['pins']:
   need(p['object']['ref']==p['port']['ref'] and p['object']['inst']==inst['ref'])
   need(all(b['inst']==inst['ref'] and b['pin']==p['port']['ref'] for b in p['bindings']),'occurrence identity not name only')
   need(('clock' in p)==(p['port']['name'] in d['request']['clockPins']),'only explicitly requested clocks')
  need(m['missingClockPins']==[n for n in d['request']['clockPins'] if n not in [p['port']['name'] for p in m['pins']]])
 need(d['work']<=d['request']['limits']['maxWork'] and d['queries']<=d['request']['limits']['maxQueries'])
 if not cat['complete']:need(not d['complete'])
def mapping(d):
 schema(d);i=d['interfaces'];macro(i);m=d['mapping'];need(m['snapshotId']==i['catalog']['snapshot']['snapshotId']);need([r['macro'] for r in m['memories']]==list(range(len(m['memories']))));count=cap=0
 for r in m['memories']:
  raw=i['macros'][r['macro']];df=i['catalog']['instances'][raw['instance']]['info']['defName'];models=m['request']['models'];matches=[j for j,x in enumerate(models) if x['definitionName']==df]
  if not matches:need(r['status']=='unmapped' and 'model' not in r and any(x['code']=='model_missing' for x in r['issues']));continue
  mi=matches[0];model0=models[mi];need(r['model']==mi);expected=[];used=set()
  for j,x in enumerate(model0['roles']):
   ix=next((n for n,p in enumerate(raw['pins']) if p['port']['name']==x['pin']),None);row=dict(role=j,compatible=False)
   if ix is not None:
    used.add(ix);row['pin']=ix;p=raw['pins'][ix]['port'];w=(model0['words']-1).bit_length() if x['role']=='address' else model0['dataBits'] if x['role'] in ['data_in','data_out'] else model0['dataBits']//model0['maskLaneBits'] if x['role']=='write_mask' else 1;direction='out' if x['role']=='data_out' else 'in';row['compatible']=p['width']==w and p['direction']==direction
   expected.append(row)
  matched=all(x['compatible'] for x in expected) and len(used)==len(raw['pins']);need(r['roles']==expected and r['status']==('matched' if matched else 'mismatch'),'declaration geometry and original pin indices');need(bool(r['issues'])!=matched)
  if matched:count+=1;cap+=model0['words']*model0['dataBits']
 need(int(m['matchedInstances'])==count and int(m['matchedCapacityBits'])==cap,'sum published matched declarations only');need(int(m['work'])<=m['request']['limits']['maxWork']);need(len(m['memories'])<=m['request']['limits']['maxMacros'])
 if not i['complete']:need(not m['complete'],'original partial retained')
def validate(d):
 schema(d)
 if 'error' in d:return
 if d['algorithm']=='rtl-library-memory-v1':
  l=d['library'];need([c['definitionName'] for c in l['cells']]==sorted(c['definitionName'] for c in l['cells']));need(all(c['cell']['attrs']['dft.library.source']==l['source'] for c in l['cells']));validate(d['analysis']);ii=d['analysis'].get('interfaces',d['analysis']);need(not ii['catalog']['snapshot']['inputHashComplete'])
 elif d['algorithm']=='rtl-memory-map-v1':mapping(d)
 else:macro(d)
def call(flags=(),top='B57Top',scope=None,code=0,files=None):
 argv=[a.binary,'--top',top,'--scope',scope or top,*(files if files is not None else [str(H/'design.sv')]),*flags];name=f'cli-{len(calls):03d}';start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,capture_output=True,timeout=120)
 c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=name+'.stdout',stderr=name+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);(O/(name+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');calls.append(c);need(r.returncode==code,f'exit {r.returncode} != {code}: {r.stdout[:300]!r}');d=json.loads(r.stdout);validate(d);return d
D=['--definition','B57Bank'];R=['--recursive']
@test('C01 own six macros / BFS / explicit scopes and empty domain')
def _():
 d=call(D+R);need(d['complete'] and len(d['macros'])==6 and len(d['catalog']['instances'])==8);need(call(D)['macros']==[]);need(call(['--definition','absent']+R)['macros']==[]);s=call(D,scope='B57Top.w.inner');need(s['macros'][0]['parent']['pathText']=='B57Top.w');need('parent' not in call(D,top='B57Bank')['macros'][0]);need(call(['--definition','B57Empty'],top='B57Empty')['macros'][0]['pins']==[])
@test('C02 trace explicit vs missing and constant clocks')
def _():
 d=call(D+R+['--clock-pin','CLK']);need(len(d['macros'])==6);need(any(n.get('kind')=='const' for m in d['macros'] for p in m['pins'] if 'clock' in p for n in p['clock']['result']['nodes']));d=call(D+R+['--clock-pin','missing','--require-complete'],code=4);need(not d['complete'] and all(m['missingClockPins']==['missing'] for m in d['macros']))
@test('C03 whole-macro atomic/detail exact caps')
def _():
 full=call(D+R);need(call(D+R+['--max-macros','6'])['complete']);p=call(D+R+['--max-macros','2','--require-complete'],code=4);need(clean(p['macros'])==clean(full['macros'][:2]));need(call(D+R+['--max-pins','5','--require-complete'],code=4)['macros']==[]);need(call(D+R+['--max-bindings','1','--require-complete'],code=4)['macros']==[])
@test('C04 mapping independent geometry / order / capacity / no implicit tracing')
def _():
 d=call(model()+R+['--require-complete'],code=4);need(d['mapping']['matchedInstances']==5 and d['mapping']['matchedCapacityBits']==90);need(all('clock' not in p for m in d['interfaces']['macros'] for p in m['pins']));flags=model();rolesfirst=flags[7:]+flags[:7];d2=call(rolesfirst+R);need(clean(d2)==clean(d));d=call(model(),top='B57Bank');need(d['mapping']['complete'] and d['mapping']['matchedCapacityBits']==18)
@test('C05 mapper atomic row budgets and partial producer')
def _():
 d=call(model()+R+['--map-max-macros','1','--require-complete'],code=4);need(len(d['mapping']['memories'])==1 and d['mapping']['matchedCapacityBits']==18);d=call(model()+R+['--map-max-work','1','--require-complete'],code=4);need(not d['mapping']['memories'] and d['mapping']['matchedCapacityBits']==0);d=call(model()+['--clock-pin','missing','--require-complete'],top='B57Bank',code=4);need(d['mapping']['memories'][0]['status']=='matched' and not d['mapping']['complete'])
@test('C06 library named and positional pin-hole ownership')
def _():
 for top in ['B57OpaqueTop','B57PosTop']:
  d=call(model('B57Ext')+R+lib(),top=top);need(d['algorithm']=='rtl-library-memory-v1' and d['analysis']['mapping']['matchedCapacityBits']==18);need([p['name'] for p in d['library']['cells'][0]['cell']['pins']]==[p for p,_,_ in pins]);raw=d['analysis']['interfaces']['macros'][0];need(len(raw['pins'])==6)
  if top=='B57PosTop':need(any(s['target']['kind']=='unconnected' for p in raw['pins'] if p['port']['name']=='RD' for b in p['bindings'] for s in b['segments']))
@test('C07 library opt-in unknown direction and resolved RTL priority')
def _():
 d=call(model('B57Ext')+R+['--require-complete'],top='B57OpaqueTop',code=4);need(d['mapping']['matchedInstances']==0 and any(i['code']=='pin_direction' for r in d['mapping']['memories'] for i in r['issues']));d=call(model()+lib('B57Bank')+['--require-complete'],top='B57Bank');need(d['analysis']['mapping']['matchedCapacityBits']==18)
@test('C08 full library wrapper unused declarations and source identity')
def _():
 flags=['--definition','B57Ext']+R+lib();d=call(flags,top='B57OpaqueTop');need(d['analysis']['algorithm']=='rtl-macro-interfaces-v1');d2=call(['--definition','B57Ext']+R+lib(source='other'),top='B57OpaqueTop');need(d['analysis']['catalog']['snapshot']['inputHash']!=d2['analysis']['catalog']['snapshot']['inputHash']);d3=call(flags+['--library-pin','Unused','p','ref','1'],top='B57OpaqueTop');need([x['definitionName'] for x in d3['library']['cells']]==['B57Ext','Unused'])
@test('C09 invalid macro inputs precede missing file')
def _():
 for flags in [[],D+D,D+['--clock-pin','CLK','--clock-pin','CLK'],['--definition',''],D+['--max-depth','1025'],D+['--max-pins','0'],D+['--max-work','-1'],['--definition','x'*4097]]:call(flags,files=['/no-such-B57-file.sv'],code=2)
@test('C10 invalid model combinations / option order')
def _():
 for flags in [model()+D,model()+['--model','B57Bank','3','6'],model()+['--mask-lane','B57Bank','3'],['--map-max-work','1']+D,['--role','undefined','clock','CLK','posedge']+D,model(words=1),model()+['--role','B57Bank','clock','other','negedge']]:call(flags,files=['/no-such-B57-file.sv'],code=2)
@test('C11 invalid library source/pins/direction/width pre-open')
def _():
 for flags in [['--library-source','x'],['--library-pin','X','a','in','1'],lib()+['--library-source','again'],lib()+['--library-pin','B57Ext','ADDR','in','2'],['--library-source','x','--library-pin','X','p','input','1'],['--library-source','x','--library-pin','X','p','in','0'],['--library-source','x','--library-pin','X','p','in','0x10']]:call(D+flags,files=['/no-such-B57-file.sv'],code=2)
@test('C12 scope and design errors plus repeat stability')
def _():
 # DESIGN 7.10 at d13bd213: open BadRequest (missing explicit input) is exit 2.
 # The original expect-3 failure remains in B57 cycle214 committed evidence.
 call(D,scope='absent',code=3);call(D,files=['/no-such-B57-file.sv'],code=2);need(clean(call(D+R))==clean(call(D+R)))
@test('C13 strict schemas reject unknown/missing/type/format crossovers')
def _():
 for d in [call(D+R),call(model()+R),call(model('B57Ext')+R+lib(),top='B57OpaqueTop')]:
  v=validators[d['algorithm']]
  for mutation in ['unknown','missing','version']:
   z=copy.deepcopy(d)
   if mutation=='unknown':z['unknown']=1
   if mutation=='missing':del z['algorithm']
   if mutation=='version':z['formatVersion']=2
   need(not v.is_valid(z))
@test('C14 mixed named/anonymous producers retain both rows; library optional')
def _():
 flags=['--definition','B57Ext']+R
 raw=call(flags,top='B57MixedTop');need(len(raw['macros'])==2 and not raw['complete']);need(sum(all(p['port']['name']=='' for p in m['pins']) for m in raw['macros'])==1)
 positive=call(model('B57Ext')+R+lib(),top='B57MixedTop');need(positive['analysis']['mapping']['matchedInstances']==2 and positive['analysis']['mapping']['matchedCapacityBits']==36)
 d=call(model('B57Ext')+R+['--require-complete'],top='B57MixedTop',code=4);need(len(d['mapping']['memories'])==2 and d['mapping']['matchedCapacityBits']==0 and all(r['status']=='mismatch' for r in d['mapping']['memories']));need(clean(d['interfaces'])==clean(raw),'original investigation preserved, including both instances and anonymous refs')
summary=dict(planned=14,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls)
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k!='calls'},ensure_ascii=False));raise SystemExit(bool(summary['failed']))
