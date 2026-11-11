/**
 * Choix du pool avant l'envoi. Fonction pure : le plugin l'applique,
 * LiteLLM garde les clés et le repli 429/503 pendant la requête.
 */

import { resetIfNeeded, refreshStatuses, statusFor, type Ledger, type PoolStatus } from "./ledger";

export interface ModelRef {
  providerID: string;
  id: string;
}

export interface ChainEntry {
  pool: string;
  providerID: string;
  id: string;
}

export const POOL_CATALOG: Record<string, ChainEntry> = {
  zen: { pool: "zen", providerID: "opencode", id: "deepseek-v4.1-flash-free" },
  groq: { pool: "groq", providerID: "litellm", id: "groq-120b" },
  deepseek: { pool: "deepseek", providerID: "litellm", id: "deepseek-flash" },
  gemini: { pool: "gemini", providerID: "litellm", id: "gemini-flash" },
};

/** Zen d'abord, puis Groq, DeepSeek, et Gemini en dernier. */
export const DEFAULT_ROUTE = ["zen", "groq", "deepseek", "gemini"] as const;

export const ZEN_MODEL: ModelRef = {
  providerID: POOL_CATALOG.zen.providerID,
  id: POOL_CATALOG.zen.id,
};

export function normalizeRoute(route: readonly string[] | undefined): string[] {
  const source = route && route.length > 0 ? route : DEFAULT_ROUTE;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of source) {
    const id = raw.trim().toLowerCase();
    if (!POOL_CATALOG[id] || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : [...DEFAULT_ROUTE];
}

export function routeOf(ledger: Ledger): ChainEntry[] {
  return normalizeRoute(ledger.route).map((id) => POOL_CATALOG[id]);
}

export function formatRoute(route: readonly string[]): string {
  return route.join(" → ");
}

export function parseRoute(tokens: readonly string[]): { ok: true; route: string[] } | { ok: false; message: string } {
  const flat = tokens
    .flatMap((token) => token.split(/[,\s]+/))
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");
  if (flat.length === 0) {
    return { ok: false, message: "Indique au moins un pool : zen, groq, deepseek, gemini." };
  }
  const unknown = flat.filter((id) => !POOL_CATALOG[id]);
  if (unknown.length > 0) {
    return {
      ok: false,
      message: `Pool inconnu : ${unknown.join(", ")}. Connus : zen, groq, deepseek, gemini.`,
    };
  }
  if (new Set(flat).size !== flat.length) {
    return { ok: false, message: "Chaque pool ne peut apparaître qu'une fois." };
  }
  return { ok: true, route: flat };
}

export function renderLiteLLMRoute(route: readonly string[]): { alias: string; fallbacks: string[] } {
  const hops = normalizeRoute(route)
    .filter((id) => POOL_CATALOG[id].providerID === "litellm")
    .map((id) => POOL_CATALOG[id].id);
  const alias = hops[0] ?? "groq-120b";
  const quote = (id: string) => `"${id}"`;
  const fallbacks: string[] = [];
  if (hops.length > 1) {
    fallbacks.push(`    - default: [${hops.slice(1).map(quote).join(", ")}]`);
  }
  for (let index = 0; index < hops.length - 1; index += 1) {
    fallbacks.push(`    - ${hops[index]}: [${hops.slice(index + 1).map(quote).join(", ")}]`);
  }
  return { alias, fallbacks };
}

/** Remplace l'alias et les replis. Le reste du fichier, y compris les clés, n'est pas touché. */
export function applyLiteLLMRoute(yaml: string, route: readonly string[]): string {
  const { alias, fallbacks } = renderLiteLLMRoute(route);
  const fallbackBlock =
    fallbacks.length > 0 ? ["  fallbacks:", ...fallbacks].join("\n") : "  fallbacks: []";
  const block = [
    "  model_group_alias:",
    `    default: ${alias}`,
    "",
    "  # Repli sans retour en arrière, dans l'ordre choisi.",
    fallbackBlock,
    "",
  ].join("\n");
  const next = yaml.replace(/  model_group_alias:[\s\S]*?\n(?=litellm_settings:)/, block);
  if (next === yaml) {
    throw new Error("bloc model_group_alias introuvable");
  }
  return next;
}

export type ChoiceReason = "kept" | "default" | "blocked" | "warn";

export interface Choice {
  model: ModelRef;
  switched: boolean;
  reason: ChoiceReason;
  warning?: string;
}

export function isPoolUsable(status: PoolStatus): boolean {
  return status === "ok" || status === "warn" || status === "unknown";
}

export function poolIdForModel(model: { providerID?: string; id?: string }): string | null {
  const providerID = model.providerID ?? "";
  const id = model.id ?? "";
  if (providerID === "opencode") return "zen";
  if (id === "default" || id === "groq-120b" || id.includes("groq")) return "groq";
  if (id === "gemini-flash" || id.includes("gemini")) return "gemini";
  if (id === "deepseek-flash" || id.includes("deepseek")) return "deepseek";
  return null;
}

function chainIndex(chain: readonly ChainEntry[], model: ModelRef): number {
  return chain.findIndex((entry) => entry.providerID === model.providerID && entry.id === model.id);
}

function catalogId(model: ModelRef): string | null {
  for (const [id, entry] of Object.entries(POOL_CATALOG)) {
    if (entry.providerID === model.providerID && entry.id === model.id) return id;
  }
  return null;
}

function sameModel(left: ModelRef, right: ModelRef): boolean {
  return left.providerID === right.providerID && left.id === right.id;
}

function finish(
  requested: ModelRef,
  entry: ChainEntry,
  status: PoolStatus,
  reason: ChoiceReason,
  blockedBefore: boolean,
): Choice {
  const model = { providerID: entry.providerID, id: entry.id };
  const switched = !sameModel(requested, model);
  const parts: string[] = [];
  if (switched && blockedBefore) {
    parts.push(`Bascule vers ${model.providerID}/${model.id} (pool ${entry.pool}).`);
  } else if (switched && !(requested.providerID === "litellm" && requested.id === "default")) {
    parts.push(`Bascule vers ${model.providerID}/${model.id} (pool ${entry.pool}).`);
  }
  if (switched && entry.pool === "deepseek") {
    parts.push("DeepSeek est payant.");
  }
  if (status === "warn") {
    parts.push(`Quota ${entry.pool} sous 20 %.`);
  }
  const warning = parts.length > 0 ? parts.join(" ") : undefined;
  return {
    model,
    switched,
    reason: status === "warn" && reason === "kept" ? "warn" : reason,
    warning,
  };
}

function pickFrom(
  ledger: Ledger,
  chain: readonly ChainEntry[],
  requested: ModelRef,
  start: number,
  reason: ChoiceReason,
): Choice {
  let blockedBefore = false;
  for (let index = start; index < chain.length; index += 1) {
    const entry = chain[index];
    const status = statusFor(ledger.pools[entry.pool]);
    if (!isPoolUsable(status)) {
      blockedBefore = true;
      continue;
    }
    return finish(requested, entry, status, reason, blockedBefore);
  }
  const last = chain[chain.length - 1];
  return {
    model: { providerID: last.providerID, id: last.id },
    switched: !sameModel(requested, last),
    reason: "blocked",
    warning: `Tous les pools de l'ordre sont bloqués. Dernier recours : ${last.providerID}/${last.id}.`,
  };
}

/**
 * Un modèle qui n'est pas un pool connu (sensitive, Ollama) est conservé.
 * Un pool connu retiré de l'ordre suit l'ordre enregistré dès le début.
 * `litellm/default` saute Zen et part au premier hop LiteLLM de l'ordre.
 * `unknown` reste utilisable (Zen et Gemini n'ont pas de plafond inventé).
 */
export function chooseModel(ledger: Ledger, requested: ModelRef, now: Date = new Date()): Choice {
  const current = refreshStatuses(resetIfNeeded(ledger, now));
  const chain = routeOf(current);
  const isDefaultAlias = requested.providerID === "litellm" && requested.id === "default";
  const index = chainIndex(chain, requested);

  if (isDefaultAlias) {
    const firstGateway = chain.findIndex((entry) => entry.providerID === "litellm");
    return pickFrom(current, chain, requested, firstGateway === -1 ? 0 : firstGateway, "default");
  }

  if (index >= 0) {
    const entry = chain[index];
    const status = statusFor(current.pools[entry.pool]);
    if (isPoolUsable(status)) {
      return finish(requested, entry, status, "kept", false);
    }
    return pickFrom(current, chain, requested, index + 1, "blocked");
  }

  if (catalogId(requested)) {
    return pickFrom(current, chain, requested, 0, "blocked");
  }

  return { model: requested, switched: false, reason: "kept" };
}
