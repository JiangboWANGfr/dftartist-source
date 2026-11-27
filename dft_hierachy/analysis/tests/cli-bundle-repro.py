"""Archive reproducibility and usable contents of the real CLI install components."""
from pathlib import Path, PurePosixPath
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from unittest.mock import patch

binary, source = map(lambda s: Path(s).resolve(), sys.argv[1:3])
config = sys.argv[3]
sanitized = sys.argv[4] == 'ON'
e = Path(tempfile.mkdtemp(prefix='cli-bundle-repro-cli-'))
calls, records = [], []
checks = 0
suffix = '.exe' if os.name == 'nt' else ''
tools = ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper']


def need(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1048576), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run(argv, code=0, env=None):
    argv = list(map(str, argv))
    result = subprocess.run(argv, cwd=e, capture_output=True, env=env, timeout=240)
    n = len(calls)
    (e / f'{n}.stdout').write_bytes(result.stdout)
    (e / f'{n}.stderr').write_bytes(result.stderr)
    calls.append(dict(argv=argv, cwd=str(e), exit=result.returncode, expectedExit=code))
    (e / 'commands.json').write_text(json.dumps(calls, indent=2))
    need(result.returncode == code, f'{argv}: {result.returncode} != {code}: {result.stdout[-1000:]!r} {result.stderr!r}')
    return result


def inspect(path, manifest_name, doc):
    raw = path.read_bytes()
    need(raw[:4] == bytes([31, 139, 8, 0]) and raw[4:8] == bytes(4), 'gzip header has no name/comment/extra or wall clock')
    wanted = {row['path']: row for row in doc['files']}
    with tarfile.open(path) as archive:
        rows = archive.getmembers()
        need([x.name for x in rows] == sorted(set(wanted) | {manifest_name}), 'exact unique sorted members, including manifest')
        for item in rows:
            need(item.isfile() and not item.linkname, 'regular payload, no archive links or directories')
            need((item.uid, item.gid, item.uname, item.gname, item.mtime) == (0, 0, '', '', 0), 'no host identity or timestamp')
            need(set(item.pax_headers) <= {'path'}, 'only portable long/Unicode path extensions')
            expected = wanted.get(item.name)
            need(item.mode == (0o755 if expected and expected['kind'] == 'executable' else 0o644), 'portable runnable/readable modes')
            data = archive.extractfile(item).read()
            if expected:
                need(len(data) == expected['bytes'] and hashlib.sha256(data).hexdigest() == expected['sha256'], 'every payload has original verified bytes')
            else:
                need(json.loads(data) == doc, 'manifest itself unchanged')
    return dict(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())


try:
    driver = e / 'consumer'
    driver.mkdir()
    root = source.as_posix().replace('"', '\\"')
    (driver / 'CMakeLists.txt').write_text('cmake_minimum_required(VERSION 3.28)\nproject(ReproConfigureOnly LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nenable_testing()\nadd_library(hiercore INTERFACE)\nadd_library(hier_protocol INTERFACE)\nadd_library(hier_warnings INTERFACE)\nset(HIER_SCHEMA_PYTHON "' + sys.executable + '")\nadd_subdirectory("' + root + '" analysis)\n')
    hashes = {tool: sha(binary / (tool + suffix)) for tool in tools}
    for label, bindir, datadir in [('default', 'bin', 'share'), ('unicode-long', './工具 空间/./bin//', './资料 空间/' + '目录' * 24 + '/./share//')]:
        case = e / label
        case.mkdir()
        build = case / 'build'
        run(['cmake', '-S', driver, '-B', build, '-DCMAKE_BUILD_TYPE=' + config, '-DDFT_SANITIZE=' + ('ON' if sanitized else 'OFF'), '-DCMAKE_INSTALL_BINDIR=' + bindir, '-DCMAKE_INSTALL_DATADIR=' + datadir])
        for tool in tools:
            target = build / 'analysis' / (tool + suffix)
            shutil.copy2(binary / (tool + suffix), target)
            need(sha(target) == hashes[tool], 'same-config real product copied unchanged')
        for component, data_name, count in [('WrapperCLI', 'dft-wrapper', 23), ('AnalysisCLI', 'dft-analysis', 82)]:
            area = case / component
            area.mkdir()
            prefix = area / 'source prefix 中文'
            run(['cmake', '--install', build, '--config', config, '--component', component, '--prefix', prefix])
            data_rel = PurePosixPath(datadir) / data_name
            manifest_name = (data_rel / 'manifest.json').as_posix()
            data = prefix / str(data_rel)
            doc = json.loads((data / 'manifest.json').read_text())
            need(len(doc['files']) == count and doc['sanitized'] == sanitized and doc['configuration'] == config, 'unchanged component and actual configuration')
            selected = tools if component == 'AnalysisCLI' else ['dft-wrapper']
            for tool in selected:
                need(sha(prefix / str(PurePosixPath(bindir) / (tool + suffix))) == hashes[tool], 'installed native identity')
            command = [sys.executable, '-S', data / 'bundle.py', '--build', build, '--config', config, '--component', component]
            first, second = area / 'first.tar.gz', area / 'second different name.tar.gz'
            run([*command, '--output', first], 1 if sanitized else 0)
            if sanitized:
                need(not first.exists(), 'sanitized native never becomes a release')
                records.append(dict(layout=label, component=component, sanitizedRejected=True))
                (e / 'records.json').write_text(json.dumps(records, indent=2))
                shutil.rmtree(prefix)
                continue
            one = inspect(first, manifest_name, doc)
            run([*command, '--output', second])
            need(second.read_bytes() == first.read_bytes(), 'two real CMake installs produce identical compressed bytes')
            # A standard --cmake override copies a real installation with different
            # metadata. No fake native or verifier, and no production test hook.
            for path in prefix.rglob('*'):
                if path.is_file():
                    os.utime(path, (123456789, 123456789))
                    executable = any(row['path'] == path.relative_to(prefix).as_posix() and row['kind'] == 'executable' for row in doc['files'])
                    path.chmod(0o701 if executable else 0o600)
            shim = area / 'copy-installer.py'
            shim.write_text('#!' + sys.executable + '\nimport pathlib,shutil,sys,os\na=sys.argv;shutil.copytree(' + repr(str(prefix)) + ',pathlib.Path(a[a.index("--prefix")+1]))\n')
            shim.chmod(0o755)
            third = area / 'perturbed.tar.gz'
            run([*command, '--cmake', shim, '--output', third], env=dict(os.environ, DESTDIR=str(area / 'ignored-stage')))
            need(third.read_bytes() == first.read_bytes(), 'mtime, modes, install prefix, archive name and DESTDIR do not change archive bytes')
            inspect(third, manifest_name, doc)
            unpack = area / 'relocated output 中文'
            unpack.mkdir()
            with tarfile.open(third) as archive:
                archive.extractall(unpack, filter='data')
            run([sys.executable, '-S', unpack / str(data_rel) / 'verify.py', '--prefix', unpack])
            for tool in selected:
                run([unpack / str(PurePosixPath(bindir) / (tool + suffix)), '--version'])
            run([*command, '--output', first], 1)
            need(sha(first) == one['sha256'], 'existing complete archive is never replaced')
            link = area / 'existing-link.tar.gz'
            link.symlink_to(second)
            run([*command, '--output', link], 1)
            need(link.is_symlink() and sha(second) == one['sha256'], 'existing output link preserved')
            # A valid changed input must change the archive; normalization cannot
            # accidentally omit content or reuse the first result.
            readme = data / 'README.md'
            readme.write_bytes(readme.read_bytes() + b'\nReproducibility input variation.\n')
            changed = json.loads(json.dumps(doc))
            row = next(r for r in changed['files'] if r['path'] == readme.relative_to(prefix).as_posix())
            row['bytes'], row['sha256'] = readme.stat().st_size, sha(readme)
            (data / 'manifest.json').write_text(json.dumps(changed, indent=2))
            fourth = area / 'changed.tar.gz'
            run([*command, '--cmake', shim, '--output', fourth])
            four = inspect(fourth, manifest_name, changed)
            need(four['sha256'] != one['sha256'], 'changed verified contents change archive bytes')
            # Fail after one member was written. Real temporary install and verify
            # still run, then a deterministic archive-writer error exercises cleanup.
            spec = importlib.util.spec_from_file_location('tested_bundle', data / 'bundle.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            original_add = tarfile.TarFile.addfile
            writes = []

            def interrupted(archive, info, stream=None):
                writes.append(info.name)
                if len(writes) == 2:
                    raise OSError('deterministic archive write failure')
                return original_add(archive, info, stream)

            failure = area / 'failed.tar.gz'
            with patch.object(tarfile.TarFile, 'addfile', interrupted):
                try:
                    module.bundle(build, failure, config, str(shim), component)
                    raise AssertionError('writer failure did not propagate')
                except OSError as error:
                    need(str(error) == 'deterministic archive write failure', 'original write failure propagates')
            need(len(writes) == 2 and not failure.exists(), 'partial archive never published')
            need(not list(area.glob('.*.tar.gz-*.tmp')), 'owned staging cleaned on success and failed write')
            records.append(dict(layout=label, component=component, nativeHashes={t: hashes[t] for t in selected}, sameContent=one, changedContent=four, repeatedEqual=True, metadataIndependent=True, failureWrites=len(writes)))
            (e / 'records.json').write_text(json.dumps(records, indent=2))
            for path in [first, second, third, fourth]:
                path.unlink()
            shutil.rmtree(prefix)
            shutil.rmtree(unpack)
        for tool in tools:
            (build / 'analysis' / (tool + suffix)).unlink()
    print(json.dumps(dict(calls=len(calls), checks=checks, layouts=2, componentCases=len(records), sanitized=sanitized, output=str(e))))
except BaseException:
    print('output:', e)
    raise
