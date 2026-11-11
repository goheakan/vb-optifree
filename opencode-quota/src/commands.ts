import type { Plugin } from "@opencode/plugin";

import { formatDashboard, preflight, type Ledger } from "./ledger";
import { parseTokenArg } from "./estimate";
import {
  chooseModel,
  DEFAULT_ROUTE,
  formatRoute,
  normalizeRoute,
  parseRoute,
  POOL_CATALOG,
  ZEN_MODEL,
} from "./route";
import {
  loadDurableLedger,
  refreshLedger,
  readEnvFile,
  saveDurableLedger,
  saveLiteLLMRoute,
  type LedgerStore,
} from "./sources";

const POLICY = [
  "Politique de routage vb-optifree",
  "",
  ...DEFAULT_ROUTE.map(
    (id, index) =>
      `${index + 1}. ${POOL_CATALOG[id].providerID}/${POOL_CATALOG[id].id} (${id})`,
  ),
  "",
  "Ordre par défaut : zen, puis groq, deepseek, et gemini en dernier.",
  "DeepSeek est payant. Il passe avant Gemini dans cet ordre.",
  "Change-le avec /quote order groq deepseek gemini",
  "OpenRouter reste hors de la chaîne tant que son identifiant :free n'est pas fixé.",
  "Une clé par fournisseur. Pas de second compte pour contourner une limite.",
  "sensitive et les alias locaux attendent Ollama. Ils ne partent pas vers un cloud.",
  "Le plugin choisit le pool encore ouvert avant l'envoi. LiteLLM rattrape un 503 dans le même ordre après redémarrage.",
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
  "  /quota order           affiche l'ordre",
  "  /quote order           même chose",
  "  /quote order groq deepseek gemini",
].join("\n");

async function notify(ctx: Plugin.Context, sessionID: string, text: string): Promise<void> {
  await ctx.session.synthetic({
    sessionID,
    text,
    description: "quota",
    resume: false,
  });
}

function storeOf(ctx: Plugin.Context): LedgerStore {
  return {
    get: (key) => ctx.storage.get(key),
    set: (key, value) => ctx.storage.set(key, value as never),
  };
}

function nextHops(ledger: Ledger): string {
  const route = normalizeRoute(ledger.route);
  const zen = chooseModel(ledger, ZEN_MODEL);
  const alias = chooseModel(ledger, { providerID: "litellm", id: "default" });
  return [
    `Ordre : ${formatRoute(route)}`,
    `Prochain envoi (Zen) : ${zen.model.providerID}/${zen.model.id}`,
    `Alias default : ${alias.model.providerID}/${alias.model.id}`,
  ].join("\n");
}

async function showOrSetOrder(
  ctx: Plugin.Context,
  sessionID: string,
  tokens: string[],
): Promise<void> {
  if (tokens.length === 0) {
    const ledger = await loadDurableLedger(storeOf(ctx));
    await notify(
      ctx,
      sessionID,
      [
        `Ordre actuel : ${formatRoute(normalizeRoute(ledger.route))}`,
        "Pour le changer : /quote order groq deepseek gemini",
        "Pools : zen, groq, deepseek, gemini. Une fois chacun.",
        "Le choix avant l'envoi suit cet ordre tout de suite.",
        "Le repli LiteLLM sur un 503 suit le fichier de config après :",
        "systemctl --user restart litellm",
      ].join("\n"),
    );
    return;
  }

  const parsed = parseRoute(tokens);
  if (!parsed.ok) {
    await notify(ctx, sessionID, parsed.message);
    return;
  }

  const ledger = await loadDurableLedger(storeOf(ctx));
  const next: Ledger = {
    ...ledger,
    route: parsed.route,
    updated_at: new Date().toISOString(),
  };
  await saveDurableLedger(next, storeOf(ctx));
  let configNote = "\nPas de config LiteLLM installée. L'ordre du plugin est enregistré.";
  try {
    const written = await saveLiteLLMRoute(parsed.route);
    configNote =
      written === "updated"
        ? "\nConfig LiteLLM mise à jour. Relance : systemctl --user restart litellm"
        : configNote;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    configNote = `\nConfig LiteLLM non réécrite : ${message}`;
  }
  await notify(ctx, sessionID, `Ordre enregistré : ${formatRoute(parsed.route)}${configNote}`);
}

async function showDashboard(ctx: Plugin.Context, sessionID: string): Promise<void> {
  const ledger = await loadDurableLedger(storeOf(ctx));
  await notify(ctx, sessionID, `${formatDashboard(ledger)}\n\n${nextHops(ledger)}`);
}

async function refresh(ctx: Plugin.Context, sessionID: string): Promise<void> {
  const env = await readEnvFile();
  const before = await loadDurableLedger(storeOf(ctx));
  const result = await refreshLedger(before, {
    openRouterKey: process.env.OPENROUTER_API_KEY ?? env.OPENROUTER_API_KEY,
    litellmBaseUrl: process.env.LITELLM_BASE_URL ?? "http://127.0.0.1:4000",
    litellmMasterKey: process.env.LITELLM_MASTER_KEY ?? env.LITELLM_MASTER_KEY,
  });
  await saveDurableLedger(result.ledger, storeOf(ctx));
  const errors =
    result.errors.length > 0 ? `\n\nErreurs de rafraîchissement :\n- ${result.errors.join("\n- ")}` : "";
  await notify(ctx, sessionID, `${formatDashboard(result.ledger)}${errors}`);
}

function check(ledger: Ledger, tokens: number): string {
  const result = preflight(ledger, tokens);
  return `${result.message}\n${nextHops(ledger)}\n\n${formatDashboard(ledger)}`;
}

async function reset(ctx: Plugin.Context, sessionID: string, poolId: string): Promise<void> {
  const ledger = await loadDurableLedger(storeOf(ctx));
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
      [poolId]: { ...pool, used: {}, reset_at: undefined, forced_status: undefined, status: "ok" },
    },
  };
  await saveDurableLedger(next, storeOf(ctx));
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
              await notify(ctx, sessionID, check(await loadDurableLedger(storeOf(ctx)), tokens));
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
            case "order":
              await showOrSetOrder(ctx, sessionID, rest);
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
    editor.add({
      name: "quote",
      description: "Affiche ou change l'ordre des pools",
      execute: async (input) => {
        const text = input.prompt.text.trim();
        const [subcommand, ...rest] = text.split(/\s+/).filter(Boolean);
        const tokens = subcommand === "order" || subcommand === undefined ? rest : [subcommand, ...rest];
        try {
          await showOrSetOrder(ctx, input.sessionID, tokens);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await notify(ctx, input.sessionID, `Erreur quota : ${message}`);
        }
      },
    });
  });

  return registration.dispose;
}
