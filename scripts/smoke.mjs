// Non-mutating HTTP checks against an already-running Wrangler Pages preview.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { toJSON, fromCrossJSON } from "seroval";
import { defaultSerovalPlugins } from "@tanstack/router-core";

const origin = process.env.RALLY_TEST_BASE_URL || "http://127.0.0.1:8788";
const check = async (path, expectedStatus, expectedText) => {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(response.status, expectedStatus, path);
  const body = await response.text();
  if (expectedText) assert.match(body, expectedText, path);
  console.log(`PASS ${path} (${response.status})`);
  return response;
};

await check("/", 200, /Make a plan/);
await check("/login", 200, /email/i);
await check("/my-rallies", 200, /Rallies/i);
await check("/r/invalid", 200, /valid/i);
await check("/m/invalid", 200, /valid/i);
await check("/does-not-exist", 404, /Page not found/);
await check("/llms.txt", 200, /Rally invitation/);
const fallback = await check("/api/public/og/invalid", 302);
assert.equal(fallback.headers.get("location"), new URL("/og.png", origin).href);
assert.equal(fallback.headers.get("cache-control"), "no-store");
const image = await fetch(new URL("/og.png", origin));
assert.equal(image.status, 200);
assert.match(image.headers.get("content-type"), /image\/png/);
console.log("PASS static PNG");

const workerDir = new URL("../dist/_worker.js/", import.meta.url);
const file = (await readdir(workerDir)).find((name) =>
  name.startsWith("__23tanstack-start-server-fn-resolver-"),
);
assert.ok(file, "Build the Pages worker before running this check");
const manifest = await readFile(new URL(file, workerDir), "utf8");
const ids = Object.fromEntries(
  [...manifest.matchAll(/"([a-f0-9]+)":\s*\{\s*functionName: "([^"]+)"/g)].map(
    (m) => [m[2].replace("_createServerFn_handler", ""), m[1]],
  ),
);
assert.ok(ids.suggestPlaces);

async function call(name, data, requestOrigin = origin) {
  return fetch(new URL(`/_serverFn/${ids[name]}`, origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: requestOrigin,
    },
    body: JSON.stringify(toJSON({ data })),
  });
}

const autocomplete = await call("suggestPlaces", { query: "ab" });
assert.equal(autocomplete.status, 200);
assert.deepEqual(
  fromCrossJSON(await autocomplete.json(), {
    refs: new Map(),
    plugins: defaultSerovalPlugins,
  }).result,
  {
    suggestions: [],
  },
);
console.log("PASS server function transport and short-query fallback");

const forbidden = await call(
  "suggestPlaces",
  { query: "ab" },
  "https://untrusted.example",
);
assert.equal(forbidden.status, 403);
console.log("PASS cross-origin server function request rejected");

const invalidCreate = await call("createRally", {});
assert.equal(invalidCreate.status, 200);
assert.ok(
  fromCrossJSON(await invalidCreate.json(), {
    refs: new Map(),
    plugins: defaultSerovalPlugins,
  }).error,
  "Invalid create payload must be rejected before database access",
);
console.log("PASS rally input validation");

console.log(
  "Local HTTP smoke checks passed. Hosted database/auth/CPU checks remain separate.",
);
