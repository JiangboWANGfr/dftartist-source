#!/usr/bin/env python3
"""Minimal public counterpart to existing deterministic empty-prefix producer regression."""
import argparse,datetime,json,subprocess,time
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();P=Path(a.product);O=Path(a.out);O.mkdir(exist_ok=False,parents=True);H=Path(__file__).resolve().parent;resources=[];schemas=[]
for p in [P/'protocol/schema/hier.schema.json',*sorted((P/'analysis/sequential').glob('*report.schema.json'))]:
 d=json.loads(p.read_text());resources.append((d['$id'],Resource.from_contents(d)))
 if p.name!='hier.schema.json':schemas.append(d)
reg=Registry().with_resources(resources);vs={s['$defs']['Report']['properties']['algorithm']['const']:Draft202012Validator(s,registry=reg) for s in schemas}
base=[a.binary,'--top','E_wide','--scope','E_wide.row[3071].r',str(H/'empty-prefix-wide.sv'),'--register-statistics','--max-statistics-millis','1','--require-complete']
t=['--register-event-groups','--register-control-profile','--logic','--register-resolved-events','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--scenario','A','--scenario','B'];calls=[]
for name,flags in [('statistics',[]),('impact',t),('hierarchy',t+['--source-hierarchy-summary']),('matrix',t+['--source-hierarchy-summary','--source-hierarchy-matrix'])]:
 argv=base+flags;start=datetime.datetime.now().astimezone().isoformat();tick=time.monotonic();r=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90);c=dict(name=name,argv=argv,cwd=str(Path.cwd()),start=start,end=datetime.datetime.now().astimezone().isoformat(),seconds=time.monotonic()-tick,exit=r.returncode,allowedExits=[0,4],stdout=name+'.stdout',stderr=name+'.stderr');(O/c['stdout']).write_bytes(r.stdout);(O/c['stderr']).write_bytes(r.stderr);doc=json.loads(r.stdout);vs['rtl-structural-control-v1' if 'error' in doc else doc['algorithm']].validate(doc);c['expectedPolicy']='complete/exit0 or partial/exit4, never BadRequest for this valid scope';c['passed']='error' not in doc and r.returncode==(4 if doc['quality']['completeness']=='partial' else 0);c['error']=doc.get('error');st=doc
 while 'analysis' in st:st=st['analysis']
 c['statisticsInstances']=len(st['instances']) if 'instances' in st else None;c['statisticsQuality']=st.get('quality');calls.append(c);(O/(name+'.command.json')).write_text(json.dumps(c,indent=2)+'\n')
summary=dict(planned=4,executed=4,passed=sum(c['passed'] for c in calls),failed=sum(not c['passed'] for c in calls),skipped=0,calls=calls,scope='Public 1ms budget reproduction is bounded wall-clock evidence, not a guaranteed timing oracle. Exact legal empty prefix is established separately by existing deterministic producer; no repeats or sleep.')
(O/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=True));raise SystemExit(0 if summary['failed']==0 else 1)
