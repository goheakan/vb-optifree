/**
 * Lecture/écriture du ledger et rafraîchissement depuis les sources.
 * Aucune clé n'est écrite ici : les secrets restent dans l'environnement ou
 * dans ~/.config/litellm/.env.
 */

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  emptyLedger,
  nowIso,
  resetIfNeeded,
  refreshStatuses,
  type Ledger,
  type Pool,
  type PoolUsed,
} from "./ledger";
import { applyLiteLLMRoute } from "./route";

export interface RefreshOptions {
  openRouterKey?: string;
  litellmBaseUrl?: string;
  litellmMasterKey?: string;
}

export interface RefreshResult {
  ledger: Ledger;
  errors: string[];
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME;
  if (base && base.trim() !== "") return base;
  return join(homedir(), ".config");
}

export function stateDir(): string {
  const base = process.env.XDG_STATE_HOME;
  if (base && base.trim() !== "") return join(base, "vb-optifree");
  return join(homedir(), ".local", "state", "vb-optifree");
}

/**
 * Lit ~/.config/litellm/.env sans l'exporter dans l'environnement du process.
 * Les valeurs ne sont jamais journalisées.
 */
export async function readEnvFile(
  path: string = join(configDir(), "litellm", ".env"),
): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path, "utf8");
    const env: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[match[1]] = value;
    }
    return env;
  } catch {
    return {};
  }
}

export function ledgerPath(): string {
  return join(stateDir(), "quotas.json");
}

function isLedger(value: unknown): value is Ledger {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Ledger>;
  return candidate.version === 1 && !!candidate.pools && typeof candidate.pools === "object";
}

export async function loadLedger(path: string = ledgerPath()): Promise<Ledger> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isLedger(parsed)) return emptyLedger();
    return { ...emptyLedger(), ...parsed, pools: { ...emptyLedger().pools, ...parsed.pools } };
  } catch {
    return emptyLedger();
  }
}

export async function saveLedger(ledger: Ledger, path: string = ledgerPath()): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const tmp = join(dir, `.quotas.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

/**
 * La clé maître ne part que vers la boucle locale.
 * `localhost` est refusé : il dépend de la résolution DNS / de /etc/hosts.
 * L'URL renvoyée à l'appelant n'est jamais recopiée dans un message d'erreur.
 */
export function assertLoopbackBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("LiteLLM : URL refusée");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("LiteLLM : URL refusée");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("LiteLLM : URL refusée");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("LiteLLM : URL refusée");
  }
  return url;
}

/**
 * Délai annoncé par un 429 (retryAfterMs). Rien si le champ est absent :
 * l'appelant retombe alors sur 24 h.
 */
export function resetFromUnknownError(error: unknown, now: Date = new Date()): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  const raw = record.retryAfterMs ?? record.retry_after_ms;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) return undefined;
  return new Date(now.getTime() + raw).toISOString();
}

export function isUsableMasterKey(key: string | undefined): boolean {
  if (!key) return false;
  if (key.length < 16) return false;
  if (/change-me/i.test(key)) return false;
  if (/[\r\n]/.test(key)) return false;
  return true;
}

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseReset(value: string | null, now: Date): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const iso = Date.parse(trimmed);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();

  const duration = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (duration) {
    const hours = Number(duration[1] ?? 0);
    const minutes = Number(duration[2] ?? 0);
    const seconds = Number(duration[3] ?? 0);
    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) return new Date(now.getTime() + total * 1000).toISOString();
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(now.getTime() + numeric * 1000).toISOString();
  }
  return undefined;
}

/**
 * Extrait la consommation des en-têtes de rate limit (Groq notamment).
 * Les en-têtes ne sont pas toujours relayés par LiteLLM : c'est une source
 * opportuniste, pas une garantie.
 */
export function parseRateLimitHeaders(headers: Headers, now: Date = new Date()): {
  usage: PoolUsed;
  reset_at?: string;
} {
  const limitRequests = headerNumber(headers, "x-ratelimit-limit-requests");
  const remainingRequests = headerNumber(headers, "x-ratelimit-remaining-requests");
  const limitTokens = headerNumber(headers, "x-ratelimit-limit-tokens");
  const remainingTokens = headerNumber(headers, "x-ratelimit-remaining-tokens");

  const usage: PoolUsed = {};
  if (limitRequests !== null && remainingRequests !== null) {
    usage.requests_today = Math.max(0, limitRequests - remainingRequests);
  }
  if (limitTokens !== null && remainingTokens !== null) {
    usage.tokens_today = Math.max(0, limitTokens - remainingTokens);
  }

  const reset =
    parseReset(headers.get("x-ratelimit-reset-requests"), now) ??
    parseReset(headers.get("x-ratelimit-reset-tokens"), now) ??
    parseReset(headers.get("retry-after"), now);

  return { usage, reset_at: reset };
}

export interface OpenRouterKeyInfo {
  label?: string;
  limit_usd?: number;
  usage_usd?: number;
  remaining_usd?: number;
}

interface OpenRouterResponse {
  data?: {
    label?: string;
    limit?: number | null;
    usage?: number;
    limit_remaining?: number | null;
  };
}

export async function fetchOpenRouterKey(apiKey: string): Promise<OpenRouterKeyInfo> {
  const response = await fetch("https://openrouter.ai/api/v1/key", {
    redirect: "manual",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("OpenRouter /api/v1/key : redirection refusée");
  }
  if (!response.ok) {
    throw new Error(`OpenRouter /api/v1/key : HTTP ${response.status}`);
  }
  const payload = (await response.json()) as OpenRouterResponse;
  const data = payload.data ?? {};
  return {
    label: data.label,
    limit_usd: typeof data.limit === "number" ? data.limit : undefined,
    usage_usd: typeof data.usage === "number" ? data.usage : 0,
    remaining_usd: typeof data.limit_remaining === "number" ? data.limit_remaining : undefined,
  };
}

export interface LiteLLMKeyInfo {
  spend_usd?: number;
  budget_usd?: number;
}

interface LiteLLMKeyResponse {
  info?: {
    spend?: number;
    max_budget?: number | null;
  };
}

export async function fetchLiteLLMKeyInfo(
  baseUrl: string,
  masterKey: string,
): Promise<LiteLLMKeyInfo> {
  if (!isUsableMasterKey(masterKey)) {
    throw new Error("LiteLLM : clé maître refusée");
  }
  const url = assertLoopbackBaseUrl(baseUrl);
  const response = await fetch(new URL("/key/info", url.origin), {
    redirect: "manual",
    headers: { Authorization: `Bearer ${masterKey}` },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("LiteLLM /key/info : redirection refusée");
  }
  if (!response.ok) {
    throw new Error(`LiteLLM /key/info : HTTP ${response.status}`);
  }
  const payload = (await response.json()) as LiteLLMKeyResponse;
  const info = payload.info ?? {};
  return {
    spend_usd: typeof info.spend === "number" ? info.spend : undefined,
    budget_usd:
      typeof info.max_budget === "number" && info.max_budget > 0 ? info.max_budget : undefined,
  };
}

function updatePool(ledger: Ledger, id: string, patch: Partial<Pool>): Ledger {
  const current = ledger.pools[id];
  if (!current) return ledger;
  const next: Pool = {
    ...current,
    ...patch,
    limits: { ...(current.limits ?? {}), ...(patch.limits ?? {}) },
    used: { ...(current.used ?? {}), ...(patch.used ?? {}) },
  };
  return { ...ledger, pools: { ...ledger.pools, [id]: next } };
}

export const LEDGER_STORAGE_KEY = "ledger";

export interface LedgerStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

function normalizeLedger(parsed: Ledger): Ledger {
  return {
    ...emptyLedger(),
    ...parsed,
    pools: { ...emptyLedger().pools, ...parsed.pools },
    history: parsed.history ?? [],
  };
}

/**
 * Le fichier reste la copie de secours. Si le stockage du plugin est illisible,
 * on revient au fichier. La copie la plus récente l'emporte.
 */
export async function loadDurableLedger(
  store?: LedgerStore | null,
  path: string = ledgerPath(),
): Promise<Ledger> {
  const file = await loadLedger(path);
  if (!store) return file;
  try {
    const raw = await store.get(LEDGER_STORAGE_KEY);
    if (!isLedger(raw)) return file;
    const stored = normalizeLedger(raw);
    const fileMs = Date.parse(file.updated_at);
    const storedMs = Date.parse(stored.updated_at);
    if (Number.isNaN(storedMs)) return file;
    if (Number.isNaN(fileMs) || storedMs >= fileMs) return stored;
    return file;
  } catch {
    return file;
  }
}

export function litellmConfigPath(): string {
  return join(configDir(), "litellm", "config.yaml");
}

/**
 * Réécrit seulement l'alias et les replis. Le fichier absent n'est pas créé :
 * l'ordre du plugin reste valable sans passerelle installée.
 */
export async function saveLiteLLMRoute(route: readonly string[]): Promise<"updated" | "absent"> {
  const path = litellmConfigPath();
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return "absent";
  }
  const next = applyLiteLLMRoute(raw, route);
  const tmp = join(dirname(path), `.config.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, next, { mode: 0o644 });
  await chmod(tmp, 0o644);
  await rename(tmp, path);
  await chmod(path, 0o644);
  return "updated";
}

export async function saveDurableLedger(
  ledger: Ledger,
  store?: LedgerStore | null,
  path: string = ledgerPath(),
): Promise<void> {
  await saveLedger(ledger, path);
  if (!store) return;
  try {
    await store.set(LEDGER_STORAGE_KEY, JSON.parse(JSON.stringify(ledger)) as unknown);
  } catch {
    // Le fichier vient d'être écrit : le prochain chargement le reprendra.
  }
}

export async function refreshLedger(
  input: Ledger,
  options: RefreshOptions = {},
): Promise<RefreshResult> {
  const now = new Date();
  let ledger = resetIfNeeded(input, now);
  const errors: string[] = [];

  if (options.openRouterKey) {
    try {
      const info = await fetchOpenRouterKey(options.openRouterKey);
      ledger = updatePool(ledger, "openrouter", {
        limits: { credits_usd: info.limit_usd ?? 0 },
        used: { credits_usd: info.usage_usd ?? 0 },
        source: "api:/api/v1/key",
        notes: info.label,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (options.litellmBaseUrl && options.litellmMasterKey) {
    try {
      if (!isUsableMasterKey(options.litellmMasterKey)) {
        throw new Error("LiteLLM : clé maître refusée");
      }
      assertLoopbackBaseUrl(options.litellmBaseUrl);
      const info = await fetchLiteLLMKeyInfo(options.litellmBaseUrl, options.litellmMasterKey);
      ledger = updatePool(ledger, "litellm", {
        limits: { budget_usd: info.budget_usd },
        used: { spend_usd: info.spend_usd ?? 0 },
        source: "api:/key/info",
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  ledger = refreshStatuses({ ...ledger, updated_at: nowIso(now) });
  return { ledger, errors };
}
