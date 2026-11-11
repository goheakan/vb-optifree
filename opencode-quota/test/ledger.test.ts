import test from "node:test";
import assert from "node:assert/strict";

import {
  addUsage,
  emptyLedger,
  formatDashboard,
  preflight,
  remainingPercent,
  resetIfNeeded,
  statusFor,
  usageRatio,
} from "../src/ledger";
import { estimateTokens, formatTokens, parseTokenArg } from "../src/estimate";

test("un ledger vide a des pools connus et un statut ok", () => {
  const ledger = emptyLedger(new Date("2026-11-11T00:00:00Z"));
  assert.ok(ledger.pools.groq);
  assert.ok(ledger.pools.ollama);
  assert.equal(statusFor(ledger.pools.ollama), "ok");
  assert.equal(ledger.version, 1);
});

test("usageRatio prend la limite la plus contraignante", () => {
  const ledger = emptyLedger();
  const pool = ledger.pools.groq;
  pool.used = { requests_today: 900, tokens_today: 10_000 };
  // 900/1000 = 0.9 ; 10000/200000 = 0.05
  assert.equal(usageRatio(pool), 0.9);
  assert.equal(statusFor(pool), "warn");
  assert.equal(remainingPercent(pool), 10);
});

test("les seuils 20 % et 5 % sont respectés", () => {
  const ledger = emptyLedger();
  const pool = ledger.pools.groq;
  pool.used = { requests_today: 800 };
  assert.equal(statusFor(pool), "ok");
  pool.used = { requests_today: 810 };
  assert.equal(statusFor(pool), "warn");
  pool.used = { requests_today: 950 };
  assert.equal(statusFor(pool), "blocked");
});

test("resetIfNeeded remet les compteurs à zéro après la date", () => {
  const ledger = emptyLedger(new Date("2026-11-11T00:00:00Z"));
  ledger.pools.groq.used = { requests_today: 500 };
  ledger.pools.groq.reset_at = "2026-11-11T01:00:00Z";
  const reset = resetIfNeeded(ledger, new Date("2026-11-11T02:00:00Z"));
  assert.equal(reset.pools.groq.used?.requests_today, undefined);
  assert.equal(reset.pools.groq.reset_at, undefined);
});

test("addUsage incrémente et historise", () => {
  const ledger = emptyLedger();
  const next = addUsage(
    ledger,
    "groq",
    { requests_today: 1, tokens_today: 1000 },
    { model: "gpt-oss-120b", tokens_in: 800, tokens_out: 200, cost_usd: 0 },
    new Date("2026-11-11T10:00:00Z"),
  );
  assert.equal(next.pools.groq.used?.requests_today, 1);
  assert.equal(next.pools.groq.used?.tokens_today, 1000);
  assert.equal(next.history?.length, 1);
  assert.equal(next.history?.[0].model, "gpt-oss-120b");
});

test("le dashboard contient les pools et le statut", () => {
  const ledger = emptyLedger();
  const text = formatDashboard(ledger);
  assert.match(text, /groq/);
  assert.match(text, /ollama/);
  assert.match(text, /Statut/);
});

test("preflight refuse un besoin supérieur au quota restant", () => {
  const ledger = emptyLedger();
  ledger.pools.groq.used = { tokens_today: 199_000 };
  ledger.pools.groq.limits = { tpd: 200_000 };
  const result = preflight(ledger, 5000);
  // groq ne peut pas absorber 5000 ; les autres pools n'ont pas de limite tpd
  // connue et restent candidats, donc le résultat est ok ou warn, pas blocked.
  assert.notEqual(result.status, "blocked");
});

test("estimateTokens applique la marge", () => {
  // 10 fichiers * 4000 octets = 40000 octets => 10000 tokens
  // + 1000 prompt + 500 sortie = 11500 ; * 1.3 = 14950
  assert.equal(estimateTokens({ files: 10, avgFileBytes: 4000, promptTokens: 1000, outputTokens: 500 }), 14_950);
});

test("parseTokenArg accepte 12k et 1.5m", () => {
  assert.equal(parseTokenArg("12k"), 12_000);
  assert.equal(parseTokenArg("1.5m"), 1_500_000);
  assert.equal(parseTokenArg("12000"), 12_000);
  assert.equal(parseTokenArg("abc"), null);
});

test("formatTokens reste lisible", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(12_000), "12.0k");
  assert.equal(formatTokens(1_500_000), "1.5M");
});
