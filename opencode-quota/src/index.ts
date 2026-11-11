import { Plugin } from "@opencode/plugin";

import { formatDashboard, noteHttpResult } from "./ledger";
import { registerCommands } from "./commands";
import { chooseModel, poolIdForModel, type ModelRef } from "./route";
import {
  loadDurableLedger,
  parseRateLimitHeaders,
  resetFromUnknownError,
  saveDurableLedger,
  type LedgerStore,
} from "./sources";

/**
 * Plugin de quotas.
 *
 * Avant l'envoi, il choisit le premier pool encore ouvert.
 * L'ordre par défaut est Zen, Groq, DeepSeek, puis Gemini.
 * LiteLLM garde les clés et le repli si le hop choisi répond 503.
 * Le ledger est écrit dans ctx.storage et dans le fichier local.
 * Si le stockage du plugin échoue, le fichier suffit.
 */
export default Plugin.define({
  id: "opencode-quota",
  async setup(ctx) {
    const cleanups: Array<() => Promise<void> | void> = [];
    const store: LedgerStore = {
      get: (key) => ctx.storage.get(key),
      set: (key, value) => ctx.storage.set(key, value as never),
    };
    const lastWarning = new Map<string, string>();
    let applying = false;

    cleanups.push(await registerCommands(ctx));

    const toolRegistration = await ctx.tool.transform((editor) => {
      editor.add({
        name: "quota_status",
        description: "Return remaining quota per pool and the recommended alias",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          const ledger = await loadDurableLedger(store);
          return {
            content: formatDashboard(ledger),
            metadata: { updated_at: ledger.updated_at },
          };
        },
      });
    });
    cleanups.push(toolRegistration.dispose);

    async function warn(sessionID: string, text: string | undefined): Promise<void> {
      if (!text) return;
      const key = `${sessionID}:${text}`;
      if (lastWarning.get(sessionID) === key) return;
      lastWarning.set(sessionID, key);
      await ctx.session.synthetic({
        sessionID,
        text,
        description: "quota",
        resume: false,
      });
    }

    async function steer(sessionID: string, requested: ModelRef): Promise<ModelRef> {
      const ledger = await loadDurableLedger(store);
      const choice = chooseModel(ledger, requested);
      if (choice.model.providerID !== requested.providerID) {
        await ctx.session.switchModel({ sessionID, model: choice.model });
      }
      await warn(sessionID, choice.warning);
      return choice.model;
    }

    const promptRegistration = await ctx.session.hook("prompt", async (input) => {
      if (applying) return;
      applying = true;
      try {
        const session = await ctx.session.get({ sessionID: input.sessionID });
        if (!session.model) return;
        await steer(input.sessionID, session.model);
      } catch {
        // La résolution de modèle juste après retente le choix.
      } finally {
        applying = false;
      }
    });
    cleanups.push(promptRegistration.dispose);

    const resolveRegistration = await ctx.session.hook("experimental.model.resolve", async (input) => {
      if (applying) return;
      applying = true;
      try {
        const choice = await steer(input.sessionID, input.model);
        const model = input.model as { id: string; providerID: string };
        if (choice.providerID === input.model.providerID) {
          model.id = choice.id;
          return;
        }
        // Même fournisseur : le champ id suffit. Fournisseur différent :
        // switchModel change la session, et on tente aussi l'objet de cette
        // requête. La doc limite model.resolve au même fournisseur.
        model.providerID = choice.providerID;
        model.id = choice.id;
      } catch {
        // Un échec de routage ne bloque pas l'envoi.
      } finally {
        applying = false;
      }
    });
    cleanups.push(resolveRegistration.dispose);

    let lastHeaderSave = 0;
    const httpRegistration = await ctx.session.hook("http.response", async (input) => {
      const poolId = poolIdForModel(input.model);
      if (!poolId) return;
      const status = input.response.status;
      const parsed = parseRateLimitHeaders(input.response.headers);
      const hasAbsolute =
        parsed.usage.requests_today !== undefined || parsed.usage.tokens_today !== undefined;
      if (status !== 429 && !hasAbsolute && (status < 200 || status >= 300)) return;

      const now = Date.now();
      if (status !== 429 && now - lastHeaderSave < 2000) return;
      lastHeaderSave = now;

      const ledger = await loadDurableLedger(store);
      const next = noteHttpResult(
        ledger,
        poolId,
        { status, usage: parsed.usage, reset_at: parsed.reset_at },
        new Date(now),
      );
      await saveDurableLedger(next, store);
    });
    cleanups.push(httpRegistration.dispose);

    const retryRegistration = await ctx.session.hook("retry", async (input) => {
      if (!isRateLimited(input.error)) return;
      const poolId = poolIdForModel(input.model);
      if (!poolId) return;
      const now = new Date();
      const ledger = await loadDurableLedger(store);
      const next = noteHttpResult(
        ledger,
        poolId,
        { status: 429, usage: {}, reset_at: resetFromUnknownError(input.error, now) },
        now,
      );
      await saveDurableLedger(next, store);
    });
    cleanups.push(retryRegistration.dispose);

    return async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup();
      }
    };
  },
});

function isRateLimited(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  if (record.status === 429 || record.statusCode === 429) return true;
  const data = record.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (nested.status === 429 || nested.statusCode === 429) return true;
  }
  return false;
}
