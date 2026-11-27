#!/usr/bin/env python3
"""B55 minimal C-S2-10-01 regression: physical startLine agrees with original byte offset.
Oracle: DESIGN6.10.3 physical newline rules + SourceSpan/7.5.29 metadata meaning.
7.5.29 LF-only window extent conflicts with Core physical lines; exact CR window extent
is deliberately not decided here. Existing 12-group freeze remains unchanged.
"""
import argparse,bisect,datetime,hashlib,json,re,subprocess,time,traceback
from pathlib import Path
from referencing import Registry,Resource
from jsonschema import Draft202012Validator
ap=argparse.ArgumentParser();ap.add_argument('--binary',required=True);ap.add_argument('--product',required=True);ap.add_argument('--out',required=True);a=ap.parse_args();O=Path(a.out);O.mkdir(parents=True,exist_ok=False);P=Path(a.product);H=Path(__file__).resolve().parent
# Use original B-owned overlap module, not C's fixture or output.
original=(H/'design.sv').read_bytes();body=re.search(rb'(?m)^module T_overlap.*?^endmodule',original,re.S).group(0);lines=[b'// B55 physical coordinates',b'',*body.replace(b'\r\n',b'\n').split(b'\n')]
flags=['--register-statistics','--register-event-groups','--register-control-profile','--logic','--register-resolved-events','--compare-register-scenarios','--compare-register-generation','--compare-register-sources','--source-coverage-deltas','--source-bit-attribution','--source-transition-cohorts','--source-impact-summary','--recursive','--source-hierarchy-summary','--source-hierarchy-matrix','--source-hierarchy-ranges','--select-source-ranges','--explain-source-ranges','--locate-source-evidence','--source-evidence-excerpts','--scenario','BASE','--scenario','REPEAT','--source-excerpt-context-lines','0','--require-complete']
resources=[];root=None
for path in [P/'protocol/schema/hier.schema.json',*sorted((P/'analysis/sequential').glob('*report.schema.json'))]:
 d=json.loads(path.read_text());resources.append((d['$id'],Resource.from_contents(d)))
 if d.get('$defs',{}).get('Report',{}).get('properties',{}).get('algorithm',{}).get('const')=='rtl-source-evidence-excerpts-v1':root=d
validator=Draft202012Validator(root,registry=Registry().with_resources(resources));cases=[];calls=[]
for name,seps in [('lf',[b'\n']),('crlf',[b'\r\n']),('cr',[b'\r']),('mixed',[b'\r',b'\n',b'\r\n'])]:
 raw=b''.join(line+(seps[i%len(seps)] if i+1<len(lines) else b'') for i,line in enumerate(lines));fixture=O/(name+'.sv');fixture.write_bytes(raw);starts=[0,*[m.end() for m in re.finditer(rb'\r\n|\r|\n',raw)]];argv=[a.binary,'--top','T_overlap','--scope','T_overlap',str(fixture),*flags];start=datetime.datetime.now().astimezone().isoformat();t=time.monotonic();r=subprocess.run(argv,capture_output=True,timeout=90);cmd=dict(name=name,argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t,exit=r.returncode,expectedExit=0,stdout=name+'.stdout',stderr=name+'.stderr',inputSha256=hashlib.sha256(raw).hexdigest());(O/cmd['stdout']).write_bytes(r.stdout);(O/cmd['stderr']).write_bytes(r.stderr);(O/(name+'.command.json')).write_text(json.dumps(cmd,indent=2)+'\n');calls.append(cmd);case=dict(id=name,passed=False,violations=[])
 try:
  assert r.returncode==0,'product must accept valid source and require-complete';d=json.loads(r.stdout);validator.validate(d);assert d['quality']['completeness']=='complete' and d['rows'] and d['snippets'],'positive complete domain';locs=d['analysis']['locations']
  for loc in locs:
   span=loc['span'];assert span['contentHash']==hashlib.sha256(raw).hexdigest()
   for point in [span['start'],span['end']]:
    idx=bisect.bisect_right(starts,point['offset'])-1;assert point['line']==idx+1 and point['column']==point['offset']-starts[idx]+1,'original Core SourcePos must agree with raw bytes'
  for i,sn in enumerate(d['snippets']):
   assert 0<=sn['startOffset']<sn['endOffset']<=len(raw) and sn['text'].encode()==raw[sn['startOffset']:sn['endOffset']],'original bytes retained';expected=bisect.bisect_right(starts,sn['startOffset'])
   if sn['startLine']!=expected:case['violations'].append(dict(snippet=i,startOffset=sn['startOffset'],endOffset=sn['endOffset'],actualStartLine=sn['startLine'],expectedStartLine=expected))
  case.update(rows=len(d['rows']),snippets=len(d['snippets']),bytes=len(raw),schemaValid=True,coreCoordinatesValid=True,passed=not case['violations'])
 except Exception as e:case.update(error=str(e),traceback=traceback.format_exc())
 cases.append(case)
summary=dict(planned=4,executed=len(cases),passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases),skipped=0,cases=cases,calls=calls,scope='Only same-original-byte offset/startLine consistency, context0; exact CR window policy remains a DESIGN ambiguity. C execution and implementation are not oracle.')
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped','cases']},ensure_ascii=False));raise SystemExit(1 if summary['failed'] else 0)
