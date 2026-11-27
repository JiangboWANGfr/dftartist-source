import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
const root = process.env.HIER_A_CLIENT_MODULE_ROOT;
const moduleUrl = (name) => root ? pathToFileURL(join(root, name + ".js"))
  : new URL(`../../packages/client/dist/${name}.js`, import.meta.url);
const { integerToken, validateWireDefinition, copyWireNumbers } = await import(moduleUrl("wire-numbers"));
const { decodeWireText, decodeWireFrame } = await import(moduleUrl("wire-frame"));
const { jsonSnapshot } = await import(moduleUrl("json-snapshot"));
const diagnostics = (count, extra = "") => `{"id":1,"ok":true,"result":{"errorCount":${count},"warningCount":0,"truncated":false,"items":[]${extra}},"completeness":{"status":"complete","reasons":[]}}`;

// These are valid JSON numeric tokens. Grammar remains the whole-frame decoder's job.
test("A M7 number token: plain integers include signed zero and arbitrary magnitude", () => {
  for (const token of ['0', '-0', '1', '-1', '10', '-1000', '9007199254740991', '9007199254740993', '9'.repeat(1200)])
    assert.equal(integerToken(token), true, token);
});

test("A M7 number token: decimal tail zeros cross the point without counting it", () => {
  for (const [token, expected] of [['0.0', true], ['-0.000', true], ['1.000', true], ['100.00', true],
    ['0.1', false], ['-10.0100', false], ['100.00e-2', true], ['100.00e-3', false],
    ['10.000E-1', true], ['10.000e-2', false], ['1.0000e-1', false], ['0.10000e1', true], ['0.10000e0', false]])
    assert.equal(integerToken(token), expected, token);
});

test("A M7 number token: exponents keep sign, case and leading zero meaning", () => {
  for (const [token, expected] of [['1e0', true], ['1E+0000', true], ['10e-0001', true], ['10e-0002', false],
    ['0.01e+0002', true], ['0.01E+0001', false], ['-0.01e2', true], ['-0.01E1', false],
    ['-1000.000e-3', true], ['-1000.000E-4', false], ['1e-400', false], ['-1e-400', false]])
    assert.equal(integerToken(token), expected, token);
});

test("A M7 number token: huge exponents and all-zero mantissas stay exact", () => {
  const huge = '9'.repeat(1200);
  for (const token of [`0e${huge}`, `-0.000E-${huge}`, `0.00e+${huge}`, `1e${huge}`, `-0.1E+${huge}`])
    assert.equal(integerToken(token), true, token.slice(0, 25));
  for (const token of [`1e-${huge}`, `-1000.000E-${huge}`, `0.001e-${huge}`])
    assert.equal(integerToken(token), false, token.slice(0, 25));
  assert.equal(integerToken('0.' + '0'.repeat(2048) + '1e2049'), true);
  assert.equal(integerToken('0.' + '0'.repeat(2048) + '1e2048'), false);
});

test("A M7 number token: bounded decimal corpus agrees with independent BigInt rational divisibility", () => {
  let checked = 0;
  for (const whole of ['0', '1', '10', '101', '1000', '9007199']) {
    for (const fraction of ['', '0', '00', '01', '1', '100', '10100']) {
      for (let exponent = -8; exponent <= 8; exponent++) {
        const power = exponent - fraction.length;
        const numerator = BigInt(whole + fraction);
        const expected = power >= 0 || numerator % (10n ** BigInt(-power)) === 0n;
        for (const sign of ['', '-']) {
          for (const marker of ['e', 'E']) {
            const token = sign + whole + (fraction ? '.' + fraction : '') + marker
              + (exponent < 0 ? '-' : '+') + '00' + Math.abs(exponent);
            JSON.parse(token);
            assert.equal(integerToken(token), expected, token);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 2856);
});

test("A M7 number token: frame scan preserves exact integer spelling and rounded fractional evidence", () => {
  for (const token of ['0', '-0', '1.0000', '100.00e-2', '0.10000e1', '10E-0001', '0e999999999999999999']) {
    const frame = decodeWireFrame(diagnostics(token));
    assert.equal(validateWireDefinition('DesignDiagnosticsResponse', frame), true, token);
  }
  for (const token of ['1.0000000000000001', '0.99999999999999999', '1e-400', '-1E-400']) {
    const frame = decodeWireText(diagnostics(token));
    assert.equal(Number.isInteger(frame.result.errorCount), true);
    assert.equal(validateWireDefinition('DesignDiagnosticsResponse', frame), false, token);
    const snapshot = jsonSnapshot(frame); copyWireNumbers(frame, snapshot);
    assert.deepEqual(snapshot, frame);
    assert.equal(validateWireDefinition('DesignDiagnosticsResponse', snapshot), false, token);
  }
});

test("A M7 number token: nested arrays and unknown evidence cannot move to a sibling or numeric string", () => {
  const frame = decodeWireFrame(diagnostics('1.0', ',"unknown":[-1.25E+2,{"value":1e-400},[],{},"1e-400"],"other":{"value":0}'));
  assert.equal(validateWireDefinition('DesignDiagnosticsResponse', frame), true);
  assert.deepEqual(frame.result.unknown, [-125, { value: 0 }, [], {}, '1e-400']);
  const invalid = decodeWireText(diagnostics('1e-400', ',"unknown":[0,{"value":1.0}],"other":{"value":0}'));
  assert.equal(validateWireDefinition('DesignDiagnosticsResponse', invalid), false);
});

test("A M7 number token: syntax remains checked before numeric classification and generic id rejection", () => {
  for (const token of ['01', '+1', '1.', '.1', '1e', '1e+', '--1', 'NaN', 'Infinity'])
    assert.throws(() => decodeWireText(diagnostics(token)), { name: 'SyntaxError' });
  assert.throws(() => decodeWireFrame(diagnostics('0').replace('"id":1', '"id":1.0000000000000001')),
    { name: 'SyntaxError', message: 'Non-integer JSON token in a wire integer field' });
  assert.equal(validateWireDefinition('DesignDiagnosticsResponse', decodeWireText(diagnostics('1'))), true);
});
