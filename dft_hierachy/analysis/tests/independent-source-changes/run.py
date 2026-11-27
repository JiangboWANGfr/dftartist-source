#!/usr/bin/env python3
"""B52 independent finite set oracle. Earlier B51 verifier prefix preserved; original files unchanged."""
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
# Independent finite set oracle for DESIGN7.5.19-21; no product implementation code.
oldvalidate=validate
def points(ranges):
 out=set();end=-1
 for r in ranges:
  l,w=r['lsb'],r['width'];need(0<w<=211 and l+w<=211 and l>end,'ordered maximal finite ranges');end=l+w;out.update(range(l,l+w))
 return out
def dcounts(left,right):return dict(baselineBits=len(left),scenarioBits=len(right),addedBits=len(right-left),removedBits=len(left-right),retainedBits=len(left&right))
def acounts(total,changed):return dict(coveredBits=total,changedBits=changed,retainedOnlyBits=total-changed)
def sumcounts(rows,field,keys):return {k:sum(x[field][k] for x in rows) for k in keys}
def delta(d):
 m=d['analysis'];schema(m);matrix(m);ctx=[x.get('sources') for x in m['scenarios']];order=[(i,j) for i,r in enumerate(m['rows']) for j in range(1,len(ctx))];need([(r['matrixRow'],r['scenario']) for r in d['rows']]==order[:len(d['rows'])]);need(d['inputRows']==len(m['rows']) and d['inputComparisons']==len(order));nS=nR=nI=0
 for row in d['rows']:
  r=m['rows'][row['matrixRow']];j=row['scenario'];need(row['status']==r['status'][j-1])
  if row['status']=='unresolved':need('delta' not in row);continue
  groups=[None if r['groups'][k] is None else ctx[k]['groups'][r['groups'][k]] for k in [0,j]];left,right=map(cover,groups);z=row['delta'];signals=sorted({s for s,b in left|right});need([x['signal'] for x in z['signals']]==signals)
  for sig in z['signals']:
   si=sig['signal'];aa={b for s,b in left if s==si};bb={b for s,b in right if s==si};need(points(sig['added'])==bb-aa and points(sig['removed'])==aa-bb and points(sig['retained'])==aa&bb,'B\\A A\\B intersection by finite bits');need(sig['counts']==dcounts(aa,bb))
  need(z['totals']==dcounts(left,right));nS+=len(signals);nR+=sum(len(x[k]) for x in z['signals'] for k in ['added','removed','retained']);nI+=intervals(left)+intervals(right)
 need(d['signals']==nS and d['ranges']==nR and d['intervals']==nI)
 for name,actual in [('Rows',len(d['rows'])),('Signals',nS),('Ranges',nR),('Intervals',nI),('Work',d['work'])]:need(actual<=d['limits']['max'+name])
 if d['quality']['completeness']=='complete':need(len(d['rows'])==len(order))
 if m['quality']['completeness']=='partial':partial(d)
def attribution(d):
 de=d['analysis'];schema(de);delta(de);m=de['analysis'];nrows=len(m['rows']);nsc=len(m['scenarios']);need([c['scenario'] for c in d['comparisons']]==list(range(1,nsc)));ni=nr=ns=nm=0
 for c in d['comparisons']:
  j=c['scenario'];resolved=[(i,x) for i,x in enumerate(de['rows']) if x['scenario']==j and x['status']!='unresolved'];unknown=[x for x in de['rows'] if x['scenario']==j and x['status']=='unresolved'];missing=nrows-len(resolved)-len(unknown)
  if not c['inputCollected']:need(not c['rows'] and c['resolvedRows']==0 and c['unresolvedRows']==0 and c['missingRows']==nrows and not c['sourcesComplete']);continue
  need(c['resolvedRows']==len(resolved) and c['unresolvedRows']==len(unknown) and c['missingRows']==missing);need(c['sourcesComplete']==(m['quality']['completeness']=='complete' and not unknown and missing==0))
  expected=defaultdict(lambda:defaultdict(lambda:[set(),set(),set()]))
  for idx,x in resolved:
   for sig in x['delta']['signals']:
    for role,k in enumerate(['added','removed','retained']):
     ni+=len(sig[k])
     for b in points(sig[k]):expected[sig['signal']][b][role].add(idx)
  sigs=sorted(expected);need([r['signal'] for r in c['rows']]==sigs[:len(c['rows'])])
  for r in c['rows']:
   actual={};last=None;end=-1;changed=0
   for seg in r['segments']:
    groups=[seg[k] for k in ['addedRows','removedRows','retainedRows']];need(any(groups))
    for g in groups:need(g==sorted(set(g)) and all(i<len(de['rows']) and de['rows'][i]['scenario']==j for i in g))
    l,w=seg['bits']['lsb'],seg['bits']['width'];need(0<w<=211 and l+w<=211 and l>=end);need(l!=end or last!=groups,'merge adjacent identical role sets');end=l+w;last=groups
    for b in range(l,l+w):need(b not in actual);actual[b]=[set(g) for g in groups]
    if groups[0] or groups[1]:changed+=w
    nm+=sum(map(len,groups));ns+=1
   need(actual==dict(expected[r['signal']]),'same-bit source migration keeps all roles, counts once');need(r['counts']==acounts(len(actual),changed))
  need(c['totals']==sumcounts(c['rows'],'counts',['coveredBits','changedBits','retainedOnlyBits']));nr+=len(c['rows'])
  if c['state']=='complete':need(c['sourcesComplete'] and len(c['rows'])==len(sigs))
 need((d['intervals'],d['rows'],d['segments'],d['members'])==(ni,nr,ns,nm))
 for name,actual in [('Rows',nr),('Intervals',ni),('Segments',ns),('Members',nm),('Work',d['work'])]:need(actual<=d['limits']['max'+name])
 if de['quality']['completeness']=='partial':partial(d)
def transitions(d):
 at=d['analysis'];schema(at);attribution(at);de=at['analysis'];need(len(d['comparisons'])==len(at['comparisons']));ni=nc=nm=ns=0
 for c,src in zip(d['comparisons'],at['comparisons']):
  need(c['scenario']==src['scenario'] and c['sourcesComplete']==src['sourcesComplete'] and c['inputComplete']==(src['state']=='complete') and c['inputRows']==len(src['rows']))
  if not c['inputCollected']:need(c['inputSegments']==0 and not c['cohorts']);continue
  expected=defaultdict(list)
  for ri,row in enumerate(src['rows']):
   for si,seg in enumerate(row['segments']):
    base=tuple(sorted({de['rows'][i]['matrixRow'] for k in ['removedRows','retainedRows'] for i in seg[k]}));new=tuple(sorted({de['rows'][i]['matrixRow'] for k in ['addedRows','retainedRows'] for i in seg[k]}));expected[(base,new)].append(dict(row=ri,segment=si))
  count=sum(len(r['segments']) for r in src['rows']);need(c['inputSegments']==count);ni+=count;keys=sorted(expected);actualkeys=[(tuple(x['baselineSources']),tuple(x['scenarioSources'])) for x in c['cohorts']];need(actualkeys==keys[:len(actualkeys)],'lexicographic complete cohort prefix')
  for co,k in zip(c['cohorts'],keys):
   need(co['members']==expected[k] and co['changed']==(k[0]!=k[1]),'full source-set conversion, no guessed pairwise transfer');width=sum(src['rows'][x['row']]['segments'][x['segment']]['bits']['width'] for x in co['members']);need(co['counts']==acounts(width,width if co['changed'] else 0));nc+=1;nm+=len(co['members']);ns+=len(k[0])+len(k[1])
  need(c['totals']==sumcounts(c['cohorts'],'counts',['coveredBits','changedBits','retainedOnlyBits']))
  if c['state']=='complete':need(c['inputComplete'] and c['sourcesComplete'] and len(actualkeys)==len(keys))
 need((d['inputSegments'],d['cohorts'],d['members'],d['sources'])==(ni,nc,nm,ns))
 for name,actual in [('InputSegments',ni),('Cohorts',nc),('Members',nm),('Sources',ns),('Work',d['work'])]:need(actual<=d['limits']['max'+name])
 if at['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 if d['algorithm']=='rtl-register-source-deltas-v1':delta(d)
 elif d['algorithm']=='rtl-register-source-attribution-v1':attribution(d)
 elif d['algorithm']=='rtl-register-source-transitions-v1':transitions(d)
 else:oldvalidate(d)
D=M+['--source-coverage-deltas'];A=D+['--source-bit-attribution'];T=A+['--source-transition-cohorts']
@test('D01 swap nonzero overlapping slices: added removed retained exact sets')
def _():
 d=call('V_swap',D,sc('V_swap',(0,1,0)),scope='V_swap.u');need(len(d['rows'])==4);need(sorted((x['delta']['totals']['addedBits'],x['delta']['totals']['removedBits'],x['delta']['totals']['retainedBits']) for x in d['rows'] if x['scenario']==1)==[(2,3,4),(3,2,4)])
@test('D02 ignore write multiplicity; same bit union is retained')
def _():
 d=call('U_multiplicity',D,sc('U_multiplicity'));need(sorted((r['delta']['totals']['addedBits'],r['delta']['totals']['removedBits'],r['delta']['totals']['retainedBits']) for r in d['rows'])==[(0,0,9),(4,0,0)])
@test('D03 partial and cycles provide no fabricated zero delta')
def _():
 for top,scope in [('T_partial',None),('T_cycle','T_cycle.u')]:
  d=call(top,D,sc(top,(0,0))+['--require-complete'],scope=scope,code=4);need(all('delta' not in r for r in d['rows']))
@test('D04 deep change and structure-only partial retain exact source coverage')
def _():
 for extra,code in [([],0),(['--max-generation-comparison-cones','1','--require-complete'],4)]:
  d=call('U_rewire',D,sc('U_rewire')+extra,scope='U_rewire.u',code=code);need(d['rows'][0]['status']=='unchanged' and d['rows'][0]['delta']['totals']['retainedBits']==9)
@test('D05 delta budgets publish whole source-comparison rows')
def _():
 for name in ['rows','signals','ranges','intervals','work']:
  d=call('V_swap',D,sc('V_swap')+['--max-source-delta-'+name,'1','--require-complete'],scope='V_swap.u',code=4)
  if name in ['ranges','intervals']:need(not d['rows'] and d['signals']==d['ranges']==d['intervals']==0)
@test('D06 holes and empty/eight-context inputs')
def _():
 d=call('V_holes',D,sc('V_holes'));need(all(len(s[k])==2 for r in d['rows'] for s in r['delta']['signals'] for k in ['added','removed'] if s[k]))
 call('T_empty',D,[x for i in range(8) for x in ['--scenario',str(i)]])
@test('A01 migration keeps removed and added refs; unique counts9/5/4')
def _():
 d=call('V_swap',A,sc('V_swap',(0,1,0)),scope='V_swap.u');need(d['comparisons'][0]['totals']==acounts(9,5) and d['comparisons'][1]['totals']==acounts(9,0) and len(d['comparisons'][0]['rows'][0]['segments'])==3)
@test('A02 two signals same multi-source conversion counts8 once')
def _():
 d=call('V_sets',A,sc('V_sets'));c=d['comparisons'][0];need(len(c['rows'])==2 and c['totals']==acounts(8,8) and all(len(r['segments'])==1 and all(len(r['segments'][0][k])==1 for k in ['addedRows','removedRows','retainedRows']) for r in c['rows']))
@test('A03 missing delta rows and unknown source never prove complete')
def _():
 d=call('V_swap',A,sc('V_swap')+['--max-source-delta-rows','1','--require-complete'],scope='V_swap.u',code=4);need(d['comparisons'][0]['missingRows']==1 and not d['comparisons'][0]['sourcesComplete'])
 d=call('T_partial',A,sc('T_partial',(0,0))+['--require-complete'],code=4);need(not d['comparisons'][0]['sourcesComplete'] and not d['comparisons'][0]['rows'])
@test('A04 collect and signal budgets are atomic')
def _():
 for name in ['rows','intervals','segments','members','work']:
  d=call('V_sets',A,sc('V_sets')+['--max-source-attribution-'+name,'1','--require-complete'],code=4)
  if name=='intervals':need(not d['comparisons'][0]['inputCollected'] and d['intervals']==0)
@test('A05 constant polarity shared-bit and empty inputs')
def _():
 for top,scope,vals in [('U_polarity','U_polarity.u',None),('U_const','U_const.u',None),('T_empty',None,None)]:call(top,A,['--scenario','A','--scenario','B'],scope=scope)
@test('T01 multi-source sets are one8-bit cohort with2 original members')
def _():
 d=call('V_sets',T,sc('V_sets',(0,1,0)));x,y=d['comparisons'];need(len(x['cohorts'])==len(y['cohorts'])==1);c=x['cohorts'][0];need(len(c['baselineSources'])==len(c['scenarioSources'])==2 and len(set(c['baselineSources'])&set(c['scenarioSources']))==1 and len(c['members'])==2 and c['counts']==acounts(8,8));need(not y['cohorts'][0]['changed'] and y['totals']==acounts(8,0))
@test('T02 disjoint holes and nonadjacent same-source retention coalesce')
def _():
 d=call('V_holes',T,sc('V_holes'));need(len(d['comparisons'][0]['cohorts'])==1 and len(d['comparisons'][0]['cohorts'][0]['members'])==2 and d['comparisons'][0]['totals']==acounts(6,6))
 d=call('U_multiplicity',T,sc('U_multiplicity'));need(sorted((len(x['members']),x['counts']['coveredBits']) for x in d['comparisons'][0]['cohorts'])==[(1,4),(2,5)])
@test('T03 cohort member source index and work budgets retain whole groups')
def _():
 for name in ['cohorts','members','sources','input-segments','work']:
  top='V_swap' if name=='cohorts' else 'V_sets';scope='V_swap.u' if top=='V_swap' else None;d=call(top,T,sc(top)+['--max-source-transition-'+name,'1','--require-complete'],scope=scope,code=4)
  if name=='input-segments':need(not d['comparisons'][0]['inputCollected'] and d['inputSegments']==0)
  if name in ['members','sources']:need(not d['comparisons'][0]['cohorts'] and d['cohorts']==d['members']==d['sources']==0)
@test('T04 unknown and matrix-prefix domains stay partial')
def _():
 for top,extra,scope in [('T_partial',[],None),('V_swap',['--max-register-source-scenario-rows','1'],'V_swap.u')]:
  d=call(top,T,sc(top,(0,0))+extra+['--require-complete'],scope=scope,code=4);need(not d['comparisons'][0]['sourcesComplete'])
@test('T05 input output and source completeness remain independent')
def _():
 d=call('V_sets',T,sc('V_sets')+['--max-source-attribution-rows','1','--require-complete'],code=4);c=d['comparisons'][0];need(c['sourcesComplete'] and not c['inputComplete'] and c['inputCollected'] and c['state']=='partial' and c['totals']['coveredBits'] in [2,6] and c['totals']==acounts(c['totals']['coveredBits'],c['totals']['coveredBits']))
@test('X01 dependency mutual-exclusion and unenabled budgets rejected')
def _():
 for flags,extra in [(M,['--source-bit-attribution']),(D,['--source-transition-cohorts']),([],['--source-coverage-deltas']),(M,['--max-source-delta-work','1']),(D,['--max-source-attribution-work','1']),(A,['--max-source-transition-work','1'])]:call('T_empty',flags,extra,code=2)
@test('X02 zero and overlimit post budgets rejected')
def _():
 for flags,prefix,name in [(D,'delta','signals'),(D,'delta','ranges'),(A,'attribution','members'),(A,'attribution','segments'),(T,'transition','sources'),(T,'transition','input-segments')]:call('T_empty',flags,['--scenario','A','--scenario','B','--max-source-'+prefix+'-'+name,'0'],code=2)
 for flags,prefix in [(D,'delta'),(A,'attribution'),(T,'transition')]:call('T_empty',flags,['--scenario','A','--scenario','B','--max-source-'+prefix+'-millis','60001'],code=2)
@test('X03 second context error duplicate name global value and scope')
def _():
 call('V_swap',T,['--scenario','A','--scenario','B','--input-value','missing','0','1'],scope='V_swap.u',code=3)
 call('V_swap',T,['--scenario','A','--scenario','A'],scope='V_swap.u',code=2)
 call('V_swap',D,['--input-value','V_swap.mode','0','0','--scenario','A','--scenario','B'],scope='V_swap.u',code=2)
 call('V_swap',T,['--scenario','A','--scenario','B'],scope='missing',code=3)
@test('X04 old and new formats strict all shared views restorable')
def _():
 for flags in [M,D,A,T]:call('V_swap',flags,sc('V_swap')+['--fail-on-error'],scope='V_swap.u')
summary=dict(planned=20,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls)
(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['calls','cases']}));raise SystemExit(0 if summary['passed']==20 else 1)
