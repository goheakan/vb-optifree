import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { emptyLedger } from "../src/ledger";
import { loadDurableLedger, saveDurableLedger, type LedgerStore } from "../src/sources";

function memoryStore(): LedgerStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
  };
}

test("le fichier reprend la main si le stockage du plugin échoue", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vb-ledger-"));
  const path = join(dir, "quotas.json");
  try {
    const ledger = emptyLedger(new Date("2026-11-11T03:00:00Z"));
    ledger.pools.zen.used = { requests_today: 3 };
    const broken: LedgerStore = {
      get: async () => {
        throw new Error("storage down");
      },
      set: async () => {
        throw new Error("storage down");
      },
    };
    await saveDurableLedger(ledger, broken, path);
    const loaded = await loadDurableLedger(broken, path);
    assert.equal(loaded.pools.zen.used?.requests_today, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("la copie la plus récente l'emporte entre fichier et stockage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vb-ledger-"));
  const path = join(dir, "quotas.json");
  try {
    const older = emptyLedger(new Date("2026-11-11T01:00:00Z"));
    await saveDurableLedger(older, null, path);
    const newer = emptyLedger(new Date("2026-11-11T04:00:00Z"));
    newer.pools.groq.used = { requests_today: 7 };
    const store = memoryStore();
    await saveDurableLedger(newer, store, path);
    const loaded = await loadDurableLedger(store, path);
    assert.equal(loaded.pools.groq.used?.requests_today, 7);

    const fileWins = emptyLedger(new Date("2026-11-11T05:00:00Z"));
    fileWins.pools.groq.used = { requests_today: 9 };
    await saveDurableLedger(fileWins, null, path);
    const fromFile = await loadDurableLedger(store, path);
    assert.equal(fromFile.pools.groq.used?.requests_today, 9);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
