import { Plugin } from "@opencode/plugin";

import { formatDashboard } from "./ledger";
import { registerCommands } from "./commands";
import { loadLedger, parseRateLimitHeaders, saveLedger } from "./sources";

/**
 * Plugin de quotas.
 *
 * Il ne route rien : LiteLLM reste seul responsable des alias, des fallbacks
 * et des clés. Ce plugin lit les en-têtes de rate limit, tient un ledger local
 * et expose /quota + un outil quota_status.
 */
export default Plugin.define({
  id: "opencode-quota",
  async setup(ctx) {
    const cleanups: Array<() => Promise<void> | void> = [];

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
          const ledger = await loadLedger();
          return {
            content: formatDashboard(ledger),
            metadata: { updated_at: ledger.updated_at },
          };
        },
      });
    });
    cleanups.push(toolRegistration.dispose);

    // Source opportuniste : les en-têtes x-ratelimit-* de Groq (souvent
    // relayés par LiteLLM). On limite l'écriture à une fois toutes les 2 s.
    let lastHeaderSave = 0;
    const httpRegistration = await ctx.session.hook("http.response", async (input) => {
      const { usage, reset_at } = parseRateLimitHeaders(input.response.headers);
      if (usage.requests_today === undefined && usage.tokens_today === undefined) return;

      const now = Date.now();
      if (now - lastHeaderSave < 2000) return;
      lastHeaderSave = now;

      const ledger = await loadLedger();
      const pool = ledger.pools.groq;
      if (!pool) return;

      const next = {
        ...ledger,
        updated_at: new Date(now).toISOString(),
        pools: {
          ...ledger.pools,
          groq: {
            ...pool,
            used: { ...(pool.used ?? {}), ...usage },
            reset_at: reset_at ?? pool.reset_at,
            source: "headers",
          },
        },
      };
      await saveLedger(next);
    });
    cleanups.push(httpRegistration.dispose);

    return async () => {
      for (const cleanup of cleanups.reverse()) {
        await cleanup();
      }
    };
  },
});
