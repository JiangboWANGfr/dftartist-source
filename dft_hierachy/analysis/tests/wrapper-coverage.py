"""Actual Wrapper CLI, stage/position links and an independent per-bit allocator."""
from pathlib import Path
import copy,json,os,random,subprocess,sys,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
binary=Path(sys.argv[1]).resolve();root=Path(__file__).resolve().parent;e=Path(tempfile.mkdtemp(prefix='wrapper-coverage-cli-'))
core=json.loads(Path(sys.argv[2]).read_text());schemas=[json.loads((root.parent/'wrapper'/n).read_text()) for n in ['boundary-report.schema.json','cell-plan-report.schema.json','chain-plan-report.schema.json','chain-coverage-report.schema.json']]
registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in [core,*schemas]]);validator=Draft202012Validator(schemas[-1],registry=registry);old=Draft202012Validator(schemas[-2],registry=registry);Draft202012Validator.check_schema(schemas[-1])
calls=[];checks=0;pairs=0;negative=0

def need(ok,why):
 global checks
 checks+=1
 if not ok:raise AssertionError(why)
def run(args,exit=0,top='chain_top',source=None):
 argv=[str(binary),'--top',top,str(source or root/'wrapper-chains.sv'),*args];start=time.time();x=subprocess.run(argv,capture_output=True,timeout=20);i=len(calls)
 (e/f'{i}.stdout').write_bytes(x.stdout);(e/f'{i}.stderr').write_bytes(x.stderr);calls.append(dict(argv=argv,cwd=os.getcwd(),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==exit,f'{argv}: {x.returncode}!={exit}: {x.stdout!r}');return json.loads(x.stdout)
def snapshot(v):
 if isinstance(v,dict):
  if 'snapshotId' in v:return v['snapshotId']
  for x in v.values():
   s=snapshot(x)
   if s:return s
 if isinstance(v,list):
  for x in v:
   s=snapshot(x)
   if s:return s
 return None
def normalized(v):
 sid=snapshot(v)
 def norm(x):
  if isinstance(x,dict):return {k:(a.replace(str(len(sid))+':'+sid,'<snapshot>') if k=='next' and isinstance(a,str) and a.startswith('m3:') and sid else norm(a)) for k,a in x.items() if k not in ['snapshotId','openedAt']}
  if isinstance(x,list):return [norm(a) for a in x]
  return x
 return norm(v)
def config(c):
 p=e/f'config-{len(list(e.glob("config-*.json")))}.json';p.write_text(json.dumps(c));return str(p)
def inspect(c,extra=(),complete=True,single=False,top='chain_top'):
 global pairs
 f=config(c);x=run(['--config',f,'--chain-coverage','--require-complete',*extra],0 if complete else 4,top);validator.validate(x)
 if single:
  original=run(['--config',f],top=top);old.validate(original);need(normalized(original)==normalized(x['source']),'original entire source unchanged');pairs+=1
 audit(x);return x,f
def counts(rows):return dict(rows=len(rows),**{s:sum(r['status']==s for r in rows) for s in ['placed','excluded','blocked','pending']},positions=sum(len(r['positions']) for r in rows))
def audit(x):
 c=x['coverage'];boundary=x['source']['source']['source'];plan=x['source']['source']['plan'];layout=x['source']['layout'];need(c['counts']==counts(c['rows']),'global prefix counts');groups={}
 for i,r in enumerate(c['rows']):
  need(r['sourceRow']==i,'ordered boundary prefix');b=boundary['rows'][i];groups.setdefault((b['port'],b['upstream']),[]).append(r)
  ci=next((j for j,v in enumerate(plan['rows']) if v['sourceRow']==i),None);need(r.get('cellRow')==ci,'cell index')
  ch=next((j for j,v in enumerate(layout['rows']) if v['sourceRow']==ci),None) if ci is not None else None;need(r.get('chainRow')==ch,'chain index')
  if ci is None:need((r['stage'],r['status'],r['reason'])==('planning','pending','planning_not_reached'),'unplanned pending')
  elif plan['rows'][ci]['decision'] in ['excluded','blocked']:need((r['stage'],r['status'],r['reason'])==('planning',plan['rows'][ci]['decision'],plan['rows'][ci]['reason']),'earliest known decision')
  elif ch is None:need((r['stage'],r['status'],r['reason'])==('chaining','pending','chain_not_reached'),'unchained pending')
  else:need((r['stage'],r['status'],r['reason'])==('chaining',layout['rows'][ch]['status'],layout['rows'][ch]['reason']),'chain decision')
  if r['status']=='placed':
   cr=layout['rows'][ch];need(len(r['positions'])==len(cr['uses']),'all uses committed')
   for j,p in enumerate(r['positions']):
    u=cr['uses'][j];s=layout['chains'][cr['chain']]['segments'][u['segment']];need((p['use'],p['chain'],p['segment'],p['kind'],p['chainOffset'],p['width'])==(j,cr['chain'],u['segment'],s['kind'],s['offset']+u['offset'],u['width']),'position origin')
    if s['kind']=='shared':need(p['signal']==s['signal'] and p['bits']==dict(lsb=s['bits']['lsb']+u['offset'],width=u['width']),'state interval origin')
    else:need('signal' not in p and 'bits' not in p,'no dedicated state claim')
  else:need(r['positions']==[],'no partial or nonexistent positions')
 need(c['ports']==[dict(port=k[0],upstream=k[1],counts=counts(v)) for k,v in groups.items()],'per direction aggregate/order')
 if not layout['complete']:need(not c['complete'] and 'source_partial' in c['reasons'],'quality retained')
base=dict(formatVersion=1,kind='wrapper-config',mode='chains',boundary=dict(scope='chain_top',ports=['q','alias_q']),chaining=dict(chains=[dict(name='scan',capacity=100)],defaultChain='scan'))
try:
 good,f=inspect(base,single=True);need(good['coverage']['counts']==dict(rows=8,placed=8,excluded=0,blocked=0,pending=0,positions=8),'hand coverage');need(not old.is_valid(good),'old schema rejects new format')
 manual=['--plan-chains','--scope','chain_top','--port','q','--port','alias_q','--chain','scan','100','--chain-default','scan','--chain-coverage'];m=run(manual);validator.validate(m);need(normalized(m)==normalized(good),'manual/config full equivalence');pairs+=1
 for work in range(1,17):
  x,_=inspect(base,['--max-coverage-work',str(work)],work==16);need(len(x['coverage']['rows'])==work//2 and x['coverage']['work']==work,'atomic work')
 for option,cap in [('rows',1),('rows',8),('positions',1),('positions',8)]:
  x,_=inspect(base,['--max-coverage-'+option,str(cap)],cap==8);need(x['coverage']['counts']['rows']==cap,'exact cap semantics')
 for stage in ['boundary','planning','chaining']:
  c=copy.deepcopy(base);c.setdefault(stage,{})['limits']={('maxBits' if stage=='boundary' else 'maxRows'):1};x,_=inspect(c,complete=False,single=True)
  need(x['coverage']['counts']['pending']==(0 if stage=='boundary' else 7),'upstream progress classification')
 c=copy.deepcopy(base);c['planning']=dict(rules=[dict(port='alias_q',direction='output',action='exclude')]);x,_=inspect(c,['--max-coverage-positions','4'],single=True);need(x['coverage']['counts']['excluded']==4,'excluded after full positions')
 c['chaining']['limits']=dict(maxRows=1);x,_=inspect(c,complete=False,single=True);need(x['coverage']['counts']['excluded']==4 and x['coverage']['counts']['pending']==3,'known exclusions beyond chain prefix')
 c=copy.deepcopy(base);c['boundary']['ports']=['c'];x,_=inspect(c,complete=False,single=True);need(x['coverage']['rows'][0]['reason']=='control_usage','specific cell rejection')
 c=copy.deepcopy(base);c['boundary']=dict(scope='chain_fragments',ports=['a','b','d']);frag,_=inspect(c,top='chain_fragments',single=True);need([p['chainOffset'] for p in frag['coverage']['rows'][2]['positions']]==[0,2,1,3],'fragmented hand positions')
 x,_=inspect(c,['--max-coverage-positions','3'],False,top='chain_fragments');need(x['coverage']['counts']['positions']==2 and len(x['coverage']['ports'])==2,'fragment rollback including group')
 c=copy.deepcopy(base);c['boundary']=dict(scope='chain_io',ports=['p']);x,_=inspect(c,top='chain_io',single=True);need(len(x['coverage']['ports'])==2,'inout directions')
 # Independent dictionary allocation: no producer rows/segments are used for expected costs or offsets.
 rng=random.Random(228);statuses=set()
 for case in range(24):
  c=copy.deepcopy(base);caps=[rng.randint(1,6),rng.randint(1,6)];c['chaining']=dict(chains=[dict(name='a',capacity=caps[0]),dict(name='b',capacity=caps[1])],assignments=[]);rules=[];expected=[];owners={};lengths=[0,0];segments=[0,0]
  for port in ['q','alias_q']:
   for bit in range(4):
    action=rng.choice(['share','dedicated','exclude']);dest=rng.choice([0,0,1,None]);rules.append(dict(port=port,direction='output',action=action,bits=dict(lsb=bit,width=1)))
    if dest is not None:c['chaining']['assignments'].append(dict(port=port,direction='output',bits=dict(lsb=bit,width=1),chain=['a','b'][dest]))
    want=dict(stage='chaining',status='placed',reason='allocated',position=None)
    if action=='exclude':want.update(stage='planning',status='excluded',reason='declared_exclude')
    elif dest is None:want.update(status='blocked',reason='unassigned')
    elif action=='share' and bit in owners and owners[bit][0]!=dest:want.update(status='blocked',reason='chain_conflict')
    elif (action=='dedicated' or bit not in owners) and lengths[dest]==caps[dest]:want.update(status='blocked',reason='capacity')
    else:
     if action=='share' and bit in owners:_,offset,segment=owners[bit]
     else:
      offset=lengths[dest];segment=segments[dest];lengths[dest]+=1;segments[dest]+=1
      if action=='share':owners[bit]=(dest,offset,segment)
     want['position']=dict(chain=dest,chainOffset=offset,segment=segment,kind='shared' if action=='share' else 'dedicated',width=1)
     if action=='share':want['position']['bits']=dict(lsb=bit,width=1)
    statuses.add(want['reason']);expected.append(want)
  c['planning']=dict(rules=rules);complete=all(v['status']!='blocked' for v in expected);x,_=inspect(c,complete=complete,single=True)
  for got,want in zip(x['coverage']['rows'],expected):
   need(all(got[k]==want[k] for k in ['stage','status','reason']),'independent state/reason')
   if want['position'] is not None:need(len(got['positions'])==1 and all(got['positions'][0].get(k)==v for k,v in want['position'].items()),'independent logical/state position')
   else:need(got['positions']==[],'independent nonplacement')
 need(statuses=={'allocated','declared_exclude','unassigned','chain_conflict','capacity'},'random category coverage')
 for args in [['--chain-coverage'],['--chain-coverage','--plan-cells'],['--config',f,'--max-coverage-work','1'],['--config',f,'--chain-coverage','--chain-coverage'],['--compare-chains','a',f,'--compare-chains','b',f,'--chain-coverage'],['--config',f,'--chain-coverage','--scope','chain_top']]:run(args,2,source=e/'absent.sv')
 for mode in ['cells','boundary']:
  c=copy.deepcopy(base);c['mode']=mode;del c['chaining'];run(['--config',config(c),'--chain-coverage'],2,source=e/'absent.sv')
 for flag,maximum in [('rows',100000),('positions',100000),('work',10000000),('millis',60000)]:
  for value in ['0','-1','1.5',str(maximum+1)]:run(['--config',f,'--chain-coverage','--max-coverage-'+flag,value],2,source=e/'absent.sv')
 c=copy.deepcopy(base);c['chaining']['assignments']=[dict(port='q',direction='output',bits=dict(lsb=4,width=1),chain='scan')];run(['--config',config(c),'--chain-coverage'],2)
 def changed(path,value):
  m=copy.deepcopy(good);p=m
  for k in path[:-1]:p=p[k]
  p[path[-1]]=value;return m
 mutants=[changed(['algorithm'],'wrong'),changed(['coverage','rows',0,'status'],'pending'),changed(['coverage','rows',0,'stage'],'planning'),changed(['coverage','rows',0,'positions',0,'kind'],'dedicated'),changed(['coverage','rows',0,'positions',0,'width'],0),changed(['coverage','rows',0,'positions',0,'chainOffset'],9007199254740992),changed(['coverage','rows',0,'extra'],0),changed(['coverage','ports',0,'extra'],0),changed(['coverage','counts','pending'],1),changed(['coverage','stop'],dict(reason='budget_work',sourceRow=8)),changed(['coverage','limits','maxRows'],0)]
 missing=copy.deepcopy(good);del missing['coverage']['rows'][0]['positions'][0]['bits'];mutants.append(missing)
 for mutant in mutants:need(not validator.is_valid(mutant),'schema negative');negative+=1
 print(json.dumps(dict(calls=len(calls),checks=checks,equivalencePairs=pairs,seed=228,referenceCases=24,schemaNegative=negative,output=str(e))))
except Exception:
 print('output='+str(e));raise
