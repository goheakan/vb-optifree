import test from "node:test";
import assert from "node:assert/strict";

import { assertLoopbackBaseUrl, isUsableMasterKey } from "../src/sources";

test("la clé maître placeholder est refusée", () => {
  assert.equal(isUsableMasterKey(undefined), false);
  assert.equal(isUsableMasterKey(""), false);
  assert.equal(isUsableMasterKey("change-me"), false);
  assert.equal(isUsableMasterKey("sk-vb-optifree-change-me"), false);
  assert.equal(isUsableMasterKey("short"), false);
  assert.equal(isUsableMasterKey("sk-" + "ab".repeat(16)), true);
});

test("la clé maître ne part que vers 127.0.0.1 ou ::1", () => {
  assert.equal(assertLoopbackBaseUrl("http://127.0.0.1:4000").origin, "http://127.0.0.1:4000");
  assert.equal(assertLoopbackBaseUrl("http://[::1]:4000/v1").hostname, "[::1]");

  for (const refused of [
    "http://localhost:4000",
    "https://openrouter.ai",
    "http://127.0.0.1.evil.example",
    "http://evil.example@127.0.0.1:4000",
    "http://127.0.0.1:4000@evil.example",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.throws(() => assertLoopbackBaseUrl(refused), /URL refusée/);
  }
});
