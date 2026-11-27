import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { utf8ByteLength } from "../../packages/client/dist/utf8-byte-length.js";

const encoder = new TextEncoder();
const same = value => assert.equal(utf8ByteLength(value), encoder.encode(value).byteLength);

test("A M7 UTF8: every UTF16 code unit and surrogate range endpoint matches native byte counts", () => {
  for (let unit = 0; unit <= 0xffff; unit++) same(String.fromCharCode(unit));
  for (let high = 0xd800; high <= 0xdbff; high++)
    for (const low of [0xdc00, 0xdc01, 0xdffe, 0xdfff]) same(String.fromCharCode(high, low));
  for (let low = 0xdc00; low <= 0xdfff; low++)
    for (const high of [0xd800, 0xd801, 0xdbfe, 0xdbff]) same(String.fromCharCode(high, low));
});

test("A M7 UTF8: chunk boundaries preserve pairs, malformed sequences and mixed multi-chunk text", () => {
  for (const offset of [4094, 4095, 4096, 4097, 8190, 8191, 8192])
    for (const text of ["🙂", "\ud800", "\udfff", "\ud800\ud800\udc00", "\udc00\ud800", "é位🙂\0\ufeff"])
      same("a".repeat(offset) + text + "界".repeat(5000));
  same(Array.from({ length: 0x10000 }, (_, i) => String.fromCharCode(i)).join(""));
});

test("A M7 UTF8: repeated inputs, default and coercion preserve exact counts without state carryover", () => {
  for (let i = 0; i < 3; i++)
    for (const value of [undefined, "", null, 0, -0, 1n, true, "a", "位🙂".repeat(300000), "é", "a".repeat(32769)]) same(value);
  const hints = [], value = { [Symbol.toPrimitive](hint) { hints.push(hint); return "位🙂"; } };
  same(value); assert.deepEqual(hints, ["string", "string"]);
  assert.throws(() => utf8ByteLength(Symbol("bad")), TypeError);
  const cause = new Error("coercion");
  assert.throws(() => utf8ByteLength({ toString() { throw cause; } }), error => error === cause);
});

test("A M7 UTF8: browser bundle counts and enforces cache/renderer boundaries with native or missing encodeInto", async () => {
  const bundle = await build({
    stdin: { contents: 'export {utf8ByteLength} from "./packages/client/dist/utf8-byte-length.js"; export {ReplyCache} from "./packages/client/dist/reply-cache.js"; export {connectElectronTransport} from "@hier/client/electron/renderer";', resolveDir: fileURLToPath(new URL("../..", import.meta.url)) },
    bundle: true, platform: "browser", target: "es2022", format: "iife", globalName: "Accounting", write: false, metafile: true,
  });
  assert.deepEqual(bundle.warnings, []);
  const importOnly = createContext({});
  runInContext(bundle.outputFiles[0].text, importOnly);
  assert.equal(runInContext("typeof Accounting.utf8ByteLength", importOnly), "function");
  for (const input of Object.keys(bundle.metafile.inputs)) assert.doesNotMatch(input, /(?:\/node\/|node_modules\/(?:electron|ajv))/u);
  for (const fallback of [false, true]) {
    const TextCodec = fallback ? class { encode(text) { return encoder.encode(text); } } : TextEncoder;
    const realm = createContext({ TextEncoder: TextCodec, TextDecoder, queueMicrotask, setTimeout });
    runInContext(bundle.outputFiles[0].text, realm);
    const result = await runInContext(`(async () => {
      if ([typeof process, typeof Buffer, typeof require].join() !== 'undefined,undefined,undefined') throw new Error('Node leak');
      const text='a'.repeat(4095)+'🙂位'.repeat(5000), value={text};
      const charge=new TextEncoder().encode('位').length+new TextEncoder().encode(JSON.stringify(value)).length;
      const cache=new Accounting.ReplyCache(1,charge); cache.put('位',value);
      if(cache.get('位')!==value || Accounting.utf8ByteLength(text)!==new TextEncoder().encode(text).length)throw new Error('count/cache');
      let receive,closed,delivered=0;const raw='{}'+' '.repeat(4*1024*1024-1);
      const bridge={version:1,connect(callback){receive=callback;return Promise.resolve({ok:true,version:1,sessionId:'browser'})},start(){receive({version:1,sessionId:'browser',kind:'frame',json:raw})},send(){},close(){},release(){}};
      const transport=await Accounting.connectElectronTransport(bridge);transport.onClose(cause=>closed=cause);transport.onMessage(()=>delivered++);
      await new Promise(done=>setTimeout(done,0));
      if(delivered!==0 || closed?.data.reason!=='prebind_buffer_overflow')throw new Error('renderer boundary');
      return 'complete';
    })()`, realm);
    assert.equal(result, "complete");
  }
});
