"""Read-only byte verification for a relocated analysis CLI component; standard library only."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import os
import re
import stat
import sys

MAX_SAFE = 9007199254740991


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate manifest key: ' + key)
        result[key] = value
    return result


def keys(value, wanted):
    if not isinstance(value, dict) or set(value) != set(wanted):
        raise ValueError('unexpected manifest fields')


def checked_path(prefix, value):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > 4096:
        raise ValueError('invalid payload path')
    p = PurePosixPath(value)
    if not p.parts or p.is_absolute() or '\\' in value or ':' in p.parts[0] or str(p) != value or any(x in ('.', '..') for x in p.parts):
        raise ValueError('unsafe payload path: ' + value)
    path = prefix
    for part in p.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError('payload symlink: ' + value)
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError('payload is not a regular file: ' + value)
    return path


def verify(prefix, manifest):
    prefix = Path(prefix).resolve(strict=True)
    manifest = Path(manifest)
    if manifest.is_symlink() or not stat.S_ISREG(manifest.stat().st_mode) or manifest.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('invalid manifest file')
    doc = json.loads(manifest.read_text(encoding='utf-8'), object_pairs_hook=unique)
    keys(doc, ['formatVersion', 'format', 'kind', 'configuration', 'system', 'processor', 'sanitized', 'files'])
    wrapper = doc['format'] == 'wrapper-cli-manifest-v1' and doc['kind'] == 'dft-wrapper-install'
    analysis = doc['format'] == 'analysis-cli-manifest-v1' and doc['kind'] == 'dft-analysis-install'
    if type(doc['formatVersion']) is not int or doc['formatVersion'] != 1 or not (wrapper or analysis):
        raise ValueError('unsupported manifest format')
    if type(doc['sanitized']) is not bool or not all(isinstance(doc[k], str) for k in ['configuration', 'system', 'processor']):
        raise ValueError('invalid build metadata')
    if not isinstance(doc['files'], list) or not 1 <= len(doc['files']) <= 4096:
        raise ValueError('invalid manifest file count')
    seen = set()
    executables = 0
    tools = set()
    for row in doc['files']:
        keys(row, ['path', 'bytes', 'sha256', 'kind'])
        path = checked_path(prefix, row['path'])
        if row['path'] in seen:
            raise ValueError('duplicate payload path')
        seen.add(row['path'])
        if type(row['bytes']) is not int or not 0 <= row['bytes'] <= MAX_SAFE or not isinstance(row['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', row['sha256']):
            raise ValueError('invalid payload size or digest')
        if row['kind'] not in ['executable', 'data']:
            raise ValueError('invalid payload kind')
        if path.stat().st_size != row['bytes']:
            raise ValueError('payload size mismatch: ' + row['path'])
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() != row['sha256']:
            raise ValueError('payload digest mismatch: ' + row['path'])
        if row['kind'] == 'executable':
            executables += 1
            tools.add(path.name.removesuffix('.exe'))
            if os.name != 'nt' and not os.access(path, os.X_OK):
                raise ValueError('payload is not executable: ' + row['path'])
    if wrapper and executables != 1:
        raise ValueError('expected one native executable')
    if analysis and (executables != 4 or tools != {'dft-seqcheck', 'dft-objects', 'dft-memory', 'dft-wrapper'}):
        raise ValueError('expected all four native analysis tools')
    return doc


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prefix', required=True, type=Path)
    args = parser.parse_args()
    try:
        doc = verify(args.prefix, Path(__file__).with_name('manifest.json'))
        print(json.dumps(dict(ok=True, files=len(doc['files']), sanitized=doc['sanitized'])))
        return 0
    except (OSError, ValueError, UnicodeError, RecursionError) as error:
        print(json.dumps(dict(ok=False, error=str(error))), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
