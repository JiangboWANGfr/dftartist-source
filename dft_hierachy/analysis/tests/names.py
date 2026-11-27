"""Raw argv regression for C-S2-02-01; invalid bytes must not reach output."""
import json
import os
from pathlib import Path
import subprocess
import sys
binary = os.fsencode(sys.argv[1])
fixture = os.fsencode(Path(__file__).with_name('design.sv'))
invalid = [b'\x80', b'\xbf', b'\xc0\x80', b'\xc1\xbf', b'\xc2', b'\xe0\x9f\xbf', b'\xed\xa0\x80',
           b'\xe1\x80', b'\xf0\x8f\xbf\xbf', b'\xf4\x90\x80\x80', b'\xf1\x80\x80', b'\xf5\x80\x80\x80', b'\xfe', b'\xff']
for name in invalid + ['中文🧪'.encode(), ('🧪' * 32).encode(), ('🧪' * 32 + 'a').encode()]:
    argv = [binary, b'--top', b'empty', b'--scope', b'empty', b'--logic', fixture, b'--scenario', name, b'--scenario', b'ok']
    p = subprocess.run(argv, capture_output=True, timeout=15)
    result = json.loads(p.stdout.decode('utf-8', errors='strict'))
    bad = name in invalid or len(name) > 128
    assert p.returncode == (2 if bad else 0), (name.hex(), p.returncode, result)
    if bad:
        assert set(result) == {'error'} and result['error']['code'] == 'invalid_arguments'
        assert result['error']['message'].isascii()
    else:
        assert result['scenarios'][0]['name'].encode() == name
print('17 raw argv encoding/UTF-8 byte boundary cases passed')
