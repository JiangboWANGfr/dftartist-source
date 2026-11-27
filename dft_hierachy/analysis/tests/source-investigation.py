"""Exercise the public shortcut against the existing explicit chain and physical evidence."""
import importlib.util, json, subprocess, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('excerpts', Path(__file__).with_name('source-evidence-excerpts.py'))
excerpts = importlib.util.module_from_spec(spec); spec.loader.exec_module(excerpts)
ROOT, BIN = excerpts.ROOT, excerpts.BIN
OUT = Path(tempfile.mkdtemp(prefix='hier-investigation-cli-'))
FLAGS = ['--register-statistics', '--register-event-groups', '--register-control-profile',
         '--register-resolved-events', '--logic', '--compare-register-scenarios',
         '--compare-register-generation', '--compare-register-sources', '--source-coverage-deltas',
         '--source-bit-attribution', '--source-transition-cohorts', '--source-impact-summary',
         '--source-hierarchy-summary', '--source-hierarchy-matrix', '--source-hierarchy-ranges',
         '--select-source-ranges', '--explain-source-ranges', '--locate-source-evidence', '--source-evidence-excerpts']
BASE = ['--top', 'excerpt_top', '--scope', 'excerpt_top', '--recursive',
        str(ROOT/'tests/source-evidence-excerpts.sv')]
SCENARIOS = ['--scenario', 'BASE', '--scenario', 'REPEAT']
records = []
def invoke(args, code=0, verify=True):
    command = [BIN, *args]
    result = subprocess.run(command, capture_output=True, text=True, timeout=40)
    n = len(records); (OUT/f'{n}.stdout').write_text(result.stdout); (OUT/f'{n}.stderr').write_text(result.stderr)
    records.append(dict(argv=command, exit=result.returncode, expectedExit=code))
    (OUT/'commands.json').write_text(json.dumps(records, indent=2))
    assert result.returncode == code, (command, result.returncode, result.stdout, result.stderr)
    value = json.loads(result.stdout)
    if verify: excerpts.verify(value)
    return value

def stable(value):
    cursors = {}
    def visit(x):
        if isinstance(x, list): return [visit(v) for v in x]
        if isinstance(x, dict):
            out = {}
            for k, v in x.items():
                if k in ('snapshotId', 'openedAt'): out[k] = '<dynamic>'
                elif k in ('cursor', 'next', 'stepCursor') and isinstance(v, str) and v:
                    if v not in cursors: cursors[v] = 'cursor-'+str(len(cursors))
                    out[k] = cursors[v]
                else: out[k] = visit(v)
            return out
        return x
    return visit(value)

try:
    cases = [([], 0), (['--source-excerpt-context-lines', '0'], 0),
             (['--select-node', 'excerpt_top.left'], 0), (['--select-node', 'excerpt_top.le'], 0),
             (['--select-role', 'retained', '--select-lsb', '1', '--select-width', '2'], 0),
             (['--scenario', 'THIRD', '--select-scenario', '2'], 0),
             (['--input-value', 'excerpt_top.clk', '0', '1'], 0)]
    for limit in ['statistics-work', 'source-hierarchy-range-work', 'source-selection-work',
                  'source-evidence-work', 'source-location-queries', 'source-excerpt-queries']:
        cases.append((['--max-'+limit, '1'], 4))
    for extra, code in cases:
        short = invoke([*BASE, '--inspect-register-sources', *SCENARIOS, *extra, '--require-complete'], code)
        explicit = invoke([*BASE, *FLAGS, *SCENARIOS, *extra, '--require-complete'], code)
        assert stable(short) == stable(explicit), extra
        assert short['algorithm'] == 'rtl-source-evidence-excerpts-v1'
        assert (short['quality']['completeness'] == 'complete') == (code == 0)
    whole = invoke([*BASE, *SCENARIOS, '--inspect-register-sources', *FLAGS, '--source-excerpt-context-lines', '0'])
    assert (len(whole['rows']), len(whole['files']), len(whole['snippets'])) == (8, 2, 5)
    # Option order is irrelevant except for the documented scenario/input-value grouping.
    reordered = invoke(['--max-source-excerpt-queries', '3', *BASE, *SCENARIOS, '--inspect-register-sources'])
    assert reordered['quality']['completeness'] == 'complete'
    for extra in [['--inspect-register-sources'], ['--source-inventory'], ['--control-generation'],
                  ['--register-control-generation'], ['--clock-usage'], ['--select-scenario', '0'],
                  ['--select-scenario', '2'], ['--select-lsb', '1'], ['--source-excerpt-context-lines', '21'],
                  ['--max-source-excerpt-queries', '0'], ['--max-source-location-work', '0'],
                  ['--max-source-hierarchy-range-work', '0']]:
        invalid = invoke([*BASE, '--inspect-register-sources', *SCENARIOS, *extra], 2)
        assert invalid['error']['code'] == 'invalid_arguments'
    for names in [[], ['--scenario', 'ONE'], ['--scenario', 'SAME', '--scenario', 'SAME']]:
        invoke([*BASE, '--inspect-register-sources', *names], 2)
    invoke([*BASE, '--inspect-register-sources', '--input-value', 'excerpt_top.clk', '0', '1', *SCENARIOS], 2)
    invoke(['--top', 'excerpt_top', '--scope', 'excerpt_top', '/no/such/design.sv',
            '--inspect-register-sources', *SCENARIOS, '--max-source-excerpt-work', '0'], 2)
    print(json.dumps(dict(calls=len(records), equivalenceCases=len(cases), output=str(OUT))))
except BaseException:
    print('Raw first-failure evidence:', OUT)
    raise
