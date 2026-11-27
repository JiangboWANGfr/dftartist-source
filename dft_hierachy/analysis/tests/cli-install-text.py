"""Production CMake text boundary; oracle uses Python's strict UTF8 decoder."""
from pathlib import Path
import hashlib
import json
import os
import random
import shutil
import subprocess
import sys
import tarfile
import tempfile

binary, source = [Path(s).resolve() for s in sys.argv[1:3]]
config, sanitized = sys.argv[3], sys.argv[4] == 'ON'
e = Path(tempfile.mkdtemp(prefix='cli-install-text-cli-'))
calls, records = [], []
checks = 0
suffix = '.exe' if os.name == 'nt' else ''


def need(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)


def run(argv, code=0):
    argv = list(map(str, argv))
    result = subprocess.run(argv, cwd=e, capture_output=True, timeout=240)
    n = len(calls)
    (e / f'{n}.stdout').write_bytes(result.stdout)
    (e / f'{n}.stderr').write_bytes(result.stderr)
    calls.append(dict(argv=argv, cwd=str(e), exit=result.returncode, expectedExit=code))
    (e / 'commands.json').write_text(json.dumps(calls, indent=2))
    need(result.returncode == code, f'{argv}: {result.returncode} != {code}: {result.stdout[-1200:]!r} {result.stderr[-1200:]!r}')
    return result


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def acceptable(data):
    try:
        text = data.decode('utf-8', errors='strict')
        return all(not (ord(c) < 32 or 127 <= ord(c) <= 159) for c in text)
    except UnicodeError:
        return False


try:
    helper = source / 'packaging/Text.cmake'
    valid = [b'', b'ASCII with spaces', b'";\\$<CONFIG> [==[', *[chr(cp).encode() for cp in [32, 126, 160, 255, 2047, 2048, 0xD7FF, 0xE000, 0xFFFF, 0x10000, 0x10FFFF]], '中文 e\u0301 🌌'.encode()]
    controls = [chr(cp).encode() for cp in [*range(1, 32), *range(127, 160)]]
    invalid = [bytes.fromhex(x) for x in ['80', 'bf', 'c080', 'c1bf', 'c2', 'c27f', 'c2c0', 'e08080', 'e09fbf', 'e180', 'eda080', 'edbfbf', 'f0808080', 'f08fbfbf', 'f09080', 'f4908080', 'f4bfbfbf', 'f5808080', 'f888808080', 'ff']]
    randomizer = random.Random(22852)
    random_cases = [bytes(randomizer.randrange(1, 256) for _ in range(randomizer.randrange(1, 10))) for _ in range(96)]
    cases = valid + controls + invalid + random_cases
    need(all(acceptable(x) for x in valid), 'handwritten valid boundary cases agree with independent decoder')
    need(not any(acceptable(x) for x in controls + invalid), 'handwritten invalid cases agree with independent decoder')
    for index, raw in enumerate(cases):
        p = e / f'text-{index}.cmake'
        construct = 'string(ASCII ' + ' '.join(map(str, raw)) + ' value)' if raw else 'set(value "")'
        p.write_text('include("' + helper.as_posix() + '")\n' + construct + '\n_dft_cli_validate_text("${value}" "test text")\nstring(HEX "${value}" actual)\nmessage(STATUS "checked=${actual}")\n')
        good = acceptable(raw)
        result = run(['cmake', '-P', p], 0 if good else 1)
        if good:
            need(('checked=' + raw.hex()).encode() in result.stdout, 'accepted text bytes unchanged')
        else:
            need(b'CLI test text must' in result.stderr, 'the production guard rejects, not CMake input construction')
        records.append(dict(hex=raw.hex(),accepted=good))
    (e / 'text-cases.json').write_text(json.dumps(records, indent=2))
    driver = e / 'consumer'
    driver.mkdir()
    cmake = 'cmake_minimum_required(VERSION 3.28)\nproject(TextInstallConfigureOnly LANGUAGES CXX)\nset(CMAKE_CXX_STANDARD 20)\nenable_testing()\nadd_library(hiercore INTERFACE)\nadd_library(hier_protocol INTERFACE)\nadd_library(hier_warnings INTERFACE)\nset(HIER_SCHEMA_PYTHON "' + sys.executable + '")\n'
    cmake += 'if(DEFINED DFT_TEST_PROCESSOR)\nset(CMAKE_SYSTEM_PROCESSOR "${DFT_TEST_PROCESSOR}")\nendif()\nif(DEFINED DFT_TEST_SYSTEM)\nset(CMAKE_SYSTEM_NAME "${DFT_TEST_SYSTEM}")\nendif()\n'
    cmake += 'add_subdirectory("' + source.as_posix() + '" analysis)\n'
    (driver / 'CMakeLists.txt').write_text(cmake)
    bad_values = ['bad' + chr(1), 'bad' + chr(127), 'bad' + chr(0x85), os.fsdecode(b'bad\xff')]
    rejection_cases = []
    for key in ['CMAKE_INSTALL_BINDIR', 'CMAKE_INSTALL_DATADIR', 'DFT_TEST_SYSTEM', 'DFT_TEST_PROCESSOR', 'CMAKE_BUILD_TYPE', 'CMAKE_CONFIGURATION_TYPES']:
        for index, value in enumerate(bad_values):
            build = e / ('invalid-' + key + '-' + str(index))
            result = run(['cmake', '-S', driver, '-B', build, '-DCMAKE_BUILD_TYPE=' + config, '-D' + key + ':STRING=' + value], 1)
            need(b'CLI ' in result.stderr and (b'valid UTF-8' in result.stderr or b'control characters' in result.stderr), 'configuration rejects bad text at production boundary')
            need(not list((build / 'analysis').glob('*Manifest-*.cmake')), 'no installable manifest script after rejected configuration')
            rejection_cases.append(dict(field=key,index=index))
    (e / 'rejected-configs.json').write_text(json.dumps(rejection_cases,indent=2))
    build = e / 'valid-build'
    bindir, datadir = './工具 🌌/e\u0301/./bin//', './资料/🚀/./share/'
    processor = '架构 "quoted";\\$<CONFIG>/$ENV{DFT_LITERAL_ONLY}/🌌'
    system = 'System "literal";\\$<CONFIG>'
    run(['cmake', '-S', driver, '-B', build, '-DCMAKE_BUILD_TYPE=' + config, '-DDFT_SANITIZE=' + ('ON' if sanitized else 'OFF'), '-DCMAKE_INSTALL_BINDIR:STRING=' + bindir, '-DCMAKE_INSTALL_DATADIR:STRING=' + datadir, '-DDFT_TEST_SYSTEM:STRING=' + system, '-DDFT_TEST_PROCESSOR:STRING=' + processor])
    hashes = {}
    for tool in ['dft-wrapper', 'dft-seqcheck', 'dft-memory', 'dft-objects']:
        p = build / 'analysis' / (tool + suffix)
        shutil.copy2(binary / (tool + suffix), p)
        hashes[tool] = sha(p)
        need(hashes[tool] == sha(binary / (tool + suffix)), 'real native product identity')
    from pathlib import PurePosixPath
    prefix = e / '安装 prefix'
    components = []
    for component, data_name, count in [('WrapperCLI', 'dft-wrapper', 23), ('AnalysisCLI', 'dft-analysis', 82)]:
        run(['cmake', '--install', build, '--config', config, '--component', component, '--prefix', prefix])
        data = prefix / str(PurePosixPath(datadir) / data_name)
        manifest = data / 'manifest.json'
        original = manifest.read_bytes()
        doc = json.loads(original)
        need(doc['system'] == system and doc['processor'] == processor and doc['configuration'] == config, 'metadata literal quotes, backslash, semicolon, dollars and Unicode roundtrip')
        need(doc['sanitized'] == sanitized and len(doc['files']) == count, 'component format and actual sanitizer metadata preserved')
        run([sys.executable, '-S', data / 'verify.py', '--prefix', prefix])
        selected = ['dft-wrapper'] if component == 'WrapperCLI' else list(hashes)
        for tool in selected:
            run([prefix / str(PurePosixPath(bindir) / (tool + suffix)), '--version'])
        generated = build / 'analysis' / (component + 'Manifest-' + config + '.cmake')
        need(generated.read_bytes().startswith(helper.read_bytes()), 'single authoritative guard embedded in generated script')
        direct = e / (component + '-standalone.cmake')
        direct.write_bytes(generated.read_bytes())
        for bad in bad_values:
            before = manifest.stat().st_mtime_ns
            result = run(['cmake', '-DCMAKE_INSTALL_PREFIX:STRING=' + str(prefix), '-DCMAKE_INSTALL_CONFIG_NAME:STRING=' + bad, '-P', direct], 1)
            need(b'CLI manifest string must' in result.stderr, 'generated script rejects dynamic bad text before JSON publication')
            need(manifest.read_bytes() == original and manifest.stat().st_mtime_ns == before, 'failed generation preserves earlier manifest bytes and mtime')
        archive_path = e / (component + '.tar.gz')
        run([sys.executable, '-S', data / 'bundle.py', '--build', build, '--config', config, '--component', component, '--output', archive_path], 1 if sanitized else 0)
        archive_record = None
        if sanitized:
            need(not archive_path.exists(), 'sanitized component cannot publish release')
        else:
            archive_record = dict(bytes=archive_path.stat().st_size, sha256=sha(archive_path))
            unpack = e / (component + '-unpack')
            unpack.mkdir()
            with tarfile.open(archive_path) as archive:
                need(set(archive.getnames()) == {r['path'] for r in doc['files']} | {(PurePosixPath(datadir) / data_name / 'manifest.json').as_posix()}, 'canonical Unicode archive exact members')
                archive.extractall(unpack, filter='data')
            unpack_data = unpack / str(PurePosixPath(datadir) / data_name)
            run([sys.executable, '-S', unpack_data / 'verify.py', '--prefix', unpack])
            need(json.loads((unpack_data / 'manifest.json').read_text()) == doc, 'same literal metadata after archive roundtrip')
            for row in doc['files']:
                if row['kind'] == 'executable':(unpack / row['path']).unlink()
            archive_path.unlink()
        components.append(dict(component=component,files=count,nativeHashes={t:hashes[t] for t in selected},archive=archive_record,metadataLiteral=True))
        (e / 'components.json').write_text(json.dumps(components,indent=2))
    for row in doc['files']:
        if row['kind'] == 'executable':(prefix / row['path']).unlink()
    for tool in hashes:(build / 'analysis' / (tool + suffix)).unlink()
    print(json.dumps(dict(calls=len(calls),checks=checks,textCases=len(cases),rejectedConfigs=len(rejection_cases),componentCases=len(components),sanitized=sanitized,output=str(e))))
except BaseException:
    print('output:', e)
    raise
