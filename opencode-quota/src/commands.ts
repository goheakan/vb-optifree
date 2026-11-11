import type { Plugin } from "@opencode/plugin";

import { formatDashboard, preflight, type Ledger } from "./ledger";
import { parseTokenArg } from "./estimate";
import { loadLedger, refreshLedger, readEnvFile, saveLedger } from "./sources";

const POLICY = [
  "Politique de routage vb-optifree",
  "",
  "🔴 sensitive → local-coder (Ollama uniquement, aucun fallback cloud)",
  "🟡 default   → groq-120b → gemini-flash → openrouter-free → deepseek-flash → local-coder",
  "🔵 gros contexte → gemini-flash (ou DeepSeek 1M ctx)",
  "💰 quotas épuisés → deepseek-flash (payant quasi-gratuit) → local-coder",
  "",
  "Règle d'or : un secret ne part jamais vers un modèle cloud gratuit.",
].join("\n");

const USAGE = [
  "Usage :",
  "  /quota                 dashboard",
  "  /quota refresh         relit les sources",
  "  /quota check <tokens>  pré-vol (ex. 12000, 12k, 1.5m)",
  "  /quota policy          politique de routage",
  "  /quota reset <pool>    remet un pool à zéro",
].join("\n");

async function notify(ctx: Plugin.Context, sessionID: string, text: string): Promise<void> {
  await ctx.session.synthetic({
    sessionID,
    text,
    description: "quota",
    resume: false,
  });
}

async function showDashboard(ctx: Plugin.Context, sessionID: string): Promise<void> {
  const ledger = await loadLedger();
  await notify(ctx, sessionID, formatDashboard(ledger));
}

async function refresh(ctx: Plugin.Context, sessionID: string): Promise<void> {
  const env = await readEnvFile();
  const before = await loadLedger();
  const result = await refreshLedger(before, {
    openRouterKey: process.env.OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY,
    litellmBaseUrl: process.env.LITELLM_BASE_URL ?? "http://127.0.0.1:4000",
    litellmMasterKey: process.env.LITELLM_MASTER_KEY ?? env.LITELLM_MASTER_KEY,
  });
  await saveLedger(result.ledger);
  const errors =
    result.errors.length > 0 ? `\n\nErreurs de rafraîchissement :\n- ${result.errors.join("\n- ")}` : "";
  await notify(ctx, sessionID, `${formatDashboard(result.ledger)}${errors}`);
}

function check(ledger: Ledger, tokens: number): string {
  const result = preflight(ledger, tokens);
  return `${result.message}\n\n${formatDashboard(ledger)}`;
}

async function reset(ctx: Plugin.Context, sessionID: string, poolId: string): Promise<void> {
  const ledger = await loadLedger();
  const pool = ledger.pools[poolId];
  if (!pool) {
    await notify(
      ctx,
      sessionID,
      `Pool inconnu : ${poolId}\nDisponibles : ${Object.keys(ledger.pools).join(", ")}`,
    );
    return;
  }
  const next: Ledger = {
    ...ledger,
    updated_at: new Date().toISOString(),
    pools: {
      ...ledger.pools,
      [poolId]: { ...pool, used: {}, reset_at: undefined, status: "ok" },
    },
  };
  await saveLedger(next);
  await notify(ctx, sessionID, `Pool ${poolId} réinitialisé.\n\n${formatDashboard(next)}`);
}

export async function registerCommands(ctx: Plugin.Context): Promise<() => Promise<void>> {
  const registration = await ctx.command.transform((editor) => {
    editor.add({
      name: "quota",
      description: "Affiche les quotas, rafraîchit, ou fait un pré-vol",
      execute: async (input) => {
        const text = input.prompt.text.trim();
        const [subcommand, ...rest] = text.split(/\s+/).filter(Boolean);
        const sessionID = input.sessionID;

        try {
          switch (subcommand) {
            case undefined:
            case "show":
              await showDashboard(ctx, sessionID);
              break;
            case "refresh":
              await refresh(ctx, sessionID);
              break;
            case "check": {
              const tokens = parseTokenArg(rest[0] ?? "");
              if (tokens === null) {
                await notify(ctx, sessionID, USAGE);
                break;
              }
              await notify(ctx, sessionID, check(await loadLedger(), tokens));
              break;
            }
            case "policy":
              await notify(ctx, sessionID, POLICY);
              break;
            case "reset":
              if (!rest[0]) {
                await notify(ctx, sessionID, "Usage : /quota reset <pool>");
                break;
              }
              await reset(ctx, sessionID, rest[0]);
              break;
            default:
              await notify(ctx, sessionID, USAGE);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await notify(ctx, sessionID, `Erreur quota : ${message}`);
        }
      },
    });
  });

  return registration.dispose;
}
