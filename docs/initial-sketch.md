# Esquisse initiale (document historique)

> **Statut : document historique, non maintenu.**
> Cette esquisse a servi de point de départ. Plusieurs de ses chiffres et
> hypothèses ont été corrigés depuis. La référence est [`plan.md`](./plan.md).
>
> Corrections principales :
> - Les quotas gratuits sont généralement **par compte fournisseur**, pas par
>   outil : cumuler Aider + Goose + Cline sur Groq ne multiplie pas le quota Groq.
> - Cline est une extension VS Code/JetBrains, pas un CLI terminal.
> - Cerebras n'offre pas 1 M tokens/jour en permanence : crédit d'essai, puis
>   paiement à l'usage.
> - Antigravity n'est pas un CLI terminal unique et son quota n'est pas confirmé.
> - La solution retenue est OpenCode + LiteLLM + Ollama (voir `plan.md`).

## Contenu d'origine

Stratégie : maximiser les modèles cloud gratuits via le cumul
L'idée clé : chaque outil a son propre quota gratuit indépendant. En les combinant, tu empiles les quotas sans qu'ils se touchent.

OpenCode  → OpenCode Zen (9 modèles gratuits)
    +
Cline     → Cline free models (VS Code) + Groq (terminal)
    +
Aider     → Groq (1 000 req/j × 5 modèles) + Cerebras (1M tokens/j)
    +
Goose     → Antigravity CLI (1 000 req/j) + OpenRouter :free
    +
Ollama    → filet de sécurité local quand tout est épuisé
