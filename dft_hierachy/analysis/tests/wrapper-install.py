"""Install, relocate, verify and execute the real WrapperCLI component, with destructive changes only in private copies."""
from pathlib import Path
import copy,hashlib,json,os,shutil,subprocess,sys,tarfile,tempfile,time
from jsonschema import Draft202012Validator
from referencing import Registry,Resource
build=Path(sys.argv[1]).resolve();config=sys.argv[2];binary=Path(sys.argv[3]).resolve();source=Path(sys.argv[4]).resolve();e=Path(tempfile.mkdtemp(prefix='wrapper-install-cli-'));calls=[];checks=0

def need(b,m):
 global checks
 checks+=1
 if not b:raise AssertionError(m)
def norm(value):
 if isinstance(value,dict):return {k:norm(v) for k,v in value.items() if k not in ['snapshotId','openedAt']}
 if isinstance(value,list):return [norm(v) for v in value]
 return value

def run(argv,code=0,env=None):
 start=time.time();x=subprocess.run(list(map(str,argv)),cwd=e,capture_output=True,timeout=90,env=env);n=len(calls);(e/f'{n}.stdout').write_bytes(x.stdout);(e/f'{n}.stderr').write_bytes(x.stderr);calls.append(dict(argv=list(map(str,argv)),cwd=str(e),exit=x.returncode,seconds=time.time()-start));(e/'commands.json').write_text(json.dumps(calls,indent=2));need(x.returncode==code,f'{argv}: {x.returncode}!={code} {x.stderr!r} {x.stdout[-1000:]!r}');return x
try:
 initial=e/'安装 prefix';run(['cmake','--install',build,'--config',config,'--prefix',initial,'--component','WrapperCLI'])
 moved=e/'moved package 空格';initial.rename(moved);data=moved/'share/dft-wrapper';manifest=data/'manifest.json';doc=json.loads(manifest.read_text());Draft202012Validator(json.loads((data/'manifest.schema.json').read_text())).validate(doc)
 need(doc['formatVersion']==1 and doc['format']=='wrapper-cli-manifest-v1' and len(doc['files'])==len({r['path'] for r in doc['files']}),'manifest identity')
 need([r['path'] for r in doc['files']]==sorted(r['path'] for r in doc['files']),'ordered manifest')
 need(str(build) not in manifest.read_text() and str(source) not in manifest.read_text(),'no source/build paths')
 exe=moved/next(r['path'] for r in doc['files'] if r['kind']=='executable');need(exe.is_file(),'native tool')
 run([sys.executable,data/'verify.py','--prefix',moved]);need(run([exe,'--version']).stdout==run([binary,'--version']).stdout,'installed version unchanged');need(run([exe,'--help']).stdout==run([binary,'--help']).stdout,'installed help unchanged')
 schemas=[json.loads(p.read_text()) for p in (data/'schemas').rglob('*.json')];ids=[s['$id'] for s in schemas];need(len(ids)==len(set(ids)),'unique schema URIs');registry=Registry().with_resources([(s['$id'],Resource.from_contents(s)) for s in schemas]);validator=Draft202012Validator(next(s for s in schemas if s['$id']=='urn:dft-studio:analysis:wrapper-chain-explanation:1'),registry=registry)
 examples=data/'examples';parsed=[]
 for file in ['chains.json','excluded.json']:
  argv=[exe,'--top','wrapper_example',examples/'example.sv','--config',examples/file,'--explain-chains','--require-complete'];x=json.loads(run(argv).stdout);validator.validate(x);parsed.append(x);original=json.loads(run([binary,*argv[1:]]).stdout);need(norm(original)==norm(x),'installed complete JSON equals built tool')
  text=run([*argv,'--format','text']).stdout.decode();need('Wrapper chain diagnostics' in text and '(declaration)' in text,'outside-build text and location')
 need(parsed[0]['explanation']['counts']['conflict']==1 and parsed[1]['explanation']['counts']['compatible']==1,'constraint change and reverify')
 # Reinstall to same moved prefix must produce the same byte manifest.
 before=manifest.read_bytes();run(['cmake','--install',build,'--config',config,'--prefix',moved,'--component','WrapperCLI']);need(manifest.read_bytes()==before,'repeatable manifest')
 # Independent DESTDIR staging and custom relative layout.
 stage=e/'destdir';env=dict(os.environ);env['DESTDIR']=str(stage);run(['cmake','--install',build,'--config',config,'--prefix','/wrapper-stage','--component','WrapperCLI'],env=env);staged=stage/'wrapper-stage';run([sys.executable,staged/'share/dft-wrapper/verify.py','--prefix',staged]);need((staged/'share/dft-wrapper/manifest.json').read_bytes()==before,'DESTDIR no path leak')
 # Exercise the same install module with custom relative directories, using the already built native binary.
 custom_source=e/'custom driver';custom_source.mkdir();(custom_source/'main.cpp').write_text('int main(){return 0;}\n')
 module=(source/'Install.cmake').as_posix().replace('"','\\"')
 (custom_source/'CMakeLists.txt').write_text('cmake_minimum_required(VERSION 3.28)\nproject(wrapper_install_layout LANGUAGES CXX)\nadd_executable(dft-wrapper main.cpp)\nset(DFT_SANITIZE '+('ON' if doc['sanitized'] else 'OFF')+')\ninclude("'+module+'")\n')
 custom_build=e/'custom build';run(['cmake','-S',custom_source,'-B',custom_build,'-DCMAKE_BUILD_TYPE='+config,'-DCMAKE_INSTALL_BINDIR=tools/bin','-DCMAKE_INSTALL_DATADIR=resources/shared'])
 shutil.copy2(binary,custom_build/binary.name);custom=e/'custom install';run(['cmake','--install',custom_build,'--config',config,'--prefix',custom,'--component','WrapperCLI']);run([sys.executable,custom/'resources/shared/dft-wrapper/verify.py','--prefix',custom]);run([custom/'tools/bin'/binary.name,'--version'])
 for value in ['/absolute','../escape']:
  run(['cmake','-S',custom_source,'-B',e/('invalid-'+str(len(calls))),'-DCMAKE_INSTALL_BINDIR='+value],1)
 # Corruption checks change one copied payload/manifest at a time and never fix the install tree.
 sample=examples/'chains.json';saved=sample.read_bytes();sample.write_bytes(saved+b' ');bad=sample.read_bytes();run([sys.executable,data/'verify.py','--prefix',moved],1);need(sample.read_bytes()==bad,'verification read-only');sample.write_bytes(saved)
 sample.unlink();run([sys.executable,data/'verify.py','--prefix',moved],1);sample.write_bytes(saved)
 sample.unlink();sample.symlink_to(examples/'excluded.json');run([sys.executable,data/'verify.py','--prefix',moved],1);sample.unlink();sample.write_bytes(saved)
 variants=[]
 for field,value in [('formatVersion',2),('formatVersion',True),('extra',1),('sanitized',1)]:d=copy.deepcopy(doc);d[field]=value;variants.append(d)
 for key,value in [('path','../outside'),('path','/absolute'),('path','x\\y'),('path','.'),('path',''),('bytes',True),('sha256','A'*64),('kind','other')]:d=copy.deepcopy(doc);d['files'][0][key]=value;variants.append(d)
 d=copy.deepcopy(doc);d['files'].append(d['files'][0]);variants.append(d)
 for d in variants:
  manifest.write_text(json.dumps(d));rejected=run([sys.executable,data/'verify.py','--prefix',moved],1);need(json.loads(rejected.stderr)['ok'] is False,'invalid manifest has structured error')
 manifest.write_text('{"formatVersion":1,"formatVersion":1}');rejected=run([sys.executable,data/'verify.py','--prefix',moved],1);need(json.loads(rejected.stderr)['ok'] is False,'duplicate key has structured error');manifest.write_bytes(before);run([sys.executable,data/'verify.py','--prefix',moved])
 bundle=e/'release bundle.tar.gz';args=[sys.executable,data/'bundle.py','--build',build,'--config',config,'--output',bundle]
 if doc['sanitized']:
  run(args,1);need(not bundle.exists(),'no sanitized release artifact')
 else:
  run(args);h=hashlib.sha256(bundle.read_bytes()).hexdigest();run(args,1);need(hashlib.sha256(bundle.read_bytes()).hexdigest()==h,'no overwrite existing archive')
  unpack=e/'unpacked';unpack.mkdir()
  with tarfile.open(bundle) as archive:
   names=archive.getnames();need(set(names)=={r['path'] for r in doc['files']}|{'share/dft-wrapper/manifest.json'},'exact archive payload');need(all(not n.startswith('/') and '..' not in Path(n).parts for n in names),'relative archive');archive.extractall(unpack,filter='data')
  run([sys.executable,unpack/'share/dft-wrapper/verify.py','--prefix',unpack]);run([unpack/next(r['path'] for r in doc['files'] if r['kind']=='executable'),'--version'])
  protected=e/'protected.tar.gz';protected.write_bytes(b'existing');run([sys.executable,data/'bundle.py','--build',build,'--output',protected],1);need(protected.read_bytes()==b'existing','preserve unrelated target')
 need(not list(e.glob('.*.tar.gz-*.tmp')),'no incomplete formal artifact')
 print(json.dumps(dict(calls=len(calls),checks=checks,files=len(doc['files']),schemas=len(schemas),negativeManifests=len(variants)+1,sanitized=doc['sanitized'],output=str(e))))
except Exception:
 print('output:',e);raise
