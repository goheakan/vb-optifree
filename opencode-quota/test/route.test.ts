import test from "node:test";
import assert from "node:assert/strict";

import { emptyLedger, noteHttpResult } from "../src/ledger";
import { applyLiteLLMRoute, chooseModel, parseRoute, poolIdForModel, ZEN_MODEL } from "../src/route";
import { resetFromUnknownError } from "../src/sources";

test("Zen sans plafond reste le premier choix", () => {
  const choice = chooseModel(emptyLedger(), ZEN_MODEL);
  assert.equal(choice.switched, false);
  assert.equal(choice.model.id, "deepseek-v4.1-flash-free");
  assert.equal(choice.warning, undefined);
});

test("un Zen bloqué passe à Groq avant l'envoi", () => {
  const ledger = noteHttpResult(emptyLedger(), "zen", { status: 429, usage: {} });
  const choice = chooseModel(ledger, ZEN_MODEL);
  assert.equal(choice.model.providerID, "litellm");
  assert.equal(choice.model.id, "groq-120b");
  assert.equal(choice.switched, true);
});

test("l'alias default saute un Groq bloqué vers DeepSeek, sans revenir en arrière", () => {
  const ledger = emptyLedger();
  ledger.pools.groq.used = { requests_today: 1000 };
  const choice = chooseModel(ledger, { providerID: "litellm", id: "default" });
  assert.equal(choice.model.id, "deepseek-flash");
  assert.match(choice.warning ?? "", /payant/);
  const direct = chooseModel(ledger, { providerID: "litellm", id: "gemini-flash" });
  assert.equal(direct.switched, false);
  assert.equal(direct.model.id, "gemini-flash");
  const fromGroq = chooseModel(ledger, { providerID: "litellm", id: "groq-120b" });
  assert.equal(fromGroq.model.id, "deepseek-flash");
});

test("un modèle explicite hors chaîne est conservé", () => {
  const ledger = emptyLedger();
  ledger.pools.groq.used = { requests_today: 1000 };
  const choice = chooseModel(ledger, { providerID: "litellm", id: "sensitive" });
  assert.equal(choice.model.id, "sensitive");
  assert.equal(choice.switched, false);
});

test("Zen, Groq et DeepSeek bloqués finissent sur Gemini", () => {
  const ledger = emptyLedger();
  ledger.pools.zen.forced_status = "blocked";
  ledger.pools.groq.used = { requests_today: 1000 };
  ledger.pools.deepseek.forced_status = "blocked";
  const choice = chooseModel(ledger, { providerID: "litellm", id: "groq-120b" });
  assert.equal(choice.model.id, "gemini-flash");
  assert.match(choice.warning ?? "", /Bascule vers litellm\/gemini-flash/);
  ledger.pools.gemini.forced_status = "blocked";
  const last = chooseModel(ledger, { providerID: "litellm", id: "groq-120b" });
  assert.equal(last.model.id, "gemini-flash");
  assert.match(last.warning ?? "", /Dernier recours/);
});

test("un ordre enregistré est suivi, y compris si Zen en est absent", () => {
  const custom = emptyLedger();
  custom.route = ["gemini", "groq"];
  const alias = chooseModel(custom, { providerID: "litellm", id: "default" });
  assert.equal(alias.model.id, "gemini-flash");
  const withoutZen = emptyLedger();
  withoutZen.route = ["groq", "deepseek", "gemini"];
  const fromZen = chooseModel(withoutZen, ZEN_MODEL);
  assert.equal(fromZen.model.id, "groq-120b");
  assert.equal(fromZen.switched, true);
});

test("parseRoute refuse un doublon et un pool inconnu", () => {
  assert.equal(parseRoute(["groq", "groq"]).ok, false);
  assert.equal(parseRoute(["openrouter"]).ok, false);
  const parsed = parseRoute(["Groq,", "deepseek gemini"]);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.route, ["groq", "deepseek", "gemini"]);
});

test("applyLiteLLMRoute écrit Groq, puis DeepSeek, puis Gemini", () => {
  const yaml = [
    "router_settings:",
    "  model_group_alias:",
    '    default: groq-120b',
    "  fallbacks:",
    '    - default: ["gemini-flash", "deepseek-flash"]',
    '    - gemini-flash: ["deepseek-flash"]',
    "",
    "litellm_settings:",
    "  drop_params: true",
    "",
  ].join("\n");
  const next = applyLiteLLMRoute(yaml, ["zen", "groq", "deepseek", "gemini"]);
  assert.match(next, /default: groq-120b/);
  assert.match(next, /default: \["deepseek-flash", "gemini-flash"\]/);
  assert.match(next, /groq-120b: \["deepseek-flash", "gemini-flash"\]/);
  assert.match(next, /deepseek-flash: \["gemini-flash"\]/);
  assert.doesNotMatch(next, /gemini-flash: \[/);
  assert.match(next, /drop_params: true/);
  assert.throws(() => applyLiteLLMRoute("sans alias\n", ["groq"]), /introuvable/);
});

test("un restant sous 20 % avertit sans changer de pool", () => {
  const ledger = emptyLedger();
  ledger.pools.groq.used = { requests_today: 850 };
  const choice = chooseModel(ledger, { providerID: "litellm", id: "groq-120b" });
  assert.equal(choice.switched, false);
  assert.equal(choice.reason, "warn");
  assert.match(choice.warning ?? "", /20 %/);
});

test("un 429 sans délai ne rallonge pas un reset déjà plus court", () => {
  const now = new Date("2026-11-11T20:53:24.939Z");
  const precise = resetFromUnknownError({ status: 429, retryAfterMs: 13_128_000 }, now);
  assert.equal(precise, "2026-11-12T00:32:12.939Z");
  const first = noteHttpResult(emptyLedger(now), "zen", { status: 429, usage: {}, reset_at: precise }, now);
  const second = noteHttpResult(first, "zen", { status: 429, usage: {} }, now);
  assert.equal(second.pools.zen.reset_at, precise);
});

test("le pool suit le modèle qui a répondu", () => {
  assert.equal(poolIdForModel({ providerID: "opencode", id: "deepseek-v4.1-flash-free" }), "zen");
  assert.equal(poolIdForModel({ providerID: "litellm", id: "groq-120b" }), "groq");
  assert.equal(poolIdForModel({ providerID: "litellm", id: "gemini-flash" }), "gemini");
  assert.equal(poolIdForModel({ providerID: "litellm", id: "deepseek-flash" }), "deepseek");
  assert.equal(poolIdForModel({ providerID: "litellm", id: "default" }), "groq");
  assert.equal(poolIdForModel({ providerID: "litellm", id: "sensitive" }), null);
});
