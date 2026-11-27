#!/usr/bin/env python3
"""B53 finite member/bit-set oracle; earlier B51/B52 verifier prefix preserved, old files unchanged."""
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
@test('I01 five state instances and two definitions retain18 unique bits')
def _():
 d=call('W_tree',I,sc('W_tree',(0,1,0)));c=d['comparisons'][0];need(len(c['instances'])==5 and len(c['definitions'])==2 and c['totals']==acounts(18,16));need(sorted((len(x['instances']),x['counts']['coveredBits']) for x in c['definitions'])==[(1,2),(4,16)]);need(d['comparisons'][1]['totals']==acounts(18,0))
@test('I02 many source roles never duplicate original state bits')
def _():
 d=call('V_sets',I,sc('V_sets'));need(d['comparisons'][0]['totals']==acounts(8,8) and len(d['comparisons'][0]['instances'])==1)
@test('I03 collection and atomic instance-definition budgets')
def _():
 for name in ['instances','definitions','members','input-members','work']:
  d=call('W_tree',I,sc('W_tree')+['--max-source-impact-'+name,'1','--require-complete'],code=4)
  if name=='input-members':need(not d['comparisons'][0]['inputCollected'] and d['inputMembers']==0)
@test('I04 original cohort-prefix domain is not rebuilt')
def _():call('W_tree',I,sc('W_tree')+['--max-source-transition-cohorts','1','--require-complete'],code=4)
@test('I05 empty and unknown evidence remain distinct')
def _():
 call('T_empty',I,['--scenario','A','--scenario','B']);d=call('T_partial',I,sc('T_partial',(0,0))+['--require-complete'],code=4);need(not d['comparisons'][0]['instances'] and not d['comparisons'][0]['sourcesComplete'])
@test('H01 true parents and generate/escaped nodes depth')
def _():
 d=call('W_tree',HIER,sc('W_tree'));c=d['comparisons'][0];need(len(c['nodes'])==6 and c['totals']==acounts(18,16));ns={x['info']['name']:x for x in c['nodes']};need(ns['tail']['depth']==ns['edge.case']['depth']==1 and ns['p']['depth']==ns['q']['depth']==2 and ns['grp']['local'] is None)
@test('H02 local scope excludes external ancestors')
def _():
 d=call('W_tree',HIER,sc('W_tree'),scope='W_tree.grp');need(len(d['comparisons'][0]['nodes'])==3 and d['comparisons'][0]['totals']==acounts(8,8) and d['comparisons'][0]['nodes'][0]['parent'] is None)
@test('H03 topology cache independent of number of static contexts')
def _():
 d=call('W_tree',HIER,sc('W_tree'));e=call('W_tree',HIER,sc('W_tree',tuple(i%2 for i in range(8))));need(d['queries']==e['queries'] and d['ancestorEntries']==e['ancestorEntries'])
@test('H04 navigation and whole-node prefixes; root totals kept when children capped')
def _():
 for name in ['queries','ancestors','nodes','members','work']:
  d=call('W_tree',HIER,sc('W_tree')+['--max-source-hierarchy-'+name,'1','--require-complete'],code=4)
  if name=='nodes':need(len(d['comparisons'][0]['nodes'])==1 and d['comparisons'][0]['totals']==acounts(18,16))
  if name=='members':need(not d['comparisons'][0]['nodes'] and d['comparisons'][0]['totals']==acounts(0,0))
@test('H05 empty/unknown has no invented zero nodes')
def _():
 call('T_empty',HIER,['--scenario','A','--scenario','B']);d=call('T_partial',HIER,sc('T_partial',(0,0))+['--require-complete'],code=4);need(not d['comparisons'][0]['nodes'])
@test('M01 source-node rows preserve whole root18/2 and descendants')
def _():
 d=call('W_tree',HM,sc('W_tree',(0,1,0)));need(len(d['comparisons'][0]['rows'])==12 and len(d['comparisons'][1]['rows'])==6);root=[r['counts'] for r in d['comparisons'][0]['rows'] if r['node']==0];need(sorted((x['baselineBits'],x['scenarioBits'],x['addedBits'],x['removedBits'],x['retainedBits']) for x in root)==[(0,16,16,0,0),(18,2,0,16,2)])
@test('M02 retained source remains retained inside globally changed segment')
def _():
 d=call('V_sets',HM,sc('V_sets'));rows=d['comparisons'][0]['rows'];need(len(rows)==3 and any(r['counts']==dict(baselineBits=8,scenarioBits=8,addedBits=0,removedBits=0,retainedBits=8) for r in rows))
@test('M03 only original node/instance/cohort prefixes contribute')
def _():
 d=call('W_tree',HM,sc('W_tree')+['--max-source-hierarchy-nodes','1','--require-complete'],code=4);need(len(d['comparisons'][0]['rows'])==2)
 call('W_tree',HM,sc('W_tree')+['--max-source-transition-cohorts','1','--require-complete'],code=4)
@test('M04 collection and complete pair budgets are atomic')
def _():
 for name in ['rows','members','input-nodes','input-members','work']:
  d=call('W_tree',HM,sc('W_tree')+['--max-source-hierarchy-matrix-'+name,'1','--require-complete'],code=4)
  if name in ['input-nodes','input-members']:need(not d['comparisons'][0]['inputCollected'] and d['inputNodes']==d['inputMembers']==0)
@test('M05 empty eight-context and partial inputs do not imply full coverage')
def _():
 call('T_empty',HM,[x for i in range(8) for x in ['--scenario',str(i)]]);call('T_partial',HM,sc('T_partial',(0,0))+['--require-complete'],code=4)
@test('X01 flags missing dependencies and unenabled budgets')
def _():
 for flags,extra in [(T,['--source-hierarchy-summary']),(I,['--source-hierarchy-matrix']),(T,['--max-source-impact-work','1']),(I,['--max-source-hierarchy-work','1']),(HIER,['--max-source-hierarchy-matrix-work','1'])]:call('T_empty',flags,['--scenario','A','--scenario','B',*extra],code=2)
@test('X02 zero/overmaximum budgets rejected')
def _():
 for flags,prefix,n in [(I,'impact','definitions'),(I,'impact','input-members'),(HIER,'hierarchy','queries'),(HIER,'hierarchy','ancestors'),(HM,'hierarchy-matrix','input-nodes'),(HM,'hierarchy-matrix','members')]:call('T_empty',flags,['--scenario','A','--scenario','B','--max-source-'+prefix+'-'+n,'0'],code=2)
 for flags,prefix in [(I,'impact'),(HIER,'hierarchy'),(HM,'hierarchy-matrix')]:call('T_empty',flags,['--scenario','A','--scenario','B','--max-source-'+prefix+'-millis','60001'],code=2)
@test('X03 second context error duplicate and malformed UTF8 name')
def _():
 call('W_tree',HM,['--scenario','A','--scenario','B','--input-value','missing','0','1'],code=3);call('W_tree',HM,['--scenario','A','--scenario','A'],code=2);call('W_tree',HM,['--scenario','A','--scenario','bad\udcff'],code=2)
@test('X04 old transitions and all nested new strict formats')
def _():
 for flags in [T,I,HIER,HM]:call('V_sets',flags,sc('V_sets')+['--fail-on-error'])
@test('X05 missing scope and global static values preserve error policy')
def _():
 call('W_tree',HM,sc('W_tree'),scope='missing',code=3);call('W_tree',I,['--input-value','W_tree.mode','0','0','--scenario','A','--scenario','B'],code=2)
summary=dict(planned=20,executed=len(cases),passed=sum(x['passed'] for x in cases),failed=sum(not x['passed'] for x in cases),skipped=0,cases=cases,calls=calls)
(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['calls','cases']}));raise SystemExit(0 if summary['passed']==20 else 1)
