# Plan — Vibe-coding gratuit avec les modèles cloud (stratégie de cumul)

> Document de travail — vérifié le 11 nov. 2026
> Projet : Setup_Optimal_0$
> Statut : plan (à valider avant mise en œuvre)

## 1. Objectif

Permettre de faire du **vibe-coding** (coder en pilotant un agent IA en langage
naturel) **sans dépenser**, en **empilant les quotas gratuits** de plusieurs
fournisseurs cloud indépendants, avec un **filet de sécurité local** (Ollama)
quand tous les quotas sont épuisés.

## 2. Principe corrigé (le point le plus important)

L'esquisse dit : « chaque outil a son propre quota gratuit indépendant ».
➡️ **C'est inexact en général.** Un quota gratuit est rattaché à un
**compte / projet / organisation** chez un *fournisseur*, **pas** à l'outil qui
l'appelle.

Conséquences :

- Utiliser **le même compte** (ex. la même clé Groq) depuis OpenCode, Cline et
  Aider **ne triple pas** le quota : les trois outils partagent le même pool.
- Le cumul légitime consiste à multiplier les **pools distincts** :
  - **Pools hébergés par les outils** (indépendants des API brutes) :
    OpenCode Zen free, Cline free, Google Antigravity, Mistral Vibe free.
  - **Pools API bruts gratuits** : Groq, Google AI Studio (modèles Flash),
    OpenRouter `:free`, essai Cerebras.
  - **Pool local** : Ollama (illimité, hors-ligne).
- ⚠️ **Ne jamais créer plusieurs comptes** sur un même service pour contourner
  les limites : violation des CGU, risque de ban. Le cumul propre = **services
  différents**, pas comptes multiples.

## 3. Inventaire vérifié des pools gratuits (nov. 2026)

### 3.1 OpenCode Zen / Console — pool n°1 (hébergé par l'outil)

- **~13 modèles gratuits** (l'esquisse disait 9) — certains « limited time ».
- Big Pickle, Iceman Free, Inkling 2 Small Free, GLM-5.3-Flash Free,
  DeepSeek V4.1 Flash Free, MiniMax M3.1 Flash Free, Beam Free, Flint 40B Free,
  **LongCat 2.5 Free (100 req/j)**, MiMo-V2.6-Flash Free, Nemotron 3 Ultra Free,
  Nemotron 3.5 Lightning Free, Nemotron 3.5 Super VL Free, Jev 1.13 Free.
- **Contrainte** : les modèles gratuits ne fonctionnent **que dans OpenCode**
  (inutilisables depuis d'autres clients).
- **Vie privée** : Big Pickle, Iceman, Inkling, Flint, MiMo → données utilisées
  pour l'entraînement ; Nemotron (NVIDIA) → essai, **pas de données
  confidentielles**.
- Désactivation : `OPENCODE_DISABLE_FREE_MODELS=1`.

### 3.2 Groq — pool n°2 (API, très rapide)

Free plan, **par modèle** :

| Modèle | RPM | req/j | TPM | tokens/j |
|---|---|---|---|---|
| openai/gpt-oss-120b | 30 | 1 000 | 8K | 200K |
| openai/gpt-oss-20b | 30 | 1 000 | 8K | 200K |
| qwen/qwen3.8-27b | 30 | 1 000 | 8K | 200K |
| gpt-oss-safeguard-20b | 3 | 1 000 | 2K | 200K |
| whisper-large-v3(-turbo) | 20 | 2 000 | — | audio |

- Limites **par organisation**. Renvoie `429` + `retry-after` → backoff.
- Idéal pour agents (latence très faible, LPU).

### 3.3 Google AI Studio (Gemini API) — pool n°3

- **Gratuit** (entrée + sortie) : **Gemini 3.8 Flash**, **3.6 Flash**,
  **3.5 Flash-Lite**, **3.1 Flash-Lite**, Live / Transcribe.
- **PAS gratuit** : **Gemini 4 Carbon**, **Gemini 4 Argon**, **3.1 Pro**
  (payant uniquement).
- Quotas **par projet** ; RPD remis à zéro **minuit Pacifique**.
- ⚠️ Free tier = « contenu utilisé pour améliorer nos produits » →
  **pas de code confidentiel**.

### 3.4 OpenRouter — pool n°4

- 400+ modèles, variantes **`:free`** (rotation). Quotas quotidiens par compte.
- Utile comme **réservoir de secours** ; vérifier la liste `:free` du moment.

### 3.5 Cerebras — pool n°5 (correction)

- L'esquisse disait « 1M tokens/j ». **Vérifié :** « **5 $ de crédit gratuit** à
  la création du compte », puis Developer pay-per-token (limites 10× supérieures).
- Donc : **pas un quota gratuit permanent** → à traiter comme **crédit
  d'appoint**, pas comme pool principal.

### 3.6 Mistral — pool n°6

- **Plan Free** : Vibe (web, mobile, **CLI**, **IDE**) avec messages / sessions
  de code / recherches **limités** + Mistral Studio.
- Pas d'API gratuite généreuse ; utile comme **agent de secours**.

### 3.7 Google Antigravity — pool n°7

- Plateforme agentique (App, **CLI**, IDE, SDK), « **disponible sans frais pour
  les développeurs** », propulsée par Gemini 4.
- ⚠️ Le chiffre « 1 000 req/j » de l'esquisse **n'a pas pu être confirmé** →
  **à vérifier dans l'app**.

### 3.8 Cline — écarté

- Extension **VS Code / JetBrains** (pas un CLI terminal) → hors périmètre
  « une seule CLI ». Licence Apache-2.0, mais **non retenu** (cf. §17.9).

### 3.9 DeepSeek — fallback payant quasi-gratuit (hors cumul)

- **V4.1 Flash** : entrée 0,15 $/M (off-peak) → 0,30 $/M (peak) ; sortie
  0,60 $/M → 1,20 $/M. Cache hit 0,003 $/M. Off-peak = −50 %.
- 1M de contexte, 384K de sortie, tool calls, compatible OpenAI **et** Anthropic.
- Excellent **plan B payant** si un quota gratuit tombe (coût quasi nul).

### 3.10 Ollama — pool local (filet de sécurité)

- **Gratuit, illimité, privé, hors-ligne.**
- Dimensionnement **selon la VRAM** : 8 Go → 7B Q4 ; 12–16 Go → 14B Q4 ;
  24 Go → 32B Q4 (qwen2.5-coder, deepseek-coder, etc.). **AMD (ROCm) et
  NVIDIA (CUDA)** supportés ; adapter à ta machine.

## 4. Architecture cible

> ⚠️ **Décision révisée (voir §17)** : architecture « une seule CLI, tout FLOSS »
> → **OpenCode** (CLI, MIT) + **LiteLLM** (gateway self-hosted, MIT) +
> **Ollama** (local, MIT). Le tableau multi-outils ci-dessous est conservé à
> titre d'option ; **Cline est écarté** (extension IDE, cf. §17.9).

| Outil | Rôle | Statut |
|---|---|---|
| **OpenCode** | CLI agent principal | ✅ retenu (§17) |
| **LiteLLM** | gateway routage/fallback | ✅ retenu (§17) |
| **Ollama** | local / code sensible | ✅ retenu (§17) |
| Aider | édition rapide terminal | option |
| Goose | agent CLI | option |
| ~~Cline~~ | extension VS Code | ❌ écarté |

## 5. Chaîne de fallback (routage)

Ordre par défaut :

1. **OpenCode Zen free** (qualité, gratuit)
2. **Groq** (rapide)
3. **Gemini Flash** (gros contexte)
4. **OpenRouter :free** (rotation)
5. **Ollama local** (dernier recours)

- Sur `429` : lire `retry-after`, backoff exponentiel, puis **bascule au pool
  suivant**.
- Sur épuisement quotidien : marquer le pool « épuisé » jusqu'au reset
  (minuit Pacifique pour Google ; variable sinon).

## 6. Configuration (à produire en phase build)

- **OpenCode** : `opencode.json` (ou `~/.config/opencode/`) → providers
  `opencode` (Zen), `groq`, `google`, `openrouter`.
- **Cline** : réglages provider dans l'extension.
- **Aider** : `.aider.conf.yml` + variables d'env.
- **Goose** : config provider.
- **Clés** : `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
  `CEREBRAS_API_KEY`… dans un `.env` **non versionné** (`.gitignore`).
- Ne **jamais** committer les clés.

## 7. Bonnes pratiques « vibe-coding » économe

- Contexte **court** : cibler les fichiers (grep/recherche), ne pas dumper tout
  le repo.
- **Compresser / résumer** les longues sessions.
- Petits modèles (Flash, Flash-Lite) pour le boilerplate ; gros modèles pour
  l'archi.
- **1 tâche = 1 session** propre.
- Éviter les boucles d'agent inutiles (chaque tour consomme).

## 8. Sécurité, vie privée, légal

- Les free tiers **entraînent souvent sur tes données** → **jamais** de secrets,
  PII, code propriétaire.
- Code sensible → **Ollama local** uniquement.
- **Respect des CGU** : pas de multi-comptes, pas d'automatisation abusive.
- Rotation des clés ; révoquer en cas de fuite.

## 9. Contraintes matérielles (génériques)

- **GPU** : dimensionner les modèles locaux sur la **VRAM** (8/12/16/24 Go).
  Support **AMD** (ROCm/Vulkan) **et NVIDIA** (CUDA).
- **RAM/CPU** : 16 Go RAM minimum, 32–64 Go confortable ; plus de cœurs =
  builds plus rapides.
- Script de session local : voir `grok_session.sh` (modèle versionné, **sans
  ID de session** ; le vrai script reste hors du dépôt, cf. §21).

## 10. Mise en œuvre — checklist

- [ ] Phase 0 — comptes & clés : OpenCode, Groq, Google AI Studio, OpenRouter,
      DeepSeek (fallback), Ollama local.
- [ ] Phase 1 — LiteLLM (gateway) + providers gratuits.
- [ ] Phase 2 — OpenCode branché sur LiteLLM + politique d'alias (§17.5).
- [ ] Phase 3 — Ollama + 2-3 modèles coder (**AMD ou NVIDIA**).
- [ ] Phase 4 — plugin `opencode-quota` + dashboard (§16/§19).
- [ ] Phase 5 — mini-projet test « vibe-coding » de bout en bout.

## 11. Métriques de succès

- % de sessions **sans payer**.
- Nombre de **bascules / jour**.
- **Latence** moyenne / première réponse.
- **Coût résiduel** ($) par semaine.

## 12. Risques & limites

- Modèles gratuits **« limited time »** → peuvent disparaître.
- Quotas **variables** et non garantis.
- **Qualité** hétérogène ; certains modèles faibles en agentique.
- **Latence** sur les gros modèles gratuits.
- Dépendance à plusieurs services → gérer les pannes.

## 13. Corrections apportées à l'esquisse initiale

1. « chaque outil a son quota » → **chaque compte/projet fournisseur** a son
   quota.
2. OpenCode Zen : **9 → ~13 modèles** (dont LongCat limité à 100 req/j).
3. Cerebras : « 1M tokens/j » → **5 $ de crédit de départ**.
4. Gemini : préciser que **seuls Flash / Flash-Lite sont gratuits**
   (pas Pro / Carbon / Argon).
5. Ajout de **DeepSeek** comme fallback payant quasi-gratuit.
6. Ajout des volets **vie privée / CGU / sécurité**.

## 14. Prochaines actions (à valider)

1. Vérifier les quotas exacts : Antigravity, Cline, liste OpenRouter `:free`,
   RPD Gemini.
2. Choisir le **stack principal** (OpenCode en tête ?).
3. Passer en mode build pour créer la config réelle.

## 15. Propositions concrètes (recommandations)

### 15.1 Démarrage progressif (0 → 4 pools)

Ne pas tout brancher d'un coup. Monter en puissance :

1. **Étape 0 — zéro clé** : utiliser **OpenCode Zen free** seul. Aucune
   inscription API, déjà intégré à OpenCode. Sert à valider le workflow
   « vibe-coding ».
2. **Étape 1 — + Groq** : ajouter `GROQ_API_KEY` → gain de **vitesse** (LPU)
   pour les tâches courtes.
3. **Étape 2 — + Gemini / OpenRouter** : ajouter pour le **contexte long** (1M)
   et le **secours** quand les autres pools sont à sec.
4. **Étape 3 — + Ollama** : filet **local/privé** pour le code sensible et les
   coupures réseau.

> Avantage : chaque étape apporte un gain immédiat, sans « big bang » de config.

### 15.2 Routage par type de tâche (proposition)

| Tâche | Pool recommandé | Pourquoi |
|---|---|---|
| Architecture / raisonnement | OpenCode Zen (DeepSeek V4.1 Free, GLM-5.3 Flash Free) | qualité + gratuit |
| Boilerplate / code court | **Groq gpt-oss-120b** | 30 RPM, très rapide |
| Gros contexte / refactor multi-fichiers | Gemini 3.8 Flash ou DeepSeek V4.1 Flash | 1M de contexte |
| Code sensible / secrets | **Ollama local** | privé, offline |
| Transcription / audio | Groq whisper-large-v3 | gratuit 2 000 req/j |
| Vision / captures | Nemotron 3.5 Super VL Free (Zen) | multimodal gratuit |

### 15.3 Bascule & résilience (2 options)

- **Option A (simple, robuste)** : pas de script — une **cheatsheet** de routage
  + bascule manuelle du modèle dans OpenCode. Zéro maintenance.
- **Option B (avancée)** : un wrapper `llm-fallback.sh` qui tente les providers
  dans l'ordre, lit `retry-after` et bascule automatiquement. Plus puissant mais
  à maintenir.
  - Recommandation : commencer par **A**, passer à **B** seulement si les `429`
    deviennent fréquents.

### 15.4 Gestion des clés (proposition)

- Stocker les clés dans **`pass`** (déjà présent sur Arch) ou `age`/`sops`,
  puis les injecter via variables d'environnement.
- À défaut : `.env` en `chmod 600`, ajouté au `.gitignore`.
- **Jamais** de clé en clair dans `opencode.json`.

### 15.5 Suivi des quotas (proposition)

Tenir un fichier `quotas.md` simple, mis à jour en fin de session :

| Pool | Quota/j | Utilisé | Reste | Reset |
|---|---|---|---|---|
| Groq gpt-oss-120b | 1 000 req | | | 24 h glissant |
| Gemini 3.8 Flash | RPD projet | | | minuit Pacifique |
| Zen LongCat 2.5 | 100 req | | | 24 h |
| OpenRouter :free | variable | | | 24 h |

> But : savoir **quand** basculer avant de taper un `429`.

### 15.6 Astuces d'économie

- **DeepSeek off-peak** : décaler les gros travaux hors heures pleines (−50 %).
- **Reset Gemini** : planifier les gros refactors **après minuit Pacifique**.
- **Petits modèles d'abord** : Flash/Flash-Lite pour le boilerplate, gros modèle
  seulement pour l'archi.
- **Contexte court** : grep ciblé plutôt que dump du repo (voir §7).

### 15.7 Config OpenCode — esquisse (à affiner en build)

Structure cible (schéma à confirmer selon la version d'OpenCode installée) :

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "opencode": { /* Zen : modèles free intégrés */ },
    "groq":       { "options": { "apiKey": "{env:GROQ_API_KEY}" } },
    "google":     { "options": { "apiKey": "{env:GEMINI_API_KEY}" } },
    "openrouter": { "options": { "apiKey": "{env:OPENROUTER_API_KEY}" } }
  },
  "model": "opencode/<modèle-free-par-défaut>"
}
```

> ⚠️ Les noms exacts de providers/modèles seront fixés en mode build, en lisant
> la doc de la version installée.

### 15.8 Convention de session (rappel règle globale)

- Créer `grok_session.sh` (nom conventionnel) contenant :
  ```bash
  #!/usr/bin/env bash
  opencode -s <SESSION_ID>
  ```
- Le projet a déjà `opencode_session.sh` → **renommer ou dupliquer** pour
  respecter la convention.

### 15.9 Décisions à valider

1. **Stack principal** : OpenCode seul d'abord (recommandé), ou multi-outils dès
   le départ ?
2. **Gestion des clés** : `pass`, `age`, ou simple `.env` 600 ?
3. **Bascule** : Option A (cheatsheet) ou B (wrapper) ?
4. **Ollama** : installer tout de suite ou seulement en dernier recours ?

## 16. Dashboard des consommations & pré-vol quota

### 16.1 Objectif

Savoir **où en est l'utilisateur** (quotas restants par pool) **avant** de lancer
une étape de vibe-coding, pour éviter de démarrer une étape alors qu'il n'y aura
pas assez de quota. Le dashboard est un **garde-fou** : il transforme « je tente
et je vois » en « je vérifie puis je lance ».

### 16.2 Trois niveaux de mise en œuvre

- **Niveau 0 — Manuel (immédiat)** : un `quotas.md` avec tableau mis à jour en
  fin de session. Zéro dépendance. (Reprise de §15.5, promu en dashboard
  minimal.)
- **Niveau 1 — Semi-auto** : un script (bash ou Python) qui lit un `quotas.json`
  (ledger local) et affiche un tableau coloré ; mise à jour via les **en-têtes
  de rate-limit** (`x-ratelimit-remaining-*`, `retry-after`) des réponses API
  et via `GET /api/v1/key` d'OpenRouter (usage/limite de la clé).
- **Niveau 2 — Auto / temps réel** : un wrapper `llm-fallback` qui met à jour le
  ledger à **chaque appel** et sert l'état. Plus puissant, plus de maintenance.

> Recommandation : viser le **Niveau 1** (bon rapport effort/valeur) ; garder le
> Niveau 2 pour plus tard.

### 16.3 Indicateurs (wireframe)

```text
┌─ Quota Dashboard — Setup_Optimal_0$ ─────────────────────────┐
│ Pool                     Utilisé / Quota      Reste   Reset  │
│ Zen · LongCat 2.5         12 / 100 req          88 %   24 h   │
│ Groq · gpt-oss-120b      320 / 1 000 req        68 %   glissant│
│ Gemini · 3.8 Flash        ~ / RPD projet         ?     00:00 PT│
│ OpenRouter :free          ~ / variable           ?     24 h   │
│ Ollama (local)            illimité             100 %   —      │
├───────────────────────────────────────────────────────────────┤
│ Statut global : OK      Seuils : ⚠ < 20 %   ⛔ ≤ 5 %          │
│ Prochaine bascule estimée : 14:20 (Groq → Gemini)             │
└───────────────────────────────────────────────────────────────┘
```

- **% restant** par pool, **reset** (glissant vs minuit Pacifique), **statut**
  (OK / ⚠ bas / ⛔ épuisé).
- **Statut global** + **prochaine bascule estimée**.
- Option : **coût résiduel estimé** ($/semaine) pour les pools payants.

### 16.4 Pré-vol (le cœur du besoin)

Avant une étape :

1. **Estimer** le besoin en tokens : `nb fichiers ciblés × taille moyenne +
   prompt + sortie estimée`, avec une marge (ex. ×1,3).
2. **Vérifier** qu'au moins un pool a `reste >= estimation`.
3. **Décider** :
   - ✅ assez de quota → lancer ;
   - ⚠ juste → réduire le scope (moins de fichiers) ou pool plus économe ;
   - ⛔ insuffisant → **ne pas lancer** : attendre le reset, basculer sur Ollama
     local, ou utiliser DeepSeek off-peak (payant quasi-gratuit).

> C'est exactement le cas d'usage demandé : **éviter de lancer l'IA sur une étape
> quand le quota ne suivra pas**.

### 16.5 Format de données (ledger)

`quotas.json` (ou `.yaml`) :

```json
{
  "pools": {
    "zen:longcat-2.5":   { "quota_day": 100,  "used_day": 12,  "reset": "24h" },
    "groq:gpt-oss-120b": { "quota_day": 1000, "used_day": 320, "reset": "rolling-24h", "rpm": 30 },
    "gemini:3.8-flash":  { "quota_day": null, "used_day": 0,   "reset": "00:00 PT" },
    "openrouter:free":   { "quota_day": null, "used_day": 0,   "reset": "24h" },
    "ollama:local":      { "quota_day": null, "used_day": 0,   "reset": null }
  },
  "updated_at": "2026-11-11T15:10:00+01:00"
}
```

### 16.6 Où récupérer les données (réalité)

| Source | Donnée dispo | Méthode |
|---|---|---|
| Groq | reste req/tokens | en-têtes `x-ratelimit-*` des réponses |
| OpenRouter | usage/limite de la clé | `GET /api/v1/key` |
| Google AI Studio | quota projet (RPD) | console ; pas d'API simple par clé |
| OpenCode Zen | conso locale | logs/DB locale d'OpenCode |
| Ollama | illimité | local, jamais épuisé |

> ⚠️ Pas d'API de quota uniforme → dashboard **best-effort** ; certaines valeurs
> restent manuelles.

### 16.7 Alertes & seuils

- ⚠ **20 %** restant → avertir, proposer un pool de secours.
- ⛔ **5 %** restant → bloquer le pré-vol par défaut (sauf override).
- Message clair avant l'étape, ex. : « Quota insuffisant pour cette étape sur
  Groq (reste 6 %, besoin estimé 12 %). Options : réduire le scope / Ollama /
  DeepSeek off-peak. »

### 16.8 Intégration Hyprland (option)

- **Terminal TUI** (le plus simple) : script `quotadash` lancé à la demande.
- **Waybar** (HyDE) : module custom affichant le % du pool principal
  (`custom/quotas`).
- **Widget** : plus tard.

## 17. Architecture retenue — « une seule CLI, tout FLOSS »

### 17.1 Décision

| Brique | Choix | Licence | Rôle |
|---|---|---|---|
| CLI agent | **OpenCode** | MIT | interface terminal unique |
| Gateway | **LiteLLM** | MIT | routage, fallback, quotas, spend tracking |
| Inférence locale | **Ollama** | MIT | privé, illimité, hors-ligne |
| Cloud gratuit | Groq / Gemini Flash / OpenRouter `:free` | — | non-sensible uniquement |
| Fallback payant | DeepSeek off-peak | — | quasi-gratuit |

Principe : **tout est auto-hébergé** (LiteLLM et Ollama sur `127.0.0.1`) ; le
cloud n'est qu'une sortie **filtrée** par la politique de routage (§17.5).

### 17.2 Schéma

```text
┌──────────────────────────────────────┐
│  OpenCode (terminal, MIT)            │
│  provider « litellm » → 127.0.0.1:4000│
└──────────────────┬───────────────────┘
                   │ OpenAI-compatible (localhost)
                   ▼
┌──────────────────────────────────────────────┐
│  LiteLLM gateway (MIT, 127.0.0.1:4000)       │
│  • alias default / sensitive                 │
│  • fallbacks + retries + cooldown            │
│  • spend tracking / quotas                   │
└───┬────────────────┬───────────────────┬─────┘
    │ sensitive      │ default           │ fallback
    ▼                ▼                   ▼
┌──────────┐   ┌──────────────────┐  ┌──────────────┐
│ Ollama   │   │ Groq / Gemini /  │  │ DeepSeek     │
│ local    │   │ OpenRouter :free │  │ off-peak     │
│ :11434   │   │                  │  │ (payant)     │
└──────────┘   └──────────────────┘  └──────────────┘
```

### 17.3 Config LiteLLM (`~/.config/litellm/config.yaml`)

```yaml
model_list:
  # --- Local / privé (jamais de cloud) ---
  - model_name: local-coder
    litellm_params:
      model: ollama/qwen2.5-coder:14b
      api_base: http://127.0.0.1:11434
  - model_name: local-fast
    litellm_params:
      model: ollama/qwen2.5-coder:7b
      api_base: http://127.0.0.1:11434

  # --- Cloud gratuit (non-sensible) ---
  - model_name: groq-120b
    litellm_params:
      model: groq/openai/gpt-oss-120b
      api_key: os.environ/GROQ_API_KEY
  - model_name: gemini-flash
    litellm_params:
      model: gemini/gemini-3.8-flash
      api_key: os.environ/GEMINI_API_KEY
  - model_name: openrouter-free
    litellm_params:
      model: openrouter/<provider>/<model>:free
      api_key: os.environ/OPENROUTER_API_KEY

  # --- Fallback payant quasi-gratuit ---
  - model_name: deepseek-flash
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY

router_settings:
  routing_strategy: simple-shuffle      # ou usage-based-routing
  num_retries: 2
  timeout: 60
  allowed_fails: 3
  cooldown_time: 30
  model_group_alias:
    default: groq-120b
    sensitive: local-coder              # forcé local, aucun fallback cloud
  fallbacks:
    - groq-120b: ["gemini-flash", "openrouter-free", "deepseek-flash", "local-coder"]
    - gemini-flash: ["groq-120b", "openrouter-free", "deepseek-flash", "local-coder"]
    - openrouter-free: ["gemini-flash", "groq-120b", "deepseek-flash", "local-coder"]

litellm_settings:
  turn_off_message_logging: true        # privacy
  set_verbose: false

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  # database_url: os.environ/DATABASE_URL   # optionnel : spend tracking persistant
```

Lancement :

```bash
# Ollama
ollama serve            # 127.0.0.1:11434

# LiteLLM (bind local uniquement)
litellm --config ~/.config/litellm/config.yaml --host 127.0.0.1 --port 4000
```

> ⚠️ Les identifiants de modèles (`groq/...`, `gemini/...`, `openrouter/...`)
> doivent être ajustés à la version de LiteLLM et aux modèles `:free` du moment.

### 17.4 Config OpenCode (provider LiteLLM)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "litellm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LiteLLM",
      "options": {
        "baseURL": "http://127.0.0.1:4000/v1",
        "apiKey": "{env:LITELLM_MASTER_KEY}"
      },
      "models": {
        "sensitive": { "name": "Local privé (Ollama)" },
        "default":   { "name": "Cloud gratuit (fallback)" }
      }
    }
  }
}
```

> Le schéma exact peut varier selon la version d'OpenCode ; à figer en build.

### 17.5 Politique de routage (privacy by design)

| Sensibilité | Exemple | Alias / modèle |
|---|---|---|
| 🔴 **Sensible** | secrets, `.env`, clés, PII, code propriétaire | `sensitive` → **Ollama uniquement** |
| 🟡 **Général** | OSS public, boilerplate, doc | `default` → Groq → Gemini → OpenRouter `:free` |
| 🔵 **Gros contexte** | analyse de repo, long diff | `gemini-flash` (ou DeepSeek 1M ctx) |
| 💰 **Quotas épuisés** | fallback | `deepseek-flash` (payant) → `local-coder` |

Règles :

1. **En cas de doute → local.** Jamais de code propriétaire vers un pool dont
   les CGU autorisent l'entraînement.
2. Deux alias suffisent : `sensitive` (local, sans fallback) et `default`
   (cloud gratuit avec fallback).
3. Choisir l'alias **par projet** (marqueur `.privacy` ou variable
   `OPENCODE_PROFILE`).

### 17.6 Privacy by design — checklist

- [ ] Fichiers exclus du contexte : `.env`, `*.pem`, clés, `.git/`.
- [ ] LiteLLM : `turn_off_message_logging: true`, bind **127.0.0.1**.
- [ ] Pas de `database_url` si le spend tracking n'est pas nécessaire.
- [ ] Télémétrie désactivée (OpenCode / LiteLLM / Ollama).
- [ ] Revue périodique des CGU des pools gratuits (entraînement ?).

### 17.7 Avantages & limites

**Avantages** : une seule CLI ; 100 % FLOSS ; self-hosted ; privacy by design ;
fallback automatique ; quotas suivis côté LiteLLM (+ dashboard §16).

**Limites** : LiteLLM = service local supplémentaire (léger) ; qualité variable
des modèles gratuits ; le local 16 Go VRAM plafonne à ~14B Q4 ; la config des
identifiants de modèles évolue vite.

### 17.8 Harness : existe-t-il déjà ou faut-il l'adapter ?

| Question | Réponse |
|---|---|
| Harness **agent** (boucle + outils + TUI) | **existe** : OpenCode (MIT), Aider, Goose → pas à coder |
| Harness **gateway** (routage/fallback/quota) | **existe** : LiteLLM (MIT, self-hosted) |
| Produit **turnkey** combinant quotas gratuits + routage privacy + dashboard + ton set exact | **n'existe pas** → intégration/config |
| Faut-il **forker/adapter du code** ? | **non** : configuration + mince script dashboard (§16) |

Conclusion : on **compose** des briques FLOSS existantes ; seul code custom =
le dashboard/`quotadash` (§16), et éventuellement un callback LiteLLM
« quota-aware » (Python) si l'on veut un routage qui tient compte des quotas
restants.

Alternatives gateway (si LiteLLM ne convient pas) : **Bifrost**, **Portkey
Gateway**, **RouteLLM** (routage) — LiteLLM reste le plus complet.

### 17.9 Écartés (et pourquoi)

| Outil | Licence | Verdict |
|---|---|---|
| **OpenHands** | MIT | plateforme **Docker + UI web** (mode headless possible) → pas un CLI terminal unique ; alternative si UI web souhaitée |
| **Cline** | Apache-2.0 | **extension VS Code/JetBrains** → pas un CLI terminal |
| Crush | FSL-1.1-MIT | « Fair Source », pas OSI/FLOSS strict |
| Cursor / Windsurf / Copilot | propriétaire | pas FLOSS |
| OpenCode Zen / Mistral Vibe / Antigravity | cloud/plateforme | hors modèle « CLI unique + gateway » (pools optionnels §3) |

---

## 18. Comparaison : intégration (§17) vs plugin OpenCode

### 18.1 Ce qu'un plugin OpenCode V2 peut réellement faire

Faits vérifiés dans la doc V2 (`opencode.ai/docs/build/plugins/server`) :

- Enregistrer des **providers** et **modèles** (`ctx.provider.transform`,
  `ctx.model.transform`).
- Modifier la requête sortante : hooks `context`, `model.request`,
  `http.request` / `http.response`.
- `experimental.model.resolve` : change le modèle **du même provider
  uniquement** — « A model from another provider fails as unavailable ».
- Hook `retry` : ajuste la **décision/délai** de retry, mais **ne permet pas
  de changer de provider** ; le plafond d'essais natif reste une limite dure.
- `ctx.session.switchModel(...)` : change le modèle de la session **entre deux
  tours**, pas pendant un appel en cours.
- Part **TUI** : dashboard, commandes, routes, slots ; part **server** : tools,
  commands, agents, skills, MCP, permissions, `storage`, `event`.
- `storage` + `event` permettent de tenir un **ledger de quotas** local.

> Conséquence clé : un plugin **ne peut pas** implémenter un vrai **fallback
> inter-fournisseurs par requête**. Il peut le simuler en réécrivant les
> requêtes HTTP (donc réécrire un mini-LiteLLM dans le plugin) ou en basculant
> de modèle entre deux tours — fragile.

### 18.2 Tableau comparatif

| Critère | Plan §17 (LiteLLM) | Plugin seul | Hybride |
|---|---|---|---|
| Fallback inter-fournisseurs **par requête** | ✅ natif | ❌ impossible proprement | ✅ |
| Routage privacy par alias | ✅ `model_group_alias` | ⚠️ `switchModel` entre tours | ✅ |
| Spend tracking / quotas | ✅ intégré | ⚠️ à coder | ✅ |
| Dashboard | ⚠️ script/TUI externe (§16) | ✅ TUI natif | ✅ |
| Services locaux | LiteLLM + Ollama | Ollama | LiteLLM + Ollama |
| Réutilisable par d'autres clients | ✅ endpoint OpenAI | ❌ OpenCode only | ✅ |
| Maintenance | config | code à maintenir | config + plugin mince |
| Verrouillage | faible | fort (OpenCode) | faible |
| Latence | +1 hop localhost (~ms) | minimale | +1 hop |
| Mise en place | rapide | moyenne | moyenne |

### 18.3 Verdict

- **Le plus efficace / robuste** pour le routage, le fallback et les quotas :
  **le plan §17** (LiteLLM).
- **Le plus pratique au quotidien** (UX) : **le plugin** (dashboard TUI, une
  seule installation) — mais **pas seul**.
- **Le plus équilibré** : **l'hybride** = LiteLLM comme socle + un plugin
  OpenCode mince pour l'UX (dashboard §16, pré-vol, commande `/quota`).
- **Plugin seul ? Non** : limite d'API sur le fallback inter-fournisseurs,
  verrouillage OpenCode, et réimplémentation de LiteLLM.

### 18.4 Recommandation

1. Garder **§17** comme architecture de référence (socle).
2. Ajouter un plugin `opencode-quota` (server + TUI) qui :
   - affiche le dashboard et le pré-vol (§16) ;
   - expose `/quota` et des commandes ;
   - bascule d'alias **entre sessions** si un pool est épuisé.
3. Ne **pas** réimplémenter le gateway dans le plugin.

---

## 19. Spécification du plugin `opencode-quota`

### 19.1 Objectif & périmètre

Plugin **d'UX** au-dessus de LiteLLM (§17) : dashboard, pré-vol, historique de
quotas. Il **ne fait pas** d'inférence ni de routage — cela reste dans LiteLLM.

- **Server part** : ledger, lecture des quotas, commandes, outil `quota_status`.
- **TUI part** : widget + page dashboard.
- **Zéro dépendance** à un provider : le plugin lit LiteLLM et les APIs de
  quota, jamais les modèles.

### 19.2 Arborescence du package

```text
opencode-quota/
├── package.json          # exports "." (server) et "./tui"
├── src/
│   ├── index.ts          # Plugin.define({ id: "opencode-quota", setup })
│   ├── ledger.ts         # schéma + merge + reset
│   ├── sources.ts        # LiteLLM /key/info, /spend/logs, headers, APIs
│   ├── estimate.ts       # estimation tokens + marge ×1,3
│   ├── commands.ts       # /quota, /quota refresh, /quota check
│   └── tui.tsx           # widget + page dashboard
└── README.md
```

`package.json` (cible) :

```json
{
  "name": "opencode-quota",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts", "./tui": "./src/tui.tsx" },
  "dependencies": { "@opencode/plugin": "^2.2.7" }
}
```

> **État v0.1** : seul l'export `.` (server part) est implémenté. `./tui` et
> `src/tui.tsx` restent dans la feuille de route.

### 19.3 Hooks utilisés (server V2)

| Hook / API | Usage |
|---|---|
| `ctx.storage` | persister le ledger `quotas.json` (durable, scoped plugin) |
| `ctx.session.hook("prompt", …)` | **pré-vol soft** : estimer, injecter un avertissement si quota bas (ne peut pas rejeter) |
| `ctx.session.hook("http.response", …)` | lire `x-ratelimit-*`, `retry-after`, `x-litellm-*` et mettre à jour le ledger |
| `ctx.session.hook("retry", …)` | observer les 429, journaliser, prolonger le délai si besoin (pas de changement de provider) |
| `ctx.event.subscribe({ types: [...] })` | consommer les événements de messages pour comptabiliser tokens/coût |
| `ctx.command.transform(…)` | enregistrer `/quota`, `/quota refresh`, `/quota check`, `/quota policy` |
| `ctx.tool.transform(…)` | outil `quota_status` (l'agent peut vérifier avant une grosse tâche) |
| `ctx.provider.transform(…)` | **optionnel** : auto-enregistrer le provider `litellm` s'il manque (install facile) |

> ⚠️ Le hook `prompt` **n'expose pas d'API de rejet** : le pré-vol est un
> **avertissement**. Le blocage dur reste assuré par le wrapper/`quotadash`
> (§16) ou par les budgets LiteLLM.

> **État v0.1** : `command.transform`, `tool.transform` (`quota_status`) et
> `http.response` (mise à jour opportuniste du pool `groq` depuis les en-têtes
> `x-ratelimit-*`) sont implémentés. `prompt`, `retry`, `event.subscribe`,
> `ctx.storage`, `provider.transform` et la TUI restent à faire.

### 19.4 Commandes

| Commande | Effet |
|---|---|
| `/quota` | affiche le dashboard (tableau pools, % restant, reset, statut) |
| `/quota refresh` | force la lecture des sources (LiteLLM, headers, APIs) |
| `/quota check <tokens>` | pré-vol : compare l'estimation au restant, répond OK/⚠/⛔ |
| `/quota policy` | rappelle la politique de routage (§17.5) |
| `/quota reset <pool>` | correction manuelle du ledger |

### 19.5 Outil `quota_status`

```ts
ctx.tool.transform((editor) => {
  editor.add({
    name: "quota_status",
    description: "Return remaining quota per pool and the recommended alias",
    input: { type: "object", properties: {}, additionalProperties: false },
    execute: async () => ({ content: JSON.stringify(await ledger.snapshot()) }),
  })
})
```

### 19.6 Schéma du ledger (`quotas.json`)

```json
{
  "version": 1,
  "updated_at": "2026-11-11T10:00:00Z",
  "pools": {
    "groq": {
      "type": "rpm_rpd_tpm_tpd",
      "limits": { "rpm": 30, "rpd": 1000, "tpm": 8000, "tpd": 200000 },
      "used": {
        "requests_today": 120,
        "tokens_today": 45000,
        "requests_minute": 2,
        "tokens_minute": 1200
      },
      "reset_at": "2026-11-12T00:00:00Z",
      "source": "headers",
      "status": "ok"
    },
    "gemini": {
      "type": "rpd",
      "limits": { "rpd": 1500 },
      "used": { "requests_today": 300 },
      "reset_at": "2026-11-12T07:00:00Z",
      "source": "manual",
      "status": "ok"
    },
    "openrouter": {
      "type": "credit",
      "limits": { "credits_usd": 0 },
      "used": { "credits_usd": 0 },
      "source": "api:/api/v1/key",
      "status": "ok"
    },
    "litellm": {
      "type": "spend",
      "limits": { "budget_usd": 5 },
      "used": { "spend_usd": 0.12 },
      "source": "api:/key/info",
      "status": "ok"
    },
    "ollama": { "type": "unlimited", "status": "ok" }
  },
  "history": [
    {
      "ts": "2026-11-11T09:58:00Z",
      "pool": "groq",
      "model": "gpt-oss-120b",
      "tokens_in": 1200,
      "tokens_out": 400,
      "cost_usd": 0
    }
  ]
}
```

Statuts : `ok` (≥ 20 % restant), `warn` (< 20 %), `blocked` (≤ 5 %).

### 19.7 Ce qui reste dans LiteLLM (séparation stricte)

| LiteLLM | Plugin `opencode-quota` |
|---|---|
| clés providers, secrets | lecture seule des quotas |
| routage, alias, fallbacks, retries, cooldown | affichage + pré-vol |
| spend tracking / budgets | lecture de `/key/info`, `/spend/logs` |
| endpoint OpenAI-compatible | aucune inférence |
| virtual keys / équipes | dashboard + historique |

### 19.8 Limites connues

- Pas de fallback inter-fournisseurs par requête (limite API V2, cf. §18).
- Pré-vol **non bloquant** (hook `prompt` sans rejet typé).
- Les headers de quota ne sont pas toujours relayés par LiteLLM → prévoir
  lecture directe des APIs + saisie manuelle.
- Les noms de modèles/quotas évoluent → ledger versionné + `source` explicite.

### 19.9 Installation du plugin (résumé)

```bash
./install.sh          # recommandé : copie le plugin et fusionne opencode.json

# équivalent manuel
mkdir -p ~/.config/opencode/opencode-quota
cp -R opencode-quota/src opencode-quota/package.json \
      opencode-quota/package-lock.json ~/.config/opencode/opencode-quota/
( cd ~/.config/opencode/opencode-quota && npm ci --omit=dev )
# puis ajouter le chemin absolu du dossier dans "plugins" de opencode.json
```

> Détail complet dans §20 (installateur unique).

---

## 20. Distribution, git & installation facile

### 20.1 Objectif

Un utilisateur **qui sait déjà utiliser OpenCode** doit pouvoir installer en
**une commande**, sans éditer de config à la main.

### 20.2 Arborescence du repo

```text
vb-optifree/
├── README.md                 # quickstart 5 étapes
├── LICENSE                   # MIT
├── NOTICE                    # composants MIT et limites des offres gratuites
├── .gitignore
├── .github/workflows/ci.yml  # shellcheck, npm ci/test/typecheck, gitleaks, PII
├── install.sh                # installateur idempotent
├── doctor.sh                 # diagnostic
├── opencode-quota/           # plugin (§19)
│   ├── src/{index,commands,ledger,sources,estimate}.ts
│   ├── test/ledger.test.ts
│   ├── package.json
│   ├── package-lock.json
│   └── README.md
├── config/
│   ├── litellm.config.yaml   # template
│   ├── opencode.json         # template provider litellm
│   └── .env.example
├── systemd/
│   ├── litellm.service       # user unit
│   └── ollama.service        # si non fourni par le paquet
└── docs/
    ├── plan.md               # ce document
    └── initial-sketch.md     # esquisse historique, non maintenue
```

### 20.3 `install.sh` (idempotent)

1. **Vérifie** : `opencode`, `git`, `node`/`npm` (≥ 22.19), `uv`, `ollama`, et
   le **GPU** (`lspci` ou `/sys/class/drm` : AMD `0x1002`, NVIDIA `0x10de`) ;
   affiche les commandes `pacman`/`AUR` **à exécuter par l'utilisateur**
   (jamais de `sudo` lancé par le script).
2. **Installe LiteLLM** : `uv tool install 'litellm[proxy]'`.
3. **Copie les templates** vers `~/.config/litellm/` et `~/.config/opencode/`
   (backup `.bak` si existant) ; `.env` en mode `600`, génération automatique de
   `LITELLM_MASTER_KEY`, injection de la clé et `chmod 600` sur `opencode.json`.
4. **Installe le plugin** : copie de `opencode-quota/` vers
   `~/.config/opencode/opencode-quota/`, `npm ci --omit=dev`, puis ajout du
   chemin absolu dans `plugins[]`.
5. **Active les services user** : `systemctl --user enable --now litellm`
   (+ `ollama` si nécessaire).
6. **Vérifie** : `./doctor.sh`.

Options : `--dry-run`, `--no-systemd`, `--no-plugin`, `--force`, `--yes`.

#### 20.3.1 Ollama & GPU (AMD / NVIDIA / CPU)

| GPU | Installation | Vérification |
|---|---|---|
| **AMD** | `ollama-rocm` (AUR) ou installeur officiel Ollama (détecte ROCm) | `rocminfo`, `ollama ps` |
| **NVIDIA** | `ollama-cuda` (AUR) ou installeur officiel + `cuda` + pilote `nvidia`/`nvidia-open` | `nvidia-smi`, `ollama ps` |
| **CPU** | `ollama` | `ollama ps` |

- **Docker** : NVIDIA → `--gpus all` ; AMD → `--device /dev/kfd --device /dev/dri`.
- Modèles : 8 Go → 7B Q4 ; 12–16 Go → 14B Q4 ; 24 Go → 32B Q4.
- Le script **n'exécute jamais `sudo`** : il affiche les commandes à l'utilisateur.

### 20.4 `doctor.sh`

- ports `4000` / `11434` ouverts en local ;
- `GET /v1/models` sur LiteLLM ;
- `ollama list` ;
- présence des clés (`GROQ_API_KEY`, etc.) ;
- `opencode --version` et plugin chargé ;
- résumé OK/⚠/⛔.

### 20.5 README — quickstart

```bash
git clone https://github.com/<login>/vb-optifree.git && cd vb-optifree
cp config/.env.example .env && $EDITOR .env   # clés (optionnel)
./install.sh
./doctor.sh
opencode
```

### 20.6 Distribution

- **Plugin** : publié sur npm (`opencode-quota`) + install local supportée.
- **Config LiteLLM** : template versionné, jamais de secret dans le repo.
- **Secrets** : `.env` local + `{env:...}` dans les configs.
- **Versionnage** : tags SemVer ; `CHANGELOG.md`.

### 20.7 Git & CI

- Dépôt : **GitHub `vb-optifree`** ; branche `main`.
- Identité de commit **sans PII** : `user.name` = login GitHub,
  `user.email` = `<id>+<login>@users.noreply.github.com` (jamais l'e-mail
  personnel).
- `.gitignore` : `.env`, `node_modules`, `*.log`, `quotas.json`,
  `opencode_session.sh`, `grok_session.sh` réel.
- **LICENSE MIT** (cohérent avec OpenCode/LiteLLM/Ollama).
- GitHub Actions : `shellcheck`, `gitleaks`, `npm ci && npm test`,
  `npm run build` du plugin ; permissions minimales (`contents: read`).
- **Règle** : aucun `git commit` sans demande explicite de l'utilisateur.

### 20.8 Niveau requis

L'utilisateur doit savoir : lancer `opencode`, éditer un `.env`, exécuter une
commande `sudo` **lui-même** quand le diagnostic le demande. Rien d'autre.

### 20.9 Décisions

- [x] Hébergeur : **GitHub**.
- [x] Nom du repo : **`vb-optifree`** (Vibe-Coding Optimal Free).
- [x] Publication npm du plugin : **oui** (`opencode-quota`).
- [x] GPU : **AMD (ROCm) + NVIDIA (CUDA) + CPU**, détection automatique.

---

## 21. Audit cybersécurité & assainissement PII (avant push)

### 21.1 Résultat de l'audit (11 nov. 2026)

| Fichier | Donnée sensible | Action |
|---|---|---|
| `opencode_session.sh` | ID de session `ses_...` | **exclu** du dépôt (`.gitignore`) ; modèle `grok_session.sh` avec `<SESSION_ID>` |
| `docs/plan.md` §9 | hostname réel | remplacé par « génériques » |
| `docs/plan.md` §3.10 / §9 | modèle GPU réel | généricisé (VRAM 8/12/16/24 Go) |
| `docs/plan.md` §9 | ID de session | supprimé |
| `.env` (futur) | clés API | **jamais** versionné ; `.env.example` seulement |
| `quotas.json` (futur) | historique d'usage | **jamais** versionné |

**Aucune clé API, aucun e-mail, aucune IP, aucun MAC** détecté dans les
fichiers actuels (grep).

### 21.2 Règles d'assainissement

1. **Aucun identifiant de machine** : pas de hostname, username, `/home/<user>`,
   ID de session, numéro de série.
2. **Matériel** : décrire en classes (VRAM, RAM, CPU), jamais en modèle exact
   rattaché à une personne.
3. **Secrets** : `.env` local, `{env:...}` (OpenCode) / `os.environ/...`
   (LiteLLM), `chmod 600`.
4. **Journaux** : jamais de logs, `quotas.json`, `*.bak`, bases de sessions.
5. **Identité git** : e-mail **noreply** GitHub ; `user.name` = login public.
6. **Métadonnées** : pas de commentaires « chez moi », pas de chemins
   personnels.

### 21.3 `.gitignore` (modèle)

```gitignore
.env
.env.*
!.env.example
node_modules/
dist/
.venv/
__pycache__/
*.log
*.bak
quotas.json
opencode_session.sh
grok_session.sh
.DS_Store
```

> `grok_session.sh` réel est ignoré. Le dépôt n'en fournit pas de copie.

### 21.4 Contrôles avant `git push`

```bash
# 1. secrets
gitleaks detect --source . --no-git
# ou
trufflehog filesystem . --only-verified

# 2. PII / chemins
git grep -nE '<user>|<host>|/home/|ses_|([0-9]{1,3}\.){3}[0-9]{1,3}' || true

# 3. identité des commits
git log --format='%an <%ae>'

# 4. fichiers ignorés
git status --ignored

# 5. dépendances
npm ci && npm audit --omit=dev
```

### 21.5 CI sécurité (GitHub Actions)

- `gitleaks` sur chaque PR/push.
- `shellcheck` sur `install.sh` / `doctor.sh`.
- `npm audit` + `npm test`.
- Permissions `contents: read` ; actions épinglées par SHA.
- **Ne pas** publier de secrets dans les logs CI.

### 21.6 Checklist de publication

Reprise du 11 nov. 2026, après le commit `12948cf` (travail DeepSeek V4.1 Flash).
Les tours suivants, sur des modèles Qwen locaux, ne font pas partie de ce dépôt.

- [x] `docs/plan.md` assaini (aucun hostname/username/session/GPU exact).
- [x] `opencode_session.sh` et `grok_session.sh` réel absents / ignorés.
- [x] `.env.example` sans valeurs réelles (`LITELLM_MASTER_KEY=change-me`, clés vides).
- [ ] `gitleaks` en local : binaire absent sur la machine au moment du push.
      Le job CI `secrets` le lance sur GitHub.
- [x] `git log` : `goheakan <goheakan@users.noreply.github.com>`.
- [x] `LICENSE` MIT + `NOTICE` tiers (OpenCode, LiteLLM, Ollama).
- [x] `README` : avertissement « ne committez jamais `.env` ».
- [x] Contrôles avant push : `git grep` PII vide, `shellcheck` propre,
      `npm test` 10/10, `tsc --noEmit` propre.
      `npm audit --omit=dev` : 24 modérées transitives via `@opencode/plugin`,
      aucune haute, pas de correctif amont (déjà noté dans le README).
- [x] Dépôt public : https://github.com/goheakan/vb-optifree (`main`).
      Le premier commit est `12948cf`. Le durcissement suit dans le commit
      qui versionne cette checklist.

### 21.7 Note sur la publication npm

- `npm publish --access public` depuis le compte npm du mainteneur.
- `package.json` : `author` = pseudo public, **pas** d'e-mail personnel.
- `files` limité à `src/`, `README.md`, `LICENSE`.
- `npm audit` + `npm provenance` (optionnel).

---

## 21.8 Durcissement (reprise sécurité, 11 nov. 2026)

Correctifs versionnés avec cette section :

- La clé maître n'est plus passée à `sed`, `jq` ou `curl` par les arguments.
- Démarrage refusé si `.env` n'est pas en mode `600` ou si la clé est un
  placeholder (`scripts/check-litellm-env.sh`, `ExecStartPre`).
- Le plugin n'envoie cette clé qu'à `127.0.0.1` ou `::1`, sans suivre
  une redirection. Une clé placeholder n'est pas envoyée.
- Ledger en mode `600`, répertoire d'état en mode `700`.
- `doctor.sh` échoue si LiteLLM ou Ollama écoutent hors boucle locale,
  ou si `opencode.json` contient une clé sans mode `600`.
- OpenRouter retiré de la chaîne active tant que le modèle est un
  placeholder : un identifiant faux ne doit pas recevoir le prompt.
- LiteLLM : pas de stockage des prompts, rédaction des messages et des
  infos de clé, `trusted_proxy_ranges: []`.
- Actions GitHub épinglées par SHA. `npm audit` critique dans la CI.
- Sauvegardes `.bak` de l'installeur en mode `600`.

## 22. Banc d'essai Docker (11 nov. 2026)

Décision : les étapes se valident dans Docker. `./install.sh` sur la machine
attend que ce banc soit stable. Les étapes d'après (npm, hooks manquants,
vibe-coding réel) attendent aussi.

`./docker/smoke.sh` a réussi avec les quatre contrôles demandés, dans la
même exécution :

- 12 tests du plugin dans `node:22` (image épinglée, sources en lecture seule) ;
- LiteLLM `v1.108.5` non-root, Ollama et OpenCode `1.19.5`, images épinglées ;
- clé générée pour le banc, refusée si elle ne passe pas `check-litellm-env.sh`,
  effacée à la sortie avec les clés cloud de test ;
- `127.0.0.1:4000` seulement ; l'Ollama de l'hôte sur `11434` n'est pas repris ;
- `/v1/models` sans clé : 401 ; avec la clé : alias `local-coder` et `sensitive` ;
- `qwen2.5-coder:0.5b` est téléchargé dans le volume du banc. L'alias
  `sensitive` répond HTTP 200 avec du texte, et le faux cloud n'est pas touché ;
- l'alias `default` suit Groq, puis Gemini, puis DeepSeek, puis le modèle
  local. Les trois hops cloud sont un serveur Node du réseau Docker. Une
  panne de Groq s'arrête sur Gemini. Les trois en panne finissent sur le
  modèle local. Aucune requête ne part chez Groq, Google ou DeepSeek ;
- OpenCode 1.19.5 (`provider` au singulier, paquet `@ai-sdk/openai-compatible`)
  obtient un texte via `http://127.0.0.1:4000/v1`. Le mot exact n'est pas
  exigé : `0.5b` ne le produit pas de façon stable ;
- la clé et le prompt de test sont absents des journaux des conteneurs ;
- conteneurs, volume et fichiers de clé supprimés à la fin.

Le repli de `default` est déclaré sur l'alias, dans le fichier du banc et
dans `config/litellm.config.yaml`. LiteLLM cherche la chaîne sur le nom
demandé par le client, pas seulement sur `groq-120b`.

Limites mesurées : OpenCode partage l'espace réseau d'Ollama, qui a une
sortie pour télécharger le modèle. Le test montre que la complétion ne
touche pas le faux cloud. Il ne prouve pas l'absence de route vers Internet.
`cap_drop: ALL` et le système de fichiers en lecture seule ont suffi pour
OpenCode. Le GPU n'est pas passé aux conteneurs. `./install.sh` n'a pas
été lancé.

## 23. Suite — quota gratuit d'abord (11 nov. 2026)

Ollama n'est plus dans le chemin courant. Le projet doit d'abord offrir
la plus longue durée de quota gratuit, puis fonctionner sans modèle local.
Ollama, le GPU et l'alias `sensitive` viennent après.

1. Fait. La chaîne `default` est Groq, puis Gemini, puis DeepSeek. Elle ne
   finit plus sur `local-coder`. Les modèles locaux sont commentés pour que
   LiteLLM démarre sans rien sur le port 11434. Gemini ne revient pas vers Groq.
2. Fait pour Zen, Groq et Gemini. DeepSeek reste le plan B payant.
   OpenRouter reste hors chaîne : aucun identifiant `:free` n'a été vérifié
   le jour de ce changement. Une clé par fournisseur.
3. Fait. `chooseModel` choisit le pool encore ouvert avant l'envoi.
   `unknown` reste utilisable. Un modèle hors chaîne, y compris `sensitive`,
   n'est pas renvoyé vers un cloud.
4. Fait. Le ledger va dans `ctx.storage` et dans le fichier local. Un 429
   bloque le pool. Le délai utilisé est `retryAfterMs` quand il est annoncé,
   sinon 24 h. Un second 429 sans délai ne rallonge pas un reset plus court.
   Les en-têtes remplacent la consommation. Un HTTP 200 sans en-tête compte
   une requête. `/quota` affiche le prochain modèle.
5. Fait. `./docker/smoke.sh` se termine sans service Ollama. Groq répond
   `FROM-GROQ`, la panne de Groq passe à Gemini, les trois hops en panne
   répondent HTTP 503. OpenCode 1.19.5 du banc obtient `FROM-GROQ` via
   `litellm/default` sur `127.0.0.1:4000`. Les clés de test sont effacées.
6. Fait. `install.sh` n'installe ni n'active `ollama.service`. Le GPU est
   affiché et non requis. `doctor.sh` ne fait plus échouer l'absence
   d'Ollama. LiteLLM écoute sur `127.0.0.1:4000`.
7. Partiel. Un appel réel au modèle `opencode/deepseek-v4.1-flash-free`,
   depuis un répertoire vide, a reçu HTTP 429 « Free usage limit reached ».
   Aucun paiement, aucun passage par Ollama. Le plugin a marqué le pool
   `zen` bloqué jusqu'au délai annoncé. Aucune clé Groq, Gemini ou DeepSeek
   n'était renseignée : le repli payant n'a pas été appelé.
8. Après ce fonctionnement : publication npm, `gitleaks` local, relecture
   des CGU et de la télémétrie des free tiers, puis Ollama.

## 24. Ordre Groq, DeepSeek, Gemini (11 nov. 2026)

L'ordre demandé pour la passerelle est Groq, puis DeepSeek, puis Gemini.
Zen reste le premier choix tant qu'il est dans l'ordre. DeepSeek est
payant et passe maintenant avant Gemini. Un hop ne revient pas en arrière.

`/quote order` affiche cet ordre, ou l'enregistre. `/quota order` fait la
même chose. Les noms acceptés sont `zen`, `groq`, `deepseek` et `gemini`,
une fois chacun. L'ordre est dans le ledger. Le choix avant l'envoi le
suit tout de suite. La commande réécrit l'alias et les replis de la config
LiteLLM installée. Le repli sur un HTTP 503 suit ce fichier après
`systemctl --user restart litellm`.

Le pas à pas d'une clé fournisseur est dans `docs/ajouter-une-cle.md`.
Il commence par la création du compte et de la clé chez Groq, DeepSeek
et Gemini, puis le rangement dans `~/.config/litellm/.env`.
OpenRouter reste vide.

Node du terminal : nvm, branche 22, en 22.23.5 depuis le 11 nov. 2026.
Le plugin demande 22.19 ou plus. Cette exigence est couverte.

Le banc `./docker/smoke.sh` confirme cet ordre : Groq répond, une panne de
Groq passe à DeepSeek, les trois hops en panne répondent HTTP 503.
OpenCode du banc obtient encore la réponse du premier hop. 27 tests du
plugin passent. Rien n'est commité.

## Annexe — sources consultées (11 nov. 2026)

- OpenCode Console / Zen : `opencode.ai/docs/zen`
- Groq rate limits : `console.groq.com/docs/rate-limits`
- Gemini pricing : `ai.google.dev/pricing`
- Cerebras : `cerebras.ai/inference`
- DeepSeek pricing : `api-docs.deepseek.com`
- Mistral pricing : `mistral.ai/pricing`
- Antigravity : `antigravity.google`
- OpenRouter : `openrouter.ai/docs`
