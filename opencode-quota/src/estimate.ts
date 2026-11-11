/**
 * Estimation grossière du coût d'une tâche en tokens.
 * Heuristique : ~4 octets de code par token, plus le prompt et la sortie,
 * avec une marge de sécurité.
 */

export interface EstimateInput {
  files?: number;
  avgFileBytes?: number;
  promptTokens?: number;
  outputTokens?: number;
  /** Marge multiplicative, 1.3 par défaut. */
  margin?: number;
}

export function estimateTokens(input: EstimateInput): number {
  const files = Math.max(0, input.files ?? 0);
  const avgFileBytes = Math.max(0, input.avgFileBytes ?? 0);
  const fileTokens = Math.ceil((files * avgFileBytes) / 4);
  const promptTokens = Math.max(0, input.promptTokens ?? 0);
  const outputTokens = Math.max(0, input.outputTokens ?? 0);
  const margin = input.margin && input.margin > 0 ? input.margin : 1.3;
  return Math.ceil((fileTokens + promptTokens + outputTokens) * margin);
}

export function parseTokenArg(value: string): number | null {
  const normalized = value.trim().toLowerCase().replace(/[_\s]/g, "");
  if (normalized === "") return null;

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(k|m)?$/);
  if (!match) return null;

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base) || base <= 0) return null;

  const suffix = match[2];
  if (suffix === "k") return Math.round(base * 1_000);
  if (suffix === "m") return Math.round(base * 1_000_000);
  return Math.round(base);
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return String(tokens);
}
