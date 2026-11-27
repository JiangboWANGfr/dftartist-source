#!/usr/bin/env python3
"""B56 C-S2-10-01 clarified physical whole-line windows.
Oracle: DESIGN6.10.3 physical newline rules + SourceSpan/7.5.29 metadata meaning.
DESIGN7.5.29 now specifies CRLF/CR/LF physical windows. Original B55 remains unchanged.
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

for style,seps in [('lf',[b'\n']),('crlf',[b'\r\n']),('cr',[b'\r']),('mixed',[b'\r',b'\n',b'\r\n'])]:
 for final in [False,True]:
  raw=b''.join(line+(seps[i%len(seps)] if i+1<len(lines) or final else b'') for i,line in enumerate(lines));fixture=O/(style+str(int(final))+'.sv');fixture.write_bytes(raw);boundaries=[0,*[m.end() for m in re.finditer(rb'\r\n|\r|\n',raw)]]
  # Non-empty physical lines, including their delimiter; an EOF empty line has no bytes to include.
  if boundaries[-1]!=len(raw):boundaries.append(len(raw))
  for context in [0,1,2]:
   name=f'{style}-{int(final)}-{context}';args=flags.copy();args[args.index('--source-excerpt-context-lines')+1]=str(context);argv=[a.binary,'--top','T_overlap','--scope','T_overlap',str(fixture),*args];start=datetime.datetime.now().astimezone().isoformat();t0=time.monotonic();r=subprocess.run(argv,capture_output=True,timeout=90);cmd=dict(name=name,argv=argv,cwd=str(Path.cwd()),start=start,seconds=time.monotonic()-t0,exit=r.returncode,expectedExit=0,stdout=name+'.stdout',stderr=name+'.stderr');(O/cmd['stdout']).write_bytes(r.stdout);(O/cmd['stderr']).write_bytes(r.stderr);(O/(name+'.command.json')).write_text(json.dumps(cmd,indent=2)+'\n');calls.append(cmd);case=dict(id=name,passed=False)
   try:
    assert r.returncode==0;d=json.loads(r.stdout);validator.validate(d);assert d['quality']['completeness']=='complete' and d['rows'];locations=d['analysis']['locations'];expected=[]
    for row in d['rows']:
     span=locations[row['location']]['span'];lo=bisect.bisect_right(boundaries,span['start']['offset'])-1;hi=bisect.bisect_right(boundaries,span['end']['offset']-1)-1;left=max(0,lo-context);right=min(len(boundaries)-2,hi+context);begin,end=boundaries[left],boundaries[right+1];window=(row['file'],begin,end)
     if window not in expected:expected.append(window)
     assert row['snippet']==expected.index(window),'first-use window sharing';sn=d['snippets'][row['snippet']];assert (sn['startOffset'],sn['endOffset'],sn['startLine'],sn['text'].encode())==(begin,end,left+1,raw[begin:end]),'original physical whole-line window';assert not (0<begin<len(raw) and raw[begin-1:begin+1]==b'\r\n') and not (0<end<len(raw) and raw[end-1:end+1]==b'\r\n')
    assert len(d['snippets'])==len(expected) and d['bytes']==sum(e-b for _,b,e in expected);assert d['cachedBytes']==d['readBytes']==len(raw) and d['queries']==2;case['passed']=True
   except Exception as e:case.update(error=str(e),traceback=traceback.format_exc())
   cases.append(case)
summary=dict(planned=24,executed=len(cases),passed=sum(c['passed'] for c in cases),failed=sum(not c['passed'] for c in cases),skipped=0,cases=cases,calls=calls,scope='DESIGN7.5.29 clarified CR/LF/CRLF physical windows; original B overlap RTL; independent delimiter boundaries, half-open span, context0/1/2 and EOF, shared window byte counts.')
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:summary[k] for k in ['planned','executed','passed','failed','skipped','cases']},ensure_ascii=False));raise SystemExit(1 if summary['failed'] else 0)
