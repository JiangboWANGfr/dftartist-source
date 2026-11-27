"""Real component layout equivalence; configure only, copy same-config native bytes, never build stubs."""
from pathlib import Path, PurePosixPath
import copy
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

binary = Path(sys.argv[1]).resolve()
source = Path(sys.argv[2]).resolve()
config = sys.argv[3]
sanitized = sys.argv[4] == 'ON'
e = Path(tempfile.mkdtemp(prefix='cli-install-paths-cli-'))
calls = []
checks = 0
suffix = '.exe' if os.name == 'nt' else ''
tools = ['dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper']
records = []


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
    result = subprocess.run(list(map(str, argv)), cwd=e, env=env, capture_output=True, timeout=180)
    n = len(calls)
    (e / f'{n}.stdout').write_bytes(result.stdout)
    (e / f'{n}.stderr').write_bytes(result.stderr)
    calls.append(dict(argv=list(map(str, argv)), cwd=str(e), exit=result.returncode, expectedExit=code))
    (e / 'commands.json').write_text(json.dumps(calls, indent=2))
    need(result.returncode == code, f'{argv}: {result.returncode} != {code}: {result.stdout[-1200:]!r} {result.stderr!r}')
    return result


def norm(value):
    if isinstance(value, dict):
        return {k: norm(v) for k, v in value.items() if k not in ['snapshotId', 'openedAt']}
    if isinstance(value, list):
        return list(map(norm, value))
    return value


try:
    driver = e / 'consumer'
    driver.mkdir()
    # Actual production registration, without fetching/compiling dependencies. These
    # interface names support configure only; every executable below is a real build product.
    cmake_source = source.as_posix().replace('"', '\\"')
    (driver / 'CMakeLists.txt').write_text('cmake_minimum_required(VERSION 3.28)\nproject(LayoutConfigureOnly LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nenable_testing()\nadd_library(hiercore INTERFACE)\nadd_library(hier_protocol INTERFACE)\nadd_library(hier_warnings INTERFACE)\nset(HIER_SCHEMA_PYTHON "' + sys.executable + '")\nadd_subdirectory("' + cmake_source + '" analysis)\n')
    original_hashes = {tool: sha(binary / (tool + suffix)) for tool in tools}
    layouts = [
        ('default', 'bin', 'share'),
        ('dot-bin', './bin', 'share'),
        ('dot-share', 'bin', './share'),
        ('internal-dot', 'tools/./nested//bin/', './resources/./share//'),
        ('unicode', './工具 空间/./bin//', './资料 空间/./share/'),
        ('root-bin', '.', 'share'),
        ('root-data', 'bin', '.'),
    ]
    reference = {}
    for label, bindir, datadir in layouts:
        case = e / label
        case.mkdir()
        build = case / 'build'
        run(['cmake', '-S', driver, '-B', build, '-DCMAKE_BUILD_TYPE=' + config, '-DDFT_SANITIZE=' + ('ON' if sanitized else 'OFF'), '-DCMAKE_INSTALL_BINDIR=' + bindir, '-DCMAKE_INSTALL_DATADIR=' + datadir])
        for tool in tools:
            target = build / 'analysis' / (tool + suffix)
            shutil.copy2(binary / (tool + suffix), target)
            need(sha(target) == original_hashes[tool], 'real native bytes copied unchanged')
        prefix = case / '安装 prefix'
        saved = {}
        for component, data_name, count in [('WrapperCLI', 'dft-wrapper', 23), ('AnalysisCLI', 'dft-analysis', 82)]:
            run(['cmake', '--install', build, '--config', config, '--component', component, '--prefix', prefix])
            if component == 'WrapperCLI':
                moved = case / 'moved 中文'
                prefix.rename(moved)
                prefix = moved
            rel_data = PurePosixPath(datadir) / data_name
            data = prefix / str(rel_data)
            manifest = data / 'manifest.json'
            raw = manifest.read_bytes()
            doc = json.loads(raw)
            Draft202012Validator(json.loads((data / 'manifest.schema.json').read_text())).validate(doc)
            need(doc['configuration'] == config and doc['sanitized'] == sanitized, 'same configuration and sanitizer metadata')
            need(len(doc['files']) == count and [r['path'] for r in doc['files']] == sorted({r['path'] for r in doc['files']}), 'same unique sorted file count')
            logical = {}
            selected = tools if component == 'AnalysisCLI' else ['dft-wrapper']
            for row in doc['files']:
                path = PurePosixPath(row['path'])
                need(str(path) == row['path'] and not path.is_absolute() and '..' not in path.parts, 'every generated file path canonical')
                if row['kind'] == 'executable':
                    need(row['path'] == str(PurePosixPath(bindir) / path.name), 'binary destination matches manifest')
                    tool = path.name.removesuffix(suffix) if suffix else path.name
                    need(tool in selected and sha(prefix / row['path']) == original_hashes[tool], 'native identity and original bytes')
                    key = 'native/' + tool
                else:
                    key = 'data/' + path.relative_to(rel_data).as_posix()
                logical[key] = {k: row[k] for k in ['bytes', 'sha256', 'kind']}
            need(sum(r['kind'] == 'executable' for r in doc['files']) == len(selected), 'native kind survives path normalization')
            if label == 'default':
                reference[component] = logical
            need(logical == reference[component], 'layout changes only canonical prefixes, not component contents')
            run([sys.executable, '-S', data / 'verify.py', '--prefix', prefix])
            for tool in selected:
                run([prefix / str(PurePosixPath(bindir) / (tool + suffix)), '--version'])
            schemas = [json.loads(p.read_text()) for p in (data / 'schemas').rglob('*.schema.json')]
            registry = Registry().with_resources((s['$id'], Resource.from_contents(s)) for s in schemas)
            validator = Draft202012Validator(next(s for s in schemas if s['$id'] == 'urn:dft-studio:analysis:wrapper-chain-explanation:1'), registry=registry)
            args = ['--top', 'wrapper_example', data / 'examples/example.sv', '--config', data / 'examples/chains.json', '--explain-chains', '--require-complete']
            console = json.loads(run([binary / ('dft-wrapper' + suffix), *args]).stdout)
            report_path = case / (component + '-report.json')
            need(run([prefix / str(PurePosixPath(bindir) / ('dft-wrapper' + suffix)), '--output', report_path, '--', *args]).stdout == b'', 'relocated native report export')
            report = json.loads(report_path.read_text())
            validator.validate(report)
            need(norm(console) == norm(report), 'actual exported report equals built native')
            # The producer changes. The strict reader must still reject injected ./ paths.
            bad = copy.deepcopy(doc)
            bad['files'][0]['path'] = './' + bad['files'][0]['path']
            manifest.write_text(json.dumps(bad))
            need(json.loads(run([sys.executable, '-S', data / 'verify.py', '--prefix', prefix], 1).stderr)['ok'] is False, 'noncanonical external manifest remains rejected')
            manifest.write_bytes(raw)
            run(['cmake', '--install', build, '--config', config, '--component', component, '--prefix', prefix])
            need(manifest.read_bytes() == raw, 'same layout repeat install stable')
            # DESTDIR uses the same canonical relative manifest, with no staging path.
            stage = case / (component + '-stage')
            run(['cmake', '--install', build, '--config', config, '--component', component, '--prefix', '/layout-stage'], env=dict(os.environ, DESTDIR=str(stage)))
            staged = stage / 'layout-stage'
            run([sys.executable, '-S', staged / str(rel_data) / 'verify.py', '--prefix', staged])
            need((staged / str(rel_data) / 'manifest.json').read_bytes() == raw, 'canonical DESTDIR identity')
            archive_path = case / (component + '.tar.gz')
            command = [sys.executable, '-S', data / 'bundle.py', '--build', build, '--config', config, '--component', component, '--output', archive_path]
            archive_record = None
            if sanitized:
                run(command, 1)
                need(not archive_path.exists(), 'sanitized layout cannot publish release')
            else:
                run(command)
                archive_record = dict(bytes=archive_path.stat().st_size, sha256=sha(archive_path))
                run(command, 1)
                need(sha(archive_path) == archive_record['sha256'], 'archive never overwritten')
                unpack = case / (component + '-unpack')
                unpack.mkdir()
                with tarfile.open(archive_path) as tar:
                    need(set(tar.getnames()) == {r['path'] for r in doc['files']} | {str(rel_data / 'manifest.json')}, 'canonical exact archive members')
                    tar.extractall(unpack, filter='data')
                run([sys.executable, '-S', unpack / str(rel_data) / 'verify.py', '--prefix', unpack])
                for tool in selected:
                    run([unpack / str(PurePosixPath(bindir) / (tool + suffix)), '--version'])
                # Keep manifests/hashes/commands; avoid retaining GBs of identical native copies.
                for row in doc['files']:
                    if row['kind'] == 'executable':
                        (unpack / row['path']).unlink()
                archive_path.unlink()
            protected = case / (component + '-protected.tar.gz')
            protected.write_bytes(b'old archive')
            run([*command[:-1], protected], 1)
            need(protected.read_bytes() == b'old archive', 'unrelated archive bytes retained')
            for row in doc['files']:
                if row['kind'] == 'executable':
                    (staged / row['path']).unlink()
            saved[component] = (manifest, raw, data)
            records.append(dict(layout=label, component=component, bindir=bindir, datadir=datadir, files=count, nativeHashes={t: original_hashes[t] for t in selected}, archive=archive_record, normalized=True))
            (e / 'layouts.json').write_text(json.dumps(records, indent=2))
        for manifest, raw, data in saved.values():
            need(manifest.read_bytes() == raw, 'co-install preserves each component manifest')
            run([sys.executable, '-S', data / 'verify.py', '--prefix', prefix])
        for tool in tools:
            (prefix / str(PurePosixPath(bindir) / (tool + suffix))).unlink()
            (build / 'analysis' / (tool + suffix)).unlink()
        need(not list(case.glob('.*.tar.gz-*.tmp')), 'archive staging cleaned')
    invalid = ['../escape', 'nested/../bin', '/absolute', 'C:/bin', './C:/bin', 'bad\\bin', 'bad;bin', 'bad$bin', 'bad\nbin', 'bad"bin']
    for key in ['BINDIR', 'DATADIR']:
        for value in invalid:
            options = dict(BINDIR='bin', DATADIR='share')
            options[key] = value
            run(['cmake', '-S', driver, '-B', e / 'invalid-build', '-DCMAKE_BUILD_TYPE=' + config, *['-DCMAKE_INSTALL_' + k + ':STRING=' + v for k, v in options.items()]], 1)
    need(not list(e.glob('.*.tar.gz-*.tmp')), 'no incomplete artifact')
    print(json.dumps(dict(calls=len(calls), checks=checks, layouts=len(layouts), componentCases=len(records), invalidDirectories=2 * len(invalid), sanitized=sanitized, output=str(e))))
except BaseException:
    print('output:', e)
    raise
