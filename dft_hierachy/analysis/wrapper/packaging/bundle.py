"""Build a no-overwrite native analysis tar.gz from a CMake install component."""
from pathlib import Path
import argparse
import gzip
import importlib.util
import json
import os
import subprocess
import sys
import tarfile
import tempfile


def bundle(build, output, config, cmake, component='WrapperCLI'):
    if component not in ('WrapperCLI', 'AnalysisCLI'):
        raise ValueError('unsupported CLI component')
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('output already exists')
    if not output.name.endswith('.tar.gz'):
        raise ValueError('output must end in .tar.gz')
    if not output.parent.is_dir():
        raise ValueError('output parent must exist')
    with tempfile.TemporaryDirectory(prefix='wrapper-cli-install-') as temporary:
        prefix = Path(temporary) / 'prefix'
        command = [cmake, '--install', str(Path(build).resolve(strict=True)), '--prefix', str(prefix), '--component', component]
        if config:
            command += ['--config', config]
        env = dict(os.environ)
        env.pop('DESTDIR', None)
        subprocess.run(command, env=env, check=True)
        manifests = list(prefix.rglob('manifest.json'))
        if len(manifests) != 1:
            raise ValueError('expected one CLI manifest')
        manifest = manifests[0]
        spec = importlib.util.spec_from_file_location('wrapper_installed_verify', manifest.with_name('verify.py'))
        if spec is None or spec.loader is None:
            raise ValueError('installed verifier missing')
        verifier = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(verifier)
        doc = verifier.verify(prefix, manifest)
        expected = 'dft-wrapper-install' if component == 'WrapperCLI' else 'dft-analysis-install'
        if doc['kind'] != expected:
            raise ValueError('installed manifest does not match requested component')
        if doc['sanitized']:
            raise ValueError('sanitized builds are not release bundles')
        fd, name = tempfile.mkstemp(prefix='.' + output.name + '-', suffix='.tmp', dir=output.parent)
        os.close(fd)
        staged = Path(name)
        try:
            members = [(row['path'], row['bytes'], row['kind'] == 'executable') for row in doc['files']]
            members.append((manifest.relative_to(prefix).as_posix(), manifest.stat().st_size, False))
            # Construct headers from the verified component, not host filesystem metadata.
            # Close tar, gzip and the file before publishing the completed archive.
            with staged.open('wb') as raw:
                with gzip.GzipFile(filename='', mode='wb', compresslevel=9, fileobj=raw, mtime=0) as compressed:
                    with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as archive:
                        for path, size, executable in sorted(members):
                            info = tarfile.TarInfo(path)
                            info.size = size
                            info.mode = 0o755 if executable else 0o644
                            info.mtime = info.uid = info.gid = 0
                            info.uname = info.gname = ''
                            with (prefix / path).open('rb') as payload:
                                archive.addfile(info, payload)
            # A hard link publishes the completed regular file without replacing any existing target.
            os.link(staged, output)
        finally:
            staged.unlink(missing_ok=True)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--config', default='')
    parser.add_argument('--cmake', default='cmake')
    parser.add_argument('--component', choices=['WrapperCLI', 'AnalysisCLI'], default='WrapperCLI')
    args = parser.parse_args()
    try:
        path = bundle(args.build, args.output, args.config, args.cmake, args.component)
        print(json.dumps(dict(ok=True, archive=str(path))))
        return 0
    except (OSError, ValueError, UnicodeError, RecursionError, subprocess.CalledProcessError, tarfile.TarError) as error:
        print(json.dumps(dict(ok=False, error=str(error))), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
