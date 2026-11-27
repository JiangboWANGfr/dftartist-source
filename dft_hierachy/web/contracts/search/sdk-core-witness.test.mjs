import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { HierError } from "@hier/client";
import { METHODS } from "@hier/protocol-types";
import { command, fixture, createSession as session } from "./core-session.mjs";

const kinds = [
  "definition",
  "instance",
  "port",
  "signal",
  "process",
  "register",
];

// Calls the existing SDK only. It is not a mock or replacement SearchModel.
async function pages(client, query, limit) {
  const replies = [];
  let cursor;
  do {
    assert.ok(replies.length < 200, "finite A fixture must finish paging");
    const reply = await client.search(query, {
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    });
    assert.equal(reply.completeness.status, "complete");
    assert.ok(reply.result.items.length <= limit);
    assert.ok(Object.isFrozen(reply));
    assert.ok(Object.isFrozen(reply.result.items));
    replies.push(reply);
    cursor = reply.result.next;
  } while (cursor !== undefined);
  return { replies, hits: replies.flatMap((reply) => reply.result.items) };
}

test("A SDK/Core search: six original hit kinds and complete page sequences", async (t) => {
  const client = await session(t);
  const whole = await pages(client, { text: "" }, 200);
  const small = await pages(client, { text: "" }, 3);
  assert.deepEqual(small.hits, whole.hits);
  assert.deepEqual([...new Set(whole.hits.map((hit) => hit.kind))], kinds);
  assert.equal(
    new Set(whole.hits.map((hit) => hit.ref)).size,
    whole.hits.length,
  );
  for (const hit of whole.hits) {
    assert.ok(Object.isFrozen(hit));
    assert.ok(Object.isFrozen(hit.path));
    if (hit.kind === "definition") {
      assert.equal(hit.ref, hit.def);
      assert.equal(Object.hasOwn(hit, "inst"), false);
    } else assert.ok(hit.inst);
  }
  const digest = async (file) =>
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  console.log(
    JSON.stringify({
      productionSearchModelExecuted: false,
      hits: whole.hits.length,
      smallPages: small.replies.length,
      allowsPartial: METHODS.search.allowsPartial,
      core: path.resolve(command),
      coreSha256: await digest(command),
      fixtureSha256: await digest(fixture),
    }),
  );
});

test("A SDK/Core search: literal case/space/glob characters and empty kind filter", async (t) => {
  const client = await session(t);
  assert.equal(
    (await pages(client, { text: "", kinds: [] }, 2)).hits.length,
    0,
  );
  const lower = (await pages(client, { text: "needle", kinds: ["signal"] }, 2))
    .hits;
  const upper = (await pages(client, { text: "Needle", kinds: ["signal"] }, 2))
    .hits;
  assert.equal(lower.length, 4);
  assert.equal(upper.length, 4);
  assert.ok(lower.every((hit) => hit.name === "needle"));
  assert.ok(upper.every((hit) => hit.name === "Needle"));
  assert.equal(
    (await pages(client, { text: " needle", kinds: ["signal"] }, 2)).hits
      .length,
    0,
  );
  const literal = (await pages(client, { text: "*?", kinds: ["signal"] }, 2))
    .hits;
  assert.equal(literal.length, 4);
  assert.ok(literal.every((hit) => hit.name === "literal*?"));
  const selected = await pages(
    client,
    { text: "", kinds: ["port", "signal"] },
    200,
  );
  const duplicate = await pages(
    client,
    { text: "", kinds: ["signal", "port", "signal"] },
    200,
  );
  assert.deepEqual(duplicate.hits, selected.hits);
});

test("A SDK/Core search: scope uses subtree identity and instance definition names", async (t) => {
  const client = await session(t);
  const roots = (await client.roots()).result;
  assert.equal(roots.length, 2);
  const top = roots.find((item) => item.name === "search_top");
  assert.ok(top);
  const children = (await client.children(top.ref)).result.items;
  const left = children.find((item) => item.name === "left");
  const sibling = children.find((item) => item.name === "leftish");
  assert.ok(left && sibling);
  const scoped = (await pages(client, { text: "", scope: left.ref }, 2)).hits;
  assert.ok(scoped.length > 1);
  for (const hit of scoped) {
    if (hit.kind === "definition") assert.equal(hit.name, "search_leaf");
    else assert.equal(hit.inst, left.ref);
  }
  assert.ok(
    scoped.some((hit) => hit.kind === "instance" && hit.ref === left.ref),
  );
  const instances = (
    await pages(client, { text: "search_leaf", kinds: ["instance"] }, 2)
  ).hits;
  assert.equal(instances.length, 4);
  assert.ok(instances.some((hit) => hit.ref === sibling.ref));
});

test("A SDK/Core search: definition occurrences and real object path round trips", async (t) => {
  const client = await session(t);
  const hits = (await pages(client, { text: "" }, 200)).hits;
  const definition = hits.find(
    (hit) => hit.kind === "definition" && hit.name === "search_leaf",
  );
  assert.ok(definition);
  const occurrences = [];
  let cursor;
  do {
    const reply = await client.instancesOf(definition.ref, {
      limit: 2,
      ...(cursor === undefined ? {} : { cursor }),
    });
    assert.equal(reply.completeness.status, "complete");
    occurrences.push(...reply.result.items);
    cursor = reply.result.next;
  } while (cursor !== undefined);
  assert.equal(occurrences.length, 4);
  assert.equal(new Set(occurrences.map((item) => item.ref)).size, 4);
  for (const hit of hits.filter((item) =>
    ["instance", "port", "signal"].includes(item.kind),
  )) {
    const reply = await client.resolvePath(hit.pathText);
    assert.ok(reply.result.includes(hit.ref), hit.pathText);
  }
  const first = occurrences[0];
  const sameName = hits.filter(
    (hit) => hit.inst === first.ref && hit.name === "a",
  );
  assert.deepEqual(
    sameName.map((hit) => hit.kind),
    ["port", "signal"],
  );
  assert.notEqual(sameName[0].ref, sameName[1].ref);
});

test("A SDK/Core search: semantic scope errors and pre-cancel preserve session", async (t) => {
  const client = await session(t);
  const port = (await pages(client, { text: "", kinds: ["port"] }, 200))
    .hits[0];
  await assert.rejects(
    client.search({ text: "", scope: port.ref }),
    (error) =>
      error instanceof HierError &&
      error.code === "bad_request" &&
      error.origin === "core",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    client.search({ text: "cancelled" }, {}, controller.signal),
    (error) => error instanceof HierError && error.code === "cancelled",
  );
  assert.equal(
    (await client.search({ text: "no such literal" })).completeness.status,
    "complete",
  );
});
