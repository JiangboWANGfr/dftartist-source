#!/usr/bin/env python3
"""B51 finite public-contract oracle: graph distances and independent per-bit sets."""
import argparse,datetime,json,subprocess,time,traceback
from pathlib import Path
from collections import Counter,deque,defaultdict
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False);resources=[];schemas=[]
for p in [P/'protocol/schema/hier.schema.json',*sorted((P/'analysis/sequential').glob('*report.schema.json'))]:
 s=json.loads(p.read_text());resources.append((s['$id'],Resource.from_contents(s)))
 if p.name!='hier.schema.json':schemas.append(s)
registry=Registry().with_resources(resources);vs=[Draft202012Validator(s,registry=registry) for s in schemas];byalg={s['$defs']['Report']['properties']['algorithm']['const']:i for i,s in enumerate(schemas)};cases=[];calls=[]
def need(v,msg='contract assertion failed'):
 if not v:raise AssertionError(msg)
def key(v):return json.dumps(v,sort_keys=True)
def partial(d):need(d['quality']['completeness']=='partial' and d['quality']['reasons'])
def schema(d):
 if 'error' in d:vs[byalg['rtl-structural-control-v1']].validate(d);return
 i=byalg[d['algorithm']];vs[i].validate(d)
 for j,v in enumerate(vs):
  if i!=j:need(not v.is_valid(d),'strict format boundary')
def stats(d):
 while 'analysis' in d:d=d['analysis']
 return d
def fact(s,i):
 x=s['facts'][i];return s['pages'][x['page']]['response']['result']['items'][x['item']]
def bits(s,i):
 b=fact(s,i)['bits'];need(0<b['width']<=211 and b['lsb']+b['width']<=211,'finite own bit domain');return range(b['lsb'],b['lsb']+b['width'])
def rawfacts(e,g):return {f for x in e['signals'] if x['group']==g for f in x['facts']}
def members(s,signals,t,allowed,complete):
 seen=set();done=[]
 for sig in signals:
  for f in sig['facts']:need(f in allowed and f not in seen and s['facts'][f]['signal']==sig['signal']);seen.add(f)
  if 'coverage' in sig:
   c=sig['coverage'];counts=Counter(b for f in sig['facts'] for b in bits(s,f));actual={}
   for seg in c['segments']:
    for b in range(seg['bits']['lsb'],seg['bits']['lsb']+seg['bits']['width']):need(b not in actual);actual[b]=seg['factCount']
   need(actual==dict(counts) and c['coveredBits']==len(counts) and c['overlapBits']==sum(v>1 for v in counts.values()) and c['maxMultiplicity']==max(counts.values(),default=0),'independent bit multiplicity');done.append(sig)
 expected=dict(facts=len(seen),signals=len(signals),factBits=sum(fact(s,f)['bits']['width'] for f in seen),summarizedFacts=sum(len(x['facts']) for x in done),summarizedSignals=len(done),coveredBits=sum(x['coverage']['coveredBits'] for x in done),overlapBits=sum(x['coverage']['overlapBits'] for x in done),maxMultiplicity=max((x['coverage']['maxMultiplicity'] for x in done),default=0));need(t==expected)
 if complete:need(seen==allowed)
def fanout(d):
 gen=d['analysis'];schema(gen);p=gen['analysis'];ev=p['analysis'];s=stats(p);g=gen['graph'];need(d['snapshotId']==s['snapshot']['snapshotId']);need(d['inputOrigins']==len(gen['events']) and d['inputNodes']==len(g['nodes']));need(d['work']<=d['limits']['maxWork'] and d['links']<=d['limits']['maxLinks'] and d['memberFacts']<=d['limits']['maxMembers'] and d['segmentCount']<=d['limits']['maxSegments']);need(len(d['origins'])<=d['limits']['maxOrigins'] and len(d['seeds'])<=d['limits']['maxSeeds'] and len(d['nodes'])<=d['limits']['maxNodes'])
 for i,o in enumerate(d['origins']):
  need(o['event']==i)
  if o['seed'] is not None:need(i in d['seeds'][o['seed']]['origins'])
 need([x['check'] for x in d['seeds']]==sorted({x['check'] for x in d['seeds']}))
 def edges(node):
  gi=g['nodes'][node]['generator']
  if gi is None:return []
  z=g['generators'][gi];return [x for x in [z['clockNode'],*z['asyncNodes']] if x is not None]
 for seed in d['seeds']:
  need(seed['steps'] and seed['steps'][0]['node']==seed['node']);need(len({x['node'] for x in seed['steps']})==len(seed['steps']))
  dist={seed['node']:0};queue=deque([seed['node']])
  while queue:
   parent=queue.popleft()
   for node in edges(parent):
    if node not in dist:dist[node]=dist[parent]+1;queue.append(node)
  depth=[]
  for i,step in enumerate(seed['steps']):
   if i==0:need(step['parent'] is None and step['generator'] is None and step['asyncIndex'] is None and step['role']=='root');depth.append(0)
   else:
    need(step['parent'] is not None and step['parent']<i);parent=seed['steps'][step['parent']]['node'];gi=g['nodes'][parent]['generator'];need(gi is not None and step['generator']==gi);z=g['generators'][gi];j=step['asyncIndex'];target=z['clockNode'] if j is None else z['asyncNodes'][j];need(step['node']==target and step['role']==('clock' if j is None else 'async'));depth.append(depth[step['parent']]+1)
   need(depth[i]==dist[step['node']],'first shortest dependency witness')
  if seed['traversalComplete']:need({x['node'] for x in seed['steps']}==set(dist))
  for oi in seed['origins']:
   o=d['origins'][oi];original=gen['events'][o['event']];need(original['check']==seed['check'] and original['node']==seed['node'])
 expectedReaches={(si,st) for si,seed in enumerate(d['seeds']) for st in range(len(seed['steps']))};seenReaches=set();need(len({n['node'] for n in d['nodes']})==len(d['nodes']))
 for node in d['nodes']:
  groups=set()
  for reach in node['reaches']:
   tok=(reach['seed'],reach['step']);need(tok not in seenReaches);seenReaches.add(tok);seed=d['seeds'][reach['seed']];need(seed['steps'][reach['step']]['node']==node['node'])
   groups.update(gen['events'][d['origins'][oi]['event']]['rawGroup'] for oi in seed['origins'])
  need(set(node['rawGroups'])<=groups)
  if node['membersComplete']:need(set(node['rawGroups'])==groups)
  allowed={f for gi in node['rawGroups'] for f in rawfacts(ev,gi)};members(s,node['signals'],node['totals'],allowed,node['membersComplete'])
 need(seenReaches==expectedReaches and d['links']==len(seenReaches));need(d['memberFacts']==sum(len(x['facts']) for n in d['nodes'] for x in n['signals']));need(d['summary']['nodes']==len(d['nodes']) and d['summary']['links']==d['links'])
 if gen['quality']['completeness']=='partial':partial(d)
def sources(d):
 f=d['analysis'];schema(f);fanout(f);gen=f['analysis'];g=gen['graph'];ev=gen['analysis']['analysis'];s=stats(ev);need(d['inputNodes']==len(f['nodes']) and len(d['rows'])<=d['limits']['maxRows'] and len(d['groups'])<=d['limits']['maxSources']);need(d['work']<=d['limits']['maxWork'] and d['memberFacts']<=d['limits']['maxMembers'] and d['segmentCount']<=d['limits']['maxSegments'] and d['overlapMembers']<=d['limits']['maxOverlapMembers']);need([r['node'] for r in d['rows']]==list(range(len(d['rows']))))
 for row in d['rows']:
  node=g['nodes'][f['nodes'][row['node']]['node']];source=node.get('source');need(row['kind']==(source['kind'] if source is not None else 'unresolved'))
  if row['kind'] not in ['primary_input','constant','undriven']:need(row['group'] is None)
  else:need(row['group'] is not None and d['groups'][row['group']]['source']==source and row['node'] in d['groups'][row['group']]['nodes'])
 need(len({key(x['source']) for x in d['groups']})==len(d['groups']));signalGroups=defaultdict(lambda:defaultdict(set))
 for gi,group in enumerate(d['groups']):
  allowedGroups={rg for node in group['nodes'] for rg in f['nodes'][node]['rawGroups']};need(set(group['rawGroups'])<=allowedGroups)
  if group['membersComplete']:need(set(group['rawGroups'])==allowedGroups and all(f['nodes'][node]['membersComplete'] for node in group['nodes']))
  allowed={ff for rg in group['rawGroups'] for ff in rawfacts(ev,rg)};members(s,group['signals'],group['totals'],allowed,group['membersComplete'])
  for x in group['signals']:
   for fi in x['facts']:
    for b in bits(s,fi):signalGroups[x['signal']][b].add(gi)
 for at in d['attributions']:
  expected={b:gs for b,gs in signalGroups[at['signal']].items() if len(gs)>1};actual={}
  for seg in at['segments']:
   for b in range(seg['bits']['lsb'],seg['bits']['lsb']+seg['bits']['width']):need(b not in actual);actual[b]=set(seg['groups'])
  need(expected==actual and at['crossGroupBits']==len(expected),'distinct-source overlap, not excess member count')
 need(d['crossGroupBits']==sum(x['crossGroupBits'] for x in d['attributions']));need(d['memberFacts']==sum(len(x['facts']) for group in d['groups'] for x in group['signals']))
 if d['attributionsComplete']:need(d['checkedSignals']==len(signalGroups))
 if f['quality']['completeness']=='partial':partial(d)
def cover(group):
 out=set()
 if group is not None:
  for x in group['signals']:
   for seg in x['coverage']['segments']:
    out.update((x['signal'],b) for b in range(seg['bits']['lsb'],seg['bits']['lsb']+seg['bits']['width']))
 return out
def intervals(points):
 return sum((s,b-1) not in points for s,b in points)
def matrix(d):
 deep=d['analysis'];schema(deep);direct=deep['analysis'];shared=direct['analysis'];full=[]
 for x in direct['scenarios']:
  p=None if 'profile' not in x else {**x['profile'],'analysis':shared}
  if p is not None:schema(p)
  full.append(p)
 gens={x['scenario']:{**x['generation'],'analysis':full[x['scenario']]} for x in deep['scenarios'] if 'generation' in x};ctx=[]
 for x in d['scenarios']:
  if x['status']=='not_run':need('sources' not in x and 'fanout' not in x and x['reasons']);ctx.append(None);continue
  need('analysis' not in x['sources'] and 'analysis' not in x['fanout']);f={**x['fanout'],'analysis':gens[x['scenario']]};src={**x['sources'],'analysis':f};schema(src);sources(src);ctx.append(src)
 unique=[]
 for src in ctx:
  if src is not None:
   for g in src['groups']:
    if key(g['source']) not in unique:unique.append(key(g['source']))
 need([key(row['source']) for row in d['rows']]==unique[:len(d['rows'])]);need(d['inputSources']<=len(unique) and d['indexedGroups']<=sum(len(x['groups']) for x in ctx if x is not None))
 if d['indexComplete']:need(d['inputSources']==len(unique) and d['indexedGroups']==sum(len(x['groups']) for x in ctx if x is not None))
 count=0;statuses=[]
 for row in d['rows']:
  need(len(row['groups'])==len(ctx) and len(row['status'])==len(ctx)-1,'whole source row with all slots/statuses');groups=[]
  for src,idx in zip(ctx,row['groups']):
   if idx is None:
    if d['indexComplete'] and src is not None:need(all(g['source']!=row['source'] for g in src['groups']))
    groups.append(None)
   else:need(src is not None and src['groups'][idx]['source']==row['source']);groups.append(src['groups'][idx])
  for i,status in enumerate(row['status'],1):
   if ctx[0] is None or ctx[i] is None or ctx[0]['quality']['completeness']!='complete' or ctx[i]['quality']['completeness']!='complete' or not d['indexComplete'] and (groups[0] is None or groups[i] is None):expected='unresolved'
   else:expected='unchanged' if cover(groups[0])==cover(groups[i]) else 'changed'
   need(status==expected,'matrix compares state-bit union and complete absence, not group numbers or multiplicity');statuses.append(status)
  count+=sum(intervals(cover(g)) for g in groups if g is not None)
 need(d['cells']==len(d['rows'])*len(ctx)<=d['limits']['maxCells'] and len(d['rows'])<=d['limits']['maxRows']);need(0<=d['intervals']<=min(count,d['limits']['maxIntervals']) and d['work']<=d['limits']['maxWork'])
 if all(status!='unresolved' for status in statuses):need(d['intervals']==count,'decided rows normalize every context union exactly')
 for status in ['changed','unchanged','unresolved']:need(d['summary'][status]==statuses.count(status))
 if deep['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 if d['algorithm']=='rtl-register-control-fanout-v1':fanout(d)
 elif d['algorithm']=='rtl-register-control-sources-v1':sources(d)
 elif d['algorithm']=='rtl-register-source-scenarios-v1':matrix(d)
def call(top,flags,extra=(),scope=None,code=0):
 argv=[a.binary,'--top',top,'--scope',scope or top,str(H/'design.sv'),*flags,*extra];n=f'cli-{len(calls):03d}';start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90);c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=n+'.stdout',stderr=n+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);(O/(n+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');calls.append(c);need(r.returncode==code,f'exit{r.returncode} expected{code}');d=json.loads(r.stdout);validate(d);return d
def test(id):
 def dec(f):
  try:f();cases.append(dict(id=id,passed=True))
  except Exception as e:cases.append(dict(id=id,passed=False,error=str(e),traceback=traceback.format_exc()))
  return f
 return dec
B=['--register-statistics','--register-event-groups','--register-control-profile','--logic'];G=B+['--register-control-generation'];F=G+['--register-control-fanout'];S=F+['--register-control-sources'];M=B+['--register-resolved-events','--compare-register-scenarios','--compare-register-generation','--compare-register-sources']
def sc(top,values=(0,1)):return [x for i,v in enumerate(values) for x in ['--scenario','CTX'+str(i),'--input-value',top+'.mode','0',str(v)]]
@test('F01 shared generating root shortest paths and original-state union')
def _():
 d=call('U_shared',F,scope='U_shared.u');root=[n for n in d['nodes'] if len(n['reaches'])==2];need(len(root)==1 and root[0]['totals']['factBits']==13 and root[0]['totals']['coveredBits']==9 and root[0]['totals']['overlapBits']==4)
@test('F02 clock/async origins never duplicate the same fact per node')
def _():
 d=call('U_roles',F,scope='U_roles.u');need(len(d['origins'])==2 and all(n['totals']['facts']==1 and n['totals']['coveredBits']==6 for n in d['nodes']))
@test('F03 cycle visited and unknown input quality remain partial')
def _():
 for top,scope in [('T_cycle','T_cycle.u'),('T_partial',None)]:partial(call(top,F,['--require-complete'],scope=scope,code=4))
@test('F04 original clock and async dependency witnesses')
def _():call('T_network',F,scope='T_network.u')
@test('F05 fanout limits retain bounded paths and atomic coverage')
def _():
 for name in ['origins','seeds','nodes','links','members','segments','work']:partial(call('U_shared',F,['--max-register-fanout-'+name,'1','--require-complete'],scope='U_shared.u',code=4))
@test('S01 terminal aliases merge, generated nodes do not become terminal sources')
def _():
 for top in ['U_alias','U_shared']:
  d=call(top,S,scope=top+'.u');need(len(d['groups'])==1 and d['groups'][0]['totals']['coveredBits']==9 and d['groups'][0]['totals']['overlapBits']==4)
@test('S02 polarity split and clock/reset same-state overlap')
def _():
 d=call('U_polarity',S,scope='U_polarity.u');need(len(d['groups'])==2 and d['crossGroupBits']==4)
 d=call('U_clockreset',S,scope='U_clockreset.u');need(len(d['groups'])==2 and d['crossGroupBits']==6 and all(g['totals']['coveredBits']==6 for g in d['groups']))
@test('S03 constant X and distinct undriven identities')
def _():
 d=call('U_const',S,scope='U_const.u');need(d['groups'] and all(g['source']['kind']=='constant' and g['source']['value']=='x' for g in d['groups']))
 d=call('U_float',S,scope='U_float.u');need(len(d['groups'])==2 and all(g['source']['kind']=='undriven' for g in d['groups']))
@test('S04 unknown/cycle and fanout partial never upgrade global quality')
def _():
 for top,scope in [('T_cycle','T_cycle.u'),('T_partial',None)]:partial(call(top,S,['--require-complete'],scope=scope,code=4))
 partial(call('U_shared',S,['--max-register-fanout-origins','1','--require-complete'],scope='U_shared.u',code=4))
@test('S05 source and attribution budgets retain honest prefixes')
def _():
 for name in ['rows','sources','members','segments','overlap-members','work']:partial(call('U_polarity',S,['--max-register-source-'+name,'1','--require-complete'],scope='U_polarity.u',code=4))
@test('M01 full identities, complete absence and 0/1/0')
def _():
 d=call('T_direct',M,sc('T_direct',(0,1,0)),scope='T_direct.u');need(len(d['rows'])==4 and d['summary']['changed']==4 and d['summary']['unchanged']==4)
@test('M02 deep structure changed but terminal-state coverage unchanged')
def _():
 d=call('U_rewire',M,sc('U_rewire'),scope='U_rewire.u');need(d['analysis']['summary']['changed']==2 and len(d['rows'])==1 and d['rows'][0]['status']==['unchanged'])
@test('M03 write multiplicity and adjacent segment counts do not change bit union')
def _():
 d=call('U_multiplicity',M,sc('U_multiplicity',(0,1,0)));need(len(d['rows'])==2 and d['summary']['changed']==1 and d['summary']['unchanged']==3)
@test('M04 partial identical known subsets and cycles stay unresolved')
def _():
 for top,scope in [('T_partial',None),('T_cycle','T_cycle.u')]:
  d=call(top,M,sc(top,(0,0))+['--require-complete'],scope=scope,code=4);partial(d);need(d['summary']['changed']==0 and d['summary']['unchanged']==0)
@test('M05 source proof independent from structure-only comparison budget')
def _():
 d=call('U_rewire',M,sc('U_rewire')+['--max-generation-comparison-cones','1','--require-complete'],scope='U_rewire.u',code=4);partial(d);need(len(d['rows'])==1 and d['rows'][0]['status']==['unchanged'])
@test('M06 matrix row/cell/interval/work caps do not publish half rows')
def _():
 for name in ['rows','cells','work']:
  d=call('T_direct',M,sc('T_direct')+['--max-register-source-scenario-'+name,'1','--require-complete'],scope='T_direct.u',code=4);partial(d)
  if name=='cells':need(not d['rows'] and d['cells']==0)
 d=call('U_rewire',M,sc('U_rewire')+['--max-register-source-scenario-intervals','1','--require-complete'],scope='U_rewire.u',code=4);partial(d);need(not d['rows'] and d['intervals']==0)
@test('M07 empty, eight contexts and original name limits')
def _():
 d=call('T_empty',M,['--scenario','ONE','--scenario','TWO']);need(not d['rows'] and d['quality']['completeness']=='complete')
 call('T_empty',M,[x for i in range(8) for x in ['--scenario',str(i)]])
 call('T_empty',M,[x for i in range(9) for x in ['--scenario',str(i)]],code=2)
@test('X01 invalid flags, zero/out-of-range budgets and missing scope')
def _():
 for flags,extra in [(G,['--register-control-sources']),([],['--register-control-fanout']),([],['--max-register-fanout-work','1']),(F,['--max-register-fanout-nodes','0']),(F,['--max-register-source-work','1']),(S,['--max-register-source-sources','0']),(M,['--register-control-sources']),(M,['--max-register-source-scenario-cells','0']),(M,['--max-register-source-scenario-millis','60001'])]:call('T_empty',flags,extra,code=2)
 call('T_empty',F,scope='absent',code=3)
@test('X02 no global value override or half-success second context')
def _():
 call('T_empty',M,['--input-value','T_empty.mode','0','0','--scenario','A','--scenario','B'],code=2)
 call('T_empty',M,['--scenario','A','--scenario','B','--input-value','T_empty.missing','0','0'],code=3)
 call('T_empty',M,['--scenario','A','--scenario','A'],code=2)
@test('X03 old generation remains valid; new wrappers strict and no new findings')
def _():
 call('U_shared',G,['--fail-on-error'],scope='U_shared.u');call('U_shared',S,['--fail-on-error'],scope='U_shared.u')
summary=dict(planned=20,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls);(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped']}));raise SystemExit(bool(summary['failed']))
