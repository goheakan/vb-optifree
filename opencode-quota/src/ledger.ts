/**
 * Ledger de quotas : types, calculs de statut et rendu du dashboard.
 * Module pur (aucune I/O) pour être facilement testable.
 */

export type PoolStatus = "ok" | "warn" | "blocked" | "unknown";

export interface PoolLimits {
  /** Requêtes par minute. */
  rpm?: number;
  /** Requêtes par jour. */
  rpd?: number;
  /** Tokens par minute. */
  tpm?: number;
  /** Tokens par jour. */
  tpd?: number;
  /** Crédits disponibles (OpenRouter). 0 ou absent = pas de limite connue. */
  credits_usd?: number;
  /** Budget LiteLLM en USD. */
  budget_usd?: number;
}

export interface PoolUsed {
  requests_today?: number;
  tokens_today?: number;
  requests_minute?: number;
  tokens_minute?: number;
  credits_usd?: number;
  spend_usd?: number;
}

export interface Pool {
  type: string;
  limits?: PoolLimits;
  used?: PoolUsed;
  reset_at?: string;
  source?: string;
  status?: PoolStatus;
  /** Bloque le pool jusqu'au reset, même sans limite chiffrée (réponse 429). */
  forced_status?: PoolStatus;
  notes?: string;
}

export interface HistoryEntry {
  ts: string;
  pool: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  note?: string;
}

export interface Ledger {
  version: 1;
  updated_at: string;
  pools: Record<string, Pool>;
  history?: HistoryEntry[];
  /** Ordre des pools. Absent = zen, groq, deepseek, gemini. */
  route?: string[];
}

export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}

export function emptyLedger(date: Date = new Date()): Ledger {
  return {
    version: 1,
    updated_at: nowIso(date),
    pools: {
      zen: {
        type: "requests",
        limits: {},
        used: { requests_today: 0 },
        source: "local",
        notes: "OpenCode Zen free. Pas de plafond inventé : le statut reste inconnu jusqu'à un 429.",
      },
      groq: {
        type: "rpm_rpd_tpm_tpd",
        limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
        used: { requests_today: 0, tokens_today: 0 },
        source: "headers",
      },
      gemini: {
        type: "rpd",
        limits: {},
        used: { requests_today: 0 },
        source: "manual",
        notes: "Pas de plafond RPD tant qu'un en-tête ou un 429 ne l'a pas donné.",
      },
      deepseek: {
        type: "paid",
        limits: {},
        used: { requests_today: 0 },
        source: "manual",
        notes: "Payant. Dans l'ordre par défaut, il passe avant Gemini.",
      },
      openrouter: {
        type: "credit",
        limits: { credits_usd: 0 },
        used: { credits_usd: 0 },
        source: "api:/api/v1/key",
        notes: "Hors chaîne tant qu'un identifiant :free réel n'est pas fixé.",
      },
      litellm: {
        type: "spend",
        limits: {},
        used: { spend_usd: 0 },
        source: "api:/key/info",
      },
    },
    history: [],
  };
}

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function ratio(used: number | undefined, limit: number | undefined): number | null {
  if (!positive(limit)) return null;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  return Math.max(0, used) / limit;
}

/**
 * Ratio de consommation le plus défavorable du pool (0 = vide, 1 = plein).
 * `null` si aucune limite exploitable n'est connue.
 */
export function usageRatio(pool: Pool): number | null {
  if (pool.type === "unlimited") return 0;
  const limits = pool.limits ?? {};
  const used = pool.used ?? {};

  const ratios = [
    ratio(used.requests_today, limits.rpd),
    ratio(used.requests_minute, limits.rpm),
    ratio(used.tokens_today, limits.tpd),
    ratio(used.tokens_minute, limits.tpm),
    ratio(used.credits_usd, limits.credits_usd),
    ratio(used.spend_usd, limits.budget_usd),
  ].filter((value): value is number => value !== null);

  if (ratios.length === 0) return null;
  return Math.max(...ratios);
}

export function remainingPercent(pool: Pool): number | null {
  const used = usageRatio(pool);
  if (used === null) return null;
  const percent = Math.max(0, Math.min(100, (1 - used) * 100));
  // Évite les artefacts du type 9.999999999999998.
  return Math.round(percent * 100) / 100;
}

/**
 * Statuts : ok (>= 20 % restant), warn (< 20 %), blocked (<= 5 %),
 * unknown (aucune limite connue).
 */
export function statusFor(pool: Pool): PoolStatus {
  if (pool.forced_status === "blocked") return "blocked";
  const used = usageRatio(pool);
  if (used === null) return "unknown";
  if (used >= 0.95) return "blocked";
  if (used > 0.8) return "warn";
  return "ok";
}

export function resetIfNeeded(ledger: Ledger, now: Date = new Date()): Ledger {
  const pools: Record<string, Pool> = {};
  for (const [id, pool] of Object.entries(ledger.pools)) {
    if (!pool.reset_at) {
      pools[id] = pool;
      continue;
    }
    const reset = Date.parse(pool.reset_at);
    if (Number.isNaN(reset) || reset > now.getTime()) {
      pools[id] = pool;
      continue;
    }
    pools[id] = {
      ...pool,
      used: {},
      reset_at: undefined,
      forced_status: undefined,
      status: "ok",
    };
  }
  return {
    ...ledger,
    updated_at: nowIso(now),
    pools,
  };
}

export function addUsage(
  ledger: Ledger,
  poolId: string,
  usage: PoolUsed,
  entry?: Omit<HistoryEntry, "ts" | "pool">,
  now: Date = new Date(),
): Ledger {
  const pool = ledger.pools[poolId];
  if (!pool) return ledger;

  const current = pool.used ?? {};
  const merged: PoolUsed = {
    requests_today: (current.requests_today ?? 0) + (usage.requests_today ?? 0),
    tokens_today: (current.tokens_today ?? 0) + (usage.tokens_today ?? 0),
    requests_minute: (current.requests_minute ?? 0) + (usage.requests_minute ?? 0),
    tokens_minute: (current.tokens_minute ?? 0) + (usage.tokens_minute ?? 0),
    credits_usd: (current.credits_usd ?? 0) + (usage.credits_usd ?? 0),
    spend_usd: (current.spend_usd ?? 0) + (usage.spend_usd ?? 0),
  };

  const history = [
    ...(ledger.history ?? []),
    ...(entry
      ? [{ ...entry, ts: nowIso(now), pool: poolId } satisfies HistoryEntry]
      : []),
  ].slice(-500);

  const nextPool: Pool = { ...pool, used: merged };
  nextPool.status = statusFor(nextPool);

  return {
    ...ledger,
    updated_at: nowIso(now),
    pools: { ...ledger.pools, [poolId]: nextPool },
    history,
  };
}

export function refreshStatuses(ledger: Ledger): Ledger {
  const pools: Record<string, Pool> = {};
  for (const [id, pool] of Object.entries(ledger.pools)) {
    pools[id] = { ...pool, status: statusFor(pool) };
  }
  return { ...ledger, pools };
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value.slice(0, width);
  return value + " ".repeat(width - value.length);
}

function shortReset(value: string | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export function formatDashboard(ledger: Ledger): string {
  const lines: string[] = [];
  lines.push(`Ledger : ${ledger.updated_at}`);
  lines.push("");
  lines.push(
    `${pad("Pool", 12)} ${pad("Restant", 9)} ${pad("Reset", 18)} ${pad("Source", 18)} Statut`,
  );
  lines.push("-".repeat(72));

  const order = ["zen", "groq", "deepseek", "gemini", "openrouter", "litellm"];
  const ids = [
    ...order.filter((id) => id in ledger.pools),
    ...Object.keys(ledger.pools).filter((id) => !order.includes(id)),
  ];

  for (const id of ids) {
    const pool = ledger.pools[id];
    const percent = remainingPercent(pool);
    const remaining = percent === null ? "?" : `${percent.toFixed(0)}%`;
    const status = statusFor(pool);
    const icon =
      status === "ok" ? "OK" : status === "warn" ? "WARN" : status === "blocked" ? "BLOCKED" : "?";
    lines.push(
      `${pad(id, 12)} ${pad(remaining, 9)} ${pad(shortReset(pool.reset_at), 18)} ${pad(
        pool.source ?? "-",
        18,
      )} ${icon}`,
    );
  }

  const warn = ids.filter((id) => statusFor(ledger.pools[id]) === "warn");
  const blocked = ids.filter((id) => statusFor(ledger.pools[id]) === "blocked");
  if (blocked.length > 0) {
    lines.push("");
    lines.push(`⛔ Pool(s) épuisé(s) : ${blocked.join(", ")}`);
  }
  if (warn.length > 0) {
    lines.push("");
    lines.push(`⚠️ Pool(s) sous 20 % : ${warn.join(", ")}`);
  }
  return lines.join("\n");
}

export function preflight(ledger: Ledger, tokens: number): {
  status: PoolStatus;
  message: string;
  candidates: string[];
} {
  const refreshed = refreshStatuses(ledger);
  const candidates = Object.entries(refreshed.pools)
    .filter(([, pool]) => pool.type !== "unlimited" && statusFor(pool) !== "blocked")
    .filter(([, pool]) => {
      const limit = pool.limits?.tpd;
      const used = pool.used?.tokens_today ?? 0;
      return !positive(limit) || limit - used >= tokens;
    })
    .map(([id]) => id);

  if (candidates.length === 0) {
    return {
      status: "blocked",
      message: `⛔ Aucun pool ne peut absorber ${tokens} tokens. Réduis la tâche ou libère un quota.`,
      candidates,
    };
  }

  const tight = candidates.filter((id) => statusFor(refreshed.pools[id]) === "warn");
  if (tight.length > 0) {
    return {
      status: "warn",
      message: `⚠️ ${tokens} tokens : pools disponibles mais serrés (${tight.join(", ")}).`,
      candidates,
    };
  }

  return {
    status: "ok",
    message: `OK pour ${tokens} tokens. Pools candidats : ${candidates.join(", ")}.`,
    candidates,
  };
}

export interface HttpObservation {
  status: number;
  usage: PoolUsed;
  reset_at?: string;
}

/**
 * En-têtes chiffrés : remplace la consommation, sans l'additionner.
 * HTTP 200 sans en-tête : une requête de plus.
 * HTTP 429 : pool bloqué jusqu'au reset fourni, sinon 24 h.
 */
export function noteHttpResult(
  ledger: Ledger,
  poolId: string,
  observation: HttpObservation,
  now: Date = new Date(),
): Ledger {
  const pool = ledger.pools[poolId];
  if (!pool) return ledger;

  if (observation.status === 429) {
    const existing = pool.reset_at && Date.parse(pool.reset_at) > now.getTime() ? pool.reset_at : undefined;
    const reset =
      observation.reset_at ?? existing ?? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const next: Pool = {
      ...pool,
      forced_status: "blocked",
      reset_at: reset,
      source: "http:429",
    };
    next.status = statusFor(next);
    return {
      ...ledger,
      updated_at: nowIso(now),
      pools: { ...ledger.pools, [poolId]: next },
    };
  }

  if (observation.status < 200 || observation.status >= 300) return ledger;

  const hasAbsolute =
    observation.usage.requests_today !== undefined || observation.usage.tokens_today !== undefined;
  if (hasAbsolute) {
    const next: Pool = {
      ...pool,
      used: { ...(pool.used ?? {}), ...observation.usage },
      reset_at: observation.reset_at ?? pool.reset_at,
      forced_status: undefined,
      source: "headers",
    };
    next.status = statusFor(next);
    return {
      ...ledger,
      updated_at: nowIso(now),
      pools: { ...ledger.pools, [poolId]: next },
    };
  }

  const cleared: Ledger = {
    ...ledger,
    pools: {
      ...ledger.pools,
      [poolId]: { ...pool, forced_status: undefined },
    },
  };
  return addUsage(cleared, poolId, { requests_today: 1 }, undefined, now);
}
