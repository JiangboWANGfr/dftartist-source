#!/usr/bin/env python3
"""B56 investigation composition and RTL object catalog. B55 validators reused unchanged."""
import argparse,datetime,json,subprocess,time,traceback
from pathlib import Path
from collections import Counter,deque,defaultdict
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--objects',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);H=Path(__file__).resolve().parent;O=Path(a.out);O.mkdir(parents=True,exist_ok=False);resources=[];schemas=[]
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
# Projection oracles use original references, finite bits and handwritten instance adjacency.
previousvalidate=validate
COUNT_KEYS=['coveredBits','changedBits','retainedOnlyBits']
def counts_add(rows,field='counts'):return {k:sum(r[field][k] for r in rows) for k in COUNT_KEYS}
def impact(d):
 tr=d['analysis'];schema(tr);transitions(tr);s=stats(tr);at=tr['analysis'];ni=nr=nd=nm=0;need(len(d['comparisons'])==len(tr['comparisons']))
 for c,tc in zip(d['comparisons'],tr['comparisons']):
  need(c['scenario']==tc['scenario'] and c['inputComplete']==(tc['state']=='complete') and c['sourcesComplete']==tc['sourcesComplete'] and c['inputCohorts']==len(tc['cohorts']))
  if not c['inputCollected']:need(not c['instances'] and not c['definitions'] and c['inputMembers']==0);continue
  ar=at['comparisons'][c['scenario']-1]['rows'];expected=defaultdict(list);cv={}
  for ci,co in enumerate(tc['cohorts']):
   for mi,m in enumerate(co['members']):
    row=ar[m['row']];seg=row['segments'][m['segment']];ii=s['signals'][row['signal']]['instance'];expected[ii].append(dict(cohort=ci,member=mi));cv[(ci,mi)]=acounts(seg['bits']['width'],seg['bits']['width'] if co['changed'] else 0)
  need(c['inputMembers']==sum(map(len,expected.values())));ni+=c['inputMembers'];ids=sorted(expected);need([r['instance'] for r in c['instances']]==ids[:len(c['instances'])]);defs=defaultdict(list)
  for row in c['instances']:
   ii=row['instance'];di=s['instances'][ii]['definition'];need(row['definition']==di and row['members']==expected[ii]);definition=s['definitions'][di];need(definition['ref']==s['instances'][ii]['info']['def'] and definition['name']==s['instances'][ii]['info']['defName'] and ii in definition['instances']);need(row['counts']=={k:sum(cv[(m['cohort'],m['member'])][k] for m in row['members']) for k in COUNT_KEYS});defs[di].append(row);nm+=len(row['members'])
  need([x['definition'] for x in c['definitions']]==sorted(defs))
  for row in c['definitions']:need(row['instances']==[x['instance'] for x in defs[row['definition']]] and row['counts']==counts_add(defs[row['definition']]))
  need(c['totals']==counts_add(c['instances'])==counts_add(c['definitions']));nr+=len(c['instances']);nd+=len(c['definitions'])
  if c['state']=='complete':need(c['inputComplete'] and c['sourcesComplete'] and len(c['instances'])==len(expected))
 need((d['inputMembers'],d['instanceRows'],d['definitionRows'],d['members'])==(ni,nr,nd,nm))
 for name,val in [('InputMembers',ni),('Instances',nr),('Definitions',nd),('Members',nm),('Work',d['work'])]:need(val<=d['limits']['max'+name])
 if tr['quality']['completeness']=='partial':partial(d)
def fixture_parents(s,scope):
 infos={x['info']['ref']:x['info'] for x in s['instances']};root=scope['ref'];byname={v['name']:k for k,v in infos.items()};parents={root:None}
 for ref,info in infos.items():
  if ref==root:continue
  # Handwritten W_tree/W_wrap adjacency, never split pathText or count generate segments.
  need(scope['name'] in ['W_tree','grp'],'no unstated fixture topology')
  parents[ref]=(byname['grp'] if scope['name']=='W_tree' and info['name'] in ['p','q'] else root)
 return infos,parents
def hierarchy(d):
 im=d['analysis'];schema(im);impact(im);s=stats(im);need(len(d['comparisons'])==len(im['comparisons']));nr=nm=0
 for c,ic in zip(d['comparisons'],im['comparisons']):
  need(c['scenario']==ic['scenario'] and c['inputRows']==len(ic['instances']) and c['inputComplete']==(ic['state']=='complete') and c['sourcesComplete']==ic['sourcesComplete'])
  if not c['inputCollected']:need(not c['nodes'] and c['totals']==acounts(0,0));continue
  need('scope' in d);infos,parents=fixture_parents(s,d['scope']);need(d['scope']==s['instances'][0]['info']);root=d['scope']['ref'];expected=defaultdict(list);local={};depth={root:0}
  for i,row in enumerate(ic['instances']):
   ref=s['instances'][row['instance']]['info']['ref'];local[ref]=i;cur=ref;seen=set()
   while cur is not None:need(cur not in seen);seen.add(cur);expected[cur].append(i);cur=parents[cur]
  def dep(ref):
   if ref not in depth:depth[ref]=dep(parents[ref])+1
   return depth[ref]
  ordered=sorted(expected,key=lambda ref:infos[ref]['path']);need([n['info']['ref'] for n in c['nodes']]==ordered[:len(c['nodes'])]);published=set()
  for node in c['nodes']:
   ref=node['info']['ref'];need(node['info']==infos[ref] and node['parent']==parents[ref] and node['depth']==dep(ref) and node['local']==local.get(ref));need(node['parent'] is None or node['parent'] in published);published.add(ref);need(node['members']==expected[ref] and node['counts']==counts_add([ic['instances'][i] for i in expected[ref]]));nm+=len(node['members'])
  need(c['totals']==(counts_add(ic['instances']) if root in published else acounts(0,0)));nr+=len(c['nodes'])
  if c['state']=='complete':need(c['inputComplete'] and c['sourcesComplete'] and len(c['nodes'])==len(expected))
 need(d['nodeRows']==nr and d['members']==nm)
 for name,val in [('Queries',d['queries']),('Ancestors',d['ancestorEntries']),('Nodes',nr),('Members',nm),('Work',d['work'])]:need(val<=d['limits']['max'+name])
 if im['quality']['completeness']=='partial':partial(d)
def hmatrix(d):
 h=d['analysis'];schema(h);hierarchy(h);im=h['analysis'];tr=im['analysis'];at=tr['analysis'];de=at['analysis'];m=de['analysis'];s=stats(m);ni=nm=nr=members=0;need(len(d['comparisons'])==len(h['comparisons']))
 for c,hc in zip(d['comparisons'],h['comparisons']):
  j=c['scenario'];need(j==hc['scenario'] and c['inputNodes']==len(hc['nodes']) and c['inputComplete']==(hc['state']=='complete') and c['sourcesComplete']==hc['sourcesComplete'])
  if not c['inputCollected']:need(not c['rows'] and c['inputMembers']==0);continue
  expected=defaultdict(dict);tc=tr['comparisons'][j-1];ic=im['comparisons'][j-1];ar=at['comparisons'][j-1]['rows']
  for nodei,node in enumerate(hc['nodes']):
   # Start from exact original impact members published in this node, not all attribution rows in that instance.
   for ii in node['members']:
    for link in ic['instances'][ii]['members']:
     co=tc['cohorts'][link['cohort']];mem=co['members'][link['member']];seg=ar[mem['row']]['segments'][mem['segment']]
     for source in sorted(set(co['baselineSources'])|set(co['scenarioSources'])):
      role=('retained' if source in co['baselineSources'] and source in co['scenarioSources'] else 'removed' if source in co['baselineSources'] else 'added');tok=(mem['row'],mem['segment']);pair=(source,nodei);value=dict(row=tok[0],segment=tok[1],role=role);need(tok not in expected[pair] or expected[pair][tok]==value);expected[pair][tok]=value
  keys=sorted(expected);need([(r['source'],r['node']) for r in c['rows']]==keys[:len(c['rows'])]);inputmembers=sum(len(x) for x in expected.values());need(c['inputMembers']==inputmembers);ni+=len(hc['nodes']);nm+=inputmembers
  for row,pair in zip(c['rows'],keys):
   exp=[expected[pair][x] for x in sorted(expected[pair])];need(row['members']==exp);left=set();right=set()
   for x in exp:
    rr=ar[x['row']];seg=rr['segments'][x['segment']];b=seg['bits'];need(b['width']<=211 and b['lsb']+b['width']<=211)
    for bit in range(b['lsb'],b['lsb']+b['width']):
     tok=(rr['signal'],bit)
     if x['role']!='added':need(tok not in left);left.add(tok)
     if x['role']!='removed':need(tok not in right);right.add(tok)
   need(row['counts']==dcounts(left,right));members+=len(exp)
  nr+=len(c['rows']);need('totals' not in c,'no misleading global source/subtree total')
  if c['state']=='complete':need(c['inputComplete'] and c['sourcesComplete'] and len(c['rows'])==len(keys))
 need((d['inputNodes'],d['inputMembers'],d['rows'],d['members'])==(ni,nm,nr,members))
 for name,val in [('InputNodes',ni),('InputMembers',nm),('Rows',nr),('Members',members),('Work',d['work'])]:need(val<=d['limits']['max'+name])
 if h['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 if d['algorithm']=='rtl-register-source-impact-v1':impact(d)
 elif d['algorithm']=='rtl-register-source-hierarchy-v1':hierarchy(d)
 elif d['algorithm']=='rtl-register-source-hierarchy-matrix-v1':hmatrix(d)
 else:previousvalidate(d)
I=T+['--source-impact-summary','--recursive'];HIER=I+['--source-hierarchy-summary'];HM=HIER+['--source-hierarchy-matrix']
earlier_validate=validate
DKEYS=['baselineBits','scenarioBits','addedBits','removedBits','retainedBits']
def ranges_report(d):
 hm=d['analysis'];schema(hm);hmatrix(hm);at=hm['analysis']['analysis']['analysis']['analysis'];nr=ns=ng=nm=0
 need(len(d['comparisons'])==len(hm['comparisons']))
 for c,mc in zip(d['comparisons'],hm['comparisons']):
  need(c['scenario']==mc['scenario'] and c['inputRows']==len(mc['rows']) and c['inputComplete']==(mc['state']=='complete') and c['sourcesComplete']==mc['sourcesComplete']);need([r['matrixRow'] for r in c['rows']]==list(range(len(c['rows']))));ar=at['comparisons'][c['scenario']-1]['rows']
  for row in c['rows']:
   original=mc['rows'][row['matrixRow']];expected=defaultdict(lambda:dict(added=set(),removed=set(),retained=set(),members=[]))
   for mi,m in enumerate(original['members']):
    rr=ar[m['row']];seg=rr['segments'][m['segment']];bb=seg['bits'];need(bb['width']<=211 and bb['lsb']+bb['width']<=211);z=expected[rr['signal']];z[m['role']].update(range(bb['lsb'],bb['lsb']+bb['width']));z['members'].append(mi)
   need([x['signal'] for x in row['signals']]==sorted(expected))
   for x in row['signals']:
    z=expected[x['signal']];need(all(points(x[k])==z[k] for k in ['added','removed','retained']) and x['members']==z['members'],'coalescing keeps every original proof');need(x['counts']==dcounts(z['removed']|z['retained'],z['added']|z['retained']));ng+=sum(len(x[k]) for k in ['added','removed','retained']);nm+=len(x['members'])
   need({k:sum(x['counts'][k] for x in row['signals']) for k in DKEYS}==original['counts']);ns+=len(row['signals'])
  nr+=len(c['rows'])
  if c['state']=='complete':need(c['inputComplete'] and c['sourcesComplete'] and len(c['rows'])==len(mc['rows']))
 need((d['rows'],d['signals'],d['ranges'],d['members'])==(nr,ns,ng,nm))
 for name,v in [('Rows',nr),('Signals',ns),('Ranges',ng),('Members',nm),('Work',d['work'])]:need(v<=d['limits']['max'+name])
 if hm['quality']['completeness']=='partial':partial(d)
def selection(d):
 r=d['analysis'];schema(r);ranges_report(r);q=d['query'];ci=q['scenario']-1;rc=r['comparisons'][ci];hm=r['analysis'];mc=hm['comparisons'][ci];h=hm['analysis'];at=h['analysis']['analysis']['analysis'];ar=at['comparisons'][ci]['rows'];expected=[]
 need(d['inputRows']==len(rc['rows']) and d['inputComplete']==(rc['state']=='complete') and d['sourcesComplete']==rc['sourcesComplete']);need(0<=d['visitedRows']<=len(rc['rows']))
 for ri,row in enumerate(rc['rows']):
  original=mc['rows'][row['matrixRow']];node=h['comparisons'][ci]['nodes'][original['node']]['info']['pathText']
  if 'source' in q and original['source']!=q['source'] or 'node' in q and node!=q['node']:continue
  for si,x in enumerate(row['signals']):
   if 'signal' in q and x['signal']!=q['signal']:continue
   sets={k:(points(x[k]) if 'role' not in q or k==q['role'] else set()) for k in ['added','removed','retained']}
   if 'bits' in q:
    low=q['bits']['lsb'];end=low+q['bits']['width'];need(0<q['bits']['width'] and end<=2**64-1)
    sets={k:{b for b in v if low<=b<end} for k,v in sets.items()}
   if not any(sets.values()):continue
   members=[]
   for mi in x['members']:
    m=original['members'][mi];seg=ar[m['row']]['segments'][m['segment']];bb=seg['bits'];proof=set(range(bb['lsb'],bb['lsb']+bb['width']))
    if proof & sets[m['role']]:members.append(mi)
   expected.append((ri,si,x['signal'],sets,members))
 need([(x['rangeRow'],x['rangeSignal']) for x in d['rows']]==[(x[0],x[1]) for x in expected[:len(d['rows'])]])
 for row,ex in zip(d['rows'],expected):
  v=row['value'];need(v['signal']==ex[2] and v['members']==ex[4] and all(points(v[k])==ex[3][k] for k in ['added','removed','retained']),'role/window intersection and exact surviving proofs');need(v['counts']==dcounts(ex[3]['removed']|ex[3]['retained'],ex[3]['added']|ex[3]['retained']))
 ng=sum(len(x['value'][k]) for x in d['rows'] for k in ['added','removed','retained']);nm=sum(len(x['value']['members']) for x in d['rows']);need((d['ranges'],d['members'])==(ng,nm))
 for name,v in [('Rows',len(d['rows'])),('Ranges',ng),('Members',nm),('Work',d['work'])]:need(v<=d['limits']['max'+name])
 if d['quality']['completeness']=='complete':need(len(d['rows'])==len(expected) and d['visitedRows']==len(rc['rows']))
 if r['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 if d['algorithm']=='rtl-register-source-hierarchy-ranges-v1':ranges_report(d)
 elif d['algorithm']=='rtl-register-source-range-selection-v1':selection(d)
 else:earlier_validate(d)
R=HM+['--source-hierarchy-ranges'];Q=R+['--select-source-ranges']
# B55: finite original-fact intersections and independent physical byte windows.
import hashlib,bisect
prior_validate=validate
E=Q+['--explain-source-ranges'];L=E+['--locate-source-evidence'];X=L+['--source-evidence-excerpts']
def interval(b):return set(range(b['lsb'],b['lsb']+b['width']))
def br(v):return dict(lsb=min(v),width=len(v))
def evidence(d):
 sel=d['analysis'];selection(sel);s=stats(sel);r=sel['analysis'];hm=r['analysis'];h=hm['analysis'];at=h['analysis']['analysis']['analysis'];matrix=at['analysis']['analysis'];ci=sel['query']['scenario']-1;dictionary=[];expected=[];proofn=contextn=entryn=0
 need(d['snapshotId']==s['snapshot']['snapshotId'] and d['scope']==s['scope'] and d['query']==sel['query']);need(d['inputRows']==len(sel['rows']) and d['inputComplete']==(sel['quality']['completeness']=='complete') and d['sourcesComplete']==sel['sourcesComplete'])
 for ri,selected in enumerate(sel['rows'][:len(d['rows'])]):
  rr=r['comparisons'][ci]['rows'][selected['rangeRow']];mr=hm['comparisons'][ci]['rows'][rr['matrixRow']];sig=selected['value']['signal'];ss=s['signals'][sig];proofs=[]
  for mi in selected['value']['members']:
   member=mr['members'][mi];segment=at['comparisons'][ci]['rows'][member['row']]['segments'][member['segment']];inter=interval(segment['bits'])&points(selected['value'][member['role']]);need(inter);contexts=[]
   for scen in ([0] if member['role']=='removed' else [ci+1] if member['role']=='added' else [0,ci+1]):
    gi=matrix['rows'][mr['source']]['groups'][scen];group=matrix['scenarios'][scen]['sources']['groups'][gi];fs=next(z['facts'] for z in group['signals'] if z['signal']==sig);entries=[]
    for fi in fs:
     overlap=inter&set(bits(s,fi))
     if not overlap:continue
     if fi not in dictionary:dictionary.append(fi)
     entries.append(dict(fact=dictionary.index(fi),bits=br(overlap)))
    need(entries);contexts.append(dict(scenario=scen,group=gi,facts=entries));entryn+=len(entries)
   proofs.append(dict(member=mi,role=member['role'],bits=br(inter),contexts=contexts));contextn+=len(contexts)
  proofn+=len(proofs);expected.append(dict(selectionRow=ri,source=matrix['rows'][mr['source']]['source'],node=h['comparisons'][ci]['nodes'][mr['node']]['info'],owner=s['instances'][ss['instance']]['info'],signal=ss['object'],proofs=proofs))
 need(d['rows']==expected,'original group/fact/proof/metadata identity');need(d['facts']==[dict(fact=i,info=fact(s,i)) for i in dictionary],'first-use raw fact dictionary; no rewritten raw bits');need((d['proofs'],d['contexts'],d['factEntries'])==(proofn,contextn,entryn))
 for n,v in [('Rows',len(d['rows'])),('Proofs',proofn),('Facts',entryn),('Work',d['work'])]:need(v<=d['limits']['max'+n])
 if d['quality']['completeness']=='complete':need(len(d['rows'])==len(sel['rows']))
 if sel['quality']['completeness']=='partial':partial(d)
def physical(span):
 p=Path(span['path']).resolve();need(p in [H/'design.sv',H/'leaf.svh'],'only own physical inputs');data=p.read_bytes();need(span['contentHash']==hashlib.sha256(data).hexdigest());a,b=span['start']['offset'],span['end']['offset'];need(0<=a<b<=len(data));data[:a].decode('utf8');data[:b].decode('utf8')
 for pos in [span['start'],span['end']]:
  offset=pos['offset'];need(pos['line']==data[:offset].count(b'\n')+1 and pos['column']==offset-(data.rfind(b'\n',0,offset)+1)+1)
 return data
 def_unused=None
def locations(d):
 e=d['analysis'];evidence(e);need(d['snapshotId']==e['snapshotId'] and d['scope']==e['scope'] and d['query']==e['query']);need(d['inputFacts']==len(e['facts']) and d['inputComplete']==(e['quality']['completeness']=='complete') and d['sourcesComplete']==e['sourcesComplete']);keys=[];expected=[]
 for i,f in enumerate(e['facts'][:len(d['rows'])]):
  info=f['info'];ix=[]
  for ref,kind in [(info['signal'],'definition'),(info['process'],'statement')]:
   k=(ref,kind)
   if k not in keys:keys.append(k)
   ix.append(keys.index(k))
  expected.append(dict(fact=i,statisticsFact=f['fact'],ref=info['ref'],inst=info['inst'],signalLocation=ix[0],processLocation=ix[1]))
 need(d['rows']==expected and [(x['ref'],x['kind']) for x in d['locations']]==keys);need(d['missing']==0)
 for loc in d['locations']:
  need(loc['status']=='located');physical(loc['span'])
 need(d['queries']>=1+len(keys) and d['work']>=3*len(d['rows']))
 if d['quality']['completeness']=='complete':need(len(d['rows'])==len(e['facts']) and d['queries']==1+len(keys) and d['work']==3*len(d['rows']))
 for n,v in [('Facts',len(d['rows'])),('Locations',len(keys)),('Queries',d['queries']),('Work',d['work'])]:need(v<=d['limits']['max'+n])
 if e['quality']['completeness']=='partial':partial(d)
def window(span,data,context):
 lines=data.splitlines(keepends=True);starts=[0]
 for line in lines:starts.append(starts[-1]+len(line))
 a=bisect.bisect_right(starts,span['start']['offset'])-1;b=bisect.bisect_right(starts,span['end']['offset']-1)-1;lo=max(0,a-context);hi=min(len(lines),b+1+context)
 return starts[lo],starts[hi],lo+1,b''.join(lines[lo:hi]).decode('utf8')
def excerpts(d):
 l=d['analysis'];locations(l);need(d['snapshotId']==l['snapshotId'] and d['scope']==l['scope'] and d['query']==l['query']);need(d['inputLocations']==len(l['locations']) and d['inputComplete']==(l['quality']['completeness']=='complete') and d['sourcesComplete']==l['sourcesComplete']);files=[];snips=[];rows=[]
 for i,loc in enumerate(l['locations'][:len(d['rows'])]):
  span=loc['span'];data=physical(span);f=dict(file=span['file'],path=span['path'],snapshotHash=span['contentHash'],state='read',contentHash=span['contentHash'],matchesSnapshot=True)
  if f not in files:files.append(f)
  fi=files.index(f);a,b,line,text=window(span,data,d['limits']['contextLines']);sn=dict(file=fi,startOffset=a,endOffset=b,startLine=line,text=text)
  if sn not in snips:snips.append(sn)
  rows.append(dict(location=i,state='available',file=fi,snippet=snips.index(sn)))
 need(d['files']==files and d['snippets']==snips and d['rows']==rows,'exact LF/CRLF UTF8 windows and unique dictionaries');need(d['bytes']==sum(len(x['text'].encode()) for x in snips));need(d['cachedBytes']==sum(Path(f['path']).stat().st_size for f in files));need(d['queries']>=1+len(files) and d['readBytes']>=d['cachedBytes'])
 for n,v in [('Locations',len(rows)),('Files',len(files)),('Bytes',d['bytes']),('CachedBytes',d['cachedBytes']),('Queries',d['queries']),('Work',d['work'])]:need(v<=d['limits']['max'+n])
 need(all(len(x['text'].encode())<=d['limits']['maxSnippetBytes'] for x in snips))
 if d['quality']['completeness']=='complete':need(len(rows)==len(l['locations']) and d['queries']==1+len(files) and d['readBytes']==d['cachedBytes'])
 if l['quality']['completeness']=='partial':partial(d)
def validate(d):
 schema(d)
 if 'error' in d:return
 alg=d['algorithm']
 if alg=='rtl-register-source-range-evidence-v1':evidence(d)
 elif alg=='rtl-source-evidence-locations-v1':locations(d)
 elif alg=='rtl-source-evidence-excerpts-v1':excerpts(d)
 else:prior_validate(d)

# New finite composition checks; all ordinary reports still pass the original B55 oracle.
def signature(d):
 return dict(quality=d['quality']['completeness'],query=d['query'],rows=d['rows'],snippets=d['snippets'],counts=[d[k] for k in ['queries','readBytes','cachedBytes','bytes']],evidenceFacts=[(f['fact'],f['info']['bits']) for f in d['analysis']['analysis']['facts']])
@test('I01 shortcut and explicit chain preserve original proof and bytes')
def _():
 x=call('W_tree',X,sc('W_tree',(0,1,0)));y=call('W_tree',['--inspect-register-sources','--recursive'],sc('W_tree',(0,1,0)));need(signature(x)==signature(y))
@test('I02 shortcut selectors and explicit flags independent of option order')
def _():
 args=sc('W_tree')+['--select-node','W_tree','--select-role','retained','--select-lsb','0','--select-width','1']
 x=call('W_tree',X,args);y=call('W_tree',['--inspect-register-sources',*X],args);need(signature(x)==signature(y))
@test('I03 six stage partial budgets stay partial')
def _():
 for cap in ['--max-statistics-facts','--max-source-hierarchy-range-rows','--max-source-selection-rows','--max-source-evidence-facts','--max-source-location-locations','--max-source-excerpt-bytes']:
  d=call('W_tree',['--inspect-register-sources','--recursive'],sc('W_tree')+[cap,'1','--require-complete'],code=4);partial(d)
@test('I04 invalid combinations and second-context error')
def _():
 for flags,extra in [(['--inspect-register-sources'],[]),(['--inspect-register-sources','--inspect-register-sources'],sc('W_tree')),(['--inspect-register-sources'],sc('W_tree')+['--select-scenario','0']),(['--inspect-register-sources'],sc('W_tree')+['--max-source-excerpt-bytes','0'])]:call('W_tree',flags,extra,code=2)
 call('W_tree',['--inspect-register-sources'],['--scenario','A','--scenario','B','--input-value','missing','0','1'],code=3)
catSchema=json.loads((P/'analysis/objects/object-catalog.schema.json').read_text());catValidator=Draft202012Validator(catSchema,registry=registry)
def oc(top='K_top',extra=(),scope=None,code=0):
 argv=[a.objects,'--top',top,'--scope',scope or top,str(H/'catalog.sv'),*extra];name=f'cli-{len(calls):03d}';start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic()
 try:r=subprocess.run(argv,capture_output=True,timeout=90)
 except FileNotFoundError as e:raise AssertionError('Object CLI absent at baseline: '+a.objects) from e
 c=dict(argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=code,stdout=name+'.stdout',stderr=name+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);(O/(name+'.command.json')).write_text(json.dumps(c,indent=2)+'\n');calls.append(c);need(r.returncode==code,f'objects exit{r.returncode}, expected{code}');d=json.loads(r.stdout);catValidator.validate(d)
 if 'error' not in d:
  need(d['algorithm']=='rtl-object-catalog-v1' and d['queries']<=d['request']['limits']['maxQueries']);need(len(d['objects'])<=d['request']['limits']['maxObjects'] and len(d['instances'])<=d['request']['limits']['maxInstances']);seen=set()
  for v in d['objects']:
   need(v['instance']<len(d['instances']) and v['object']['ref'] not in seen);seen.add(v['object']['ref']);inst=d['instances'][v['instance']]['info'];need(v['kind']=='instance' or v['object']['inst']==inst['ref'])
   if v['kind']=='instance':need(v['object']['ref']==inst['ref'])
   else:need(v[v['kind']]['ref']==v['object']['ref'])
 return d
def objsig(d):return [(x['kind'],x['object']['pathText'],x.get('port',x.get('signal',{})).get('width'),x.get('port',{}).get('direction')) for x in d['objects']]
def closed(d):
 expected={('K_top',),('K_top','left'),('K_top','right'),('K_top','odd.name'),('K_top','group[0]','gen'),('K_top','group[1]','gen'),('K_top','left','x')};need({tuple(i['info']['path']) for i in d['instances']}==expected)
 need(d['complete'] and len(d['objects'])==60 and Counter(x['kind'] for x in d['objects'])==dict(instance=7,port=21,signal=32));need(tuple(d['instances'][-1]['info']['path'])==('K_top','left','x'),'BFS grandchild last')
 for i,inst in enumerate(d['instances']):
  path=tuple(inst['info']['path']);leaf=inst['info']['defName']=='K_leaf';width=2 if path==('K_top','group[0]','gen') else 3;expectedNames={'a','y','z'}|({'lane','state'} if leaf else {'mid'} if path==('K_top',) else set());rows=[x for x in d['objects'] if x['instance']==i];need([x['kind'] for x in rows]==['instance']+['port']*3+['signal']*len(expectedNames));need({x['signal']['name'] for x in rows if x['kind']=='signal'}==expectedNames)
  for x in rows:
   if x['kind']=='port':p=x['port'];need(p['width']==(1 if p['name']=='z' else width));need(p['direction']==dict(a='in',y='out',z='inout')[p['name']])
   if x['kind']=='signal':p=x['signal'];need(p['width']==(1 if p['name']=='z' else 2 if p['name']=='state' else width+1 if p['name']=='lane' else width))
@test('O01 closed declaration object sets and metadata')
def _():
 d=oc();need(d['complete'] and len(d['instances'])==1 and len(d['objects'])==8);closed(oc(extra=['--recursive']))
@test('O02 pagination preserves order and shared occurrence identities')
def _():
 outputs=[oc(extra=['--recursive','--page-size',str(i)]) for i in [1,2,2000]]
 for d in outputs:closed(d)
 need(all(objsig(d)==objsig(outputs[0]) for d in outputs))
@test('O03 literal text and kinds filter objects only')
def _():
 base=oc(extra=['--recursive'])
 for text in ['gen','*','K_top.left','A']:
  d=oc(extra=['--recursive','--text',text]);need(len(d['instances'])==7 and d['complete']);need(objsig(d)==objsig({**base,'objects':[x for x in base['objects'] if text in x['object']['name'] or text in x['object']['pathText']]}))
 d=oc(extra=['--recursive','--kind','signal','--kind','port']);need(objsig(d)==objsig({**base,'objects':[x for x in base['objects'] if x['kind']!='instance']}))
@test('O04 subtree scope and not-found errors')
def _():
 d=oc(scope='K_top.left',extra=['--recursive']);need(d['complete'] and len(d['instances'])==2 and len(d['objects'])==16);oc(scope='not_found',code=3)
@test('O05 admission caps preserve complete row prefix and exact limit')
def _():
 full=oc(extra=['--recursive']);d=oc(extra=['--recursive','--max-objects','5','--require-complete'],code=4);need(objsig(d)==objsig(full)[:5]);need(oc(extra=['--recursive','--max-objects','60'])['complete']);d=oc(extra=['--recursive','--text','*','--max-objects','1']);need(d['complete'] and not d['objects'])
 for flag,value in [('--max-instances','1'),('--max-queries','3'),('--max-work','1')]:
  d=oc(extra=['--recursive',flag,value,'--require-complete'],code=4);need(not d['complete'] and d['reasons']);need(objsig(d)==objsig(full)[:len(d['objects'])])
@test('O06 invalid kind, scalar text, scope and numeric bounds')
def _():
 for args in [['--kind','port','--kind','port'],['--kind','net'],['--max-objects','0'],['--max-queries','2'],['--page-size','2001'],['--text','x'*4097],['--scope','']]:oc(extra=args,code=2)
@test('O07 opaque internals remain partial but known skeleton can complete')
def _():
 d=oc('K_opaque',extra=['--recursive','--require-complete'],code=4);need(not d['complete'] and 'opaque_instance' in d['reasons']);bb=[i for i in d['instances'] if i['info']['kind']=='blackbox'];need(len(bb)==1 and not bb[0]['objectsComplete'] and bb[0]['signalStatus']['status']=='partial');need(oc('K_opaque',extra=['--recursive','--kind','instance','--kind','port'])['complete'])
@test('O08 complete empty requested domain and repeat')
def _():
 d=oc('K_empty',extra=['--kind','signal']);need(d['complete'] and not d['objects'] and len(d['instances'])==1);need(oc()['complete'])
summary=dict(planned=12,executed=len(cases),passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases),skipped=0,cases=cases,calls=calls)
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped','cases']},ensure_ascii=False));raise SystemExit(1 if summary['failed'] else 0)
