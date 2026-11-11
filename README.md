# vb-optifree — Vibe-Coding Optimal Free

> Une seule CLI, tout FLOSS, du cloud gratuit quand c'est possible, du local quand c'est sensible.

`vb-optifree` assemble trois briques libres pour faire du vibe-coding à coût quasi nul :

| Brique | Rôle | Licence |
|---|---|---|
| [OpenCode](https://opencode.ai) | CLI agent de vibe-coding | MIT |
| [LiteLLM](https://github.com/BerriAI/litellm) | passerelle OpenAI-compatible : routage, fallbacks, quotas, spend | MIT |
| [Ollama](https://ollama.com) | modèles locaux, privés et hors ligne | MIT |

Le principe : **cumuler les quotas gratuits** de plusieurs fournisseurs cloud, et **basculer en local** dès qu'un contenu est sensible. LiteLLM est le socle de routage ; un petit plugin OpenCode (`opencode-quota`) affiche l'état des quotas et fait le pré-vol.

## Architecture

```text
┌──────────────────────────────┐
│ OpenCode (CLI, MIT)          │
│  - agent de code             │
│  - commandes /quota          │
└──────────────┬───────────────┘
               │ OpenAI-compatible
               ▼
┌──────────────────────────────┐
│ LiteLLM (127.0.0.1:4000)     │
│  - alias default / sensitive │
│  - fallbacks, retries        │
│  - clés providers            │
│  - spend tracking            │
└───────┬──────────────┬───────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌──────────────────────────────┐
│ Ollama       │  │ Cloud gratuit                 │
│ 127.0.0.1:   │  │ Groq / Gemini / DeepSeek      │
│ 11434        │  │ (puis DeepSeek en secours)    │
└──────────────┘  └──────────────────────────────┘
```

## Prérequis

- Linux (testé sur Arch Linux ; les commandes d'installation sont indiquées pour pacman/AUR).
- [OpenCode](https://opencode.ai) installé.
- [uv](https://docs.astral.sh/uv/) pour installer LiteLLM sans `sudo`.
- [Ollama](https://ollama.com) installé, avec la variante GPU adaptée (voir plus bas).
- `git`, `node` (≥ 22.19), `npm`, `jq`, `curl`.
- Un GPU AMD ou NVIDIA est recommandé pour le local ; le CPU fonctionne en secours.

## Démarrage rapide

```bash
git clone https://github.com/goheakan/vb-optifree.git
cd vb-optifree
./install.sh                 # installe LiteLLM, les configs, le plugin et les services user
$EDITOR ~/.config/litellm/.env   # renseigne au moins une clé API gratuite
systemctl --user restart litellm
opencode
```

Puis, dans OpenCode :

```text
/quota                 # dashboard des pools
/quota check 12000     # pré-vol : 12k tokens estimés
/quota policy          # rappel de la politique de routage
```

## Ce que fait `install.sh`

- Vérifie les prérequis et **affiche** les commandes pacman/AUR manquantes (il ne lance jamais `sudo`).
- Détecte le GPU (AMD / NVIDIA / CPU) et recommande la variante Ollama.
- Installe LiteLLM avec `uv tool install 'litellm[proxy]'`.
- Copie les modèles de config dans `~/.config/litellm/` et `~/.config/opencode/` **sans écraser** un fichier existant (sauf `--force`).
- Installe le plugin dans `~/.config/opencode/opencode-quota/`.
- Fusionne le provider `litellm` et le plugin dans `~/.config/opencode/opencode.json` (via `jq`).
- Installe et active les services **utilisateur** systemd (`litellm`, `ollama` si aucun service système).
- Lance `doctor.sh` à la fin.

Options :

```bash
./install.sh --dry-run       # montre les actions sans les exécuter
./install.sh --no-systemd    # ne touche pas à systemd
./install.sh --no-plugin     # installe seulement la passerelle
./install.sh --force         # remplace les configs existantes (backup automatique)
./install.sh --yes           # n'interrompt pas
```

## GPU et Ollama

| Matériel | Paquet Ollama | Vérification |
|---|---|---|
| AMD (ROCm) | `ollama-rocm` (AUR ou dépôt officiel selon la distro) | `rocminfo`, puis `ollama ps` |
| NVIDIA | `ollama-cuda` (AUR ou dépôt officiel) + pilote `nvidia`/`nvidia-open` | `nvidia-smi`, puis `ollama ps` |
| CPU seul | `ollama` | `ollama ps` |

Tailles indicatives en quantification Q4 :

| VRAM | Modèle local conseillé |
|---|---|
| 8 Go | 7B |
| 12–16 Go | 14B |
| 24 Go et + | 32B |

Le `install.sh` ne lance pas les commandes d'installation système : il les affiche pour que tu les exécutes toi-même avec `sudo` si nécessaire.

## Politique de routage

| Sensibilité | Alias OpenCode | Cible LiteLLM |
|---|---|---|
| 🔴 Secret / client / santé / juridique | `sensitive` | `local-coder` (Ollama uniquement, **aucun fallback cloud**) |
| 🟡 Code public / questions générales | `default` | Groq gratuit → Gemini → DeepSeek → local |
| 🔵 Gros contexte | `default` (ou `cloud`) | Gemini / DeepSeek 1M ctx |
| 💰 Quotas épuisés | — | `deepseek-flash` (payant quasi-gratuit) → `local-coder` |

La règle d'or : **ne jamais envoyer un secret à un modèle cloud gratuit**. Les offres gratuites peuvent entraîner sur les données ou les conserver ; le local est la seule voie sûre.

## Commandes du plugin `opencode-quota`

| Commande | Effet |
|---|---|
| `/quota` | dashboard : pools, % restant, reset, statut |
| `/quota refresh` | relit les sources (headers, APIs, LiteLLM) |
| `/quota check <tokens>` | pré-vol : OK / ⚠ / ⛔ selon le restant |
| `/quota policy` | rappelle la politique de routage |
| `/quota reset <pool>` | correction manuelle du ledger |

Le ledger est stocké dans `~/.local/state/vb-optifree/quotas.json`. Il n'est **jamais** versionné.

## Banc d'essai Docker

Tant que les étapes ne sont pas stables, on ne lance pas `./install.sh` sur la machine. Le banc est à part :

```bash
./docker/smoke.sh
```

Il télécharge des images épinglées, lance Ollama et LiteLLM, joue les 12 tests du plugin, vérifie le routage `sensitive`, puis tout efface. Il ne monte pas `~/.config`, ne touche pas au service Ollama déjà présent, et ne publie le port `4000` que sur `127.0.0.1`. Aucun modèle n'est téléchargé : l'appel `sensitive` doit échouer côté Ollama, pas partir vers un cloud. Le GPU de la machine n'est pas passé aux conteneurs.

## Arborescence

```text
vb-optifree/
├── README.md
├── LICENSE
├── NOTICE
├── .gitignore
├── install.sh
├── doctor.sh
├── config/
│   ├── litellm.config.yaml
│   ├── opencode.json
│   └── .env.example
├── systemd/
│   ├── litellm.service
│   └── ollama.service
├── opencode-quota/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── ledger.ts
│   │   ├── sources.ts
│   │   ├── estimate.ts
│   │   └── commands.ts
│   └── test/
│       └── ledger.test.ts
├── docker/
│   ├── compose.yaml
│   └── smoke.sh
├── docs/
│   ├── plan.md
│   └── initial-sketch.md
└── .github/
    └── workflows/ci.yml
```

## Sécurité et vie privée

- LiteLLM écoute uniquement sur `127.0.0.1`. `doctor.sh` échoue si LiteLLM
  ou Ollama écoutent ailleurs.
- Les clés sont dans `~/.config/litellm/.env` (mode `600`), jamais dans le dépôt.
- `scripts/check-litellm-env.sh` refuse le démarrage si ce fichier n'est pas
  en mode `600`, ou si la clé maître est vide, trop courte, ou encore un
  placeholder. systemd l'appelle avant LiteLLM.
- `install.sh` génère une `LITELLM_MASTER_KEY` locale sans la placer dans
  la ligne de commande. Il l'injecte dans `~/.config/opencode/opencode.json`
  et passe ce fichier en mode `600` : il contient un secret local, ne le
  versionne pas. Les sauvegardes `.bak` sont aussi en mode `600`.
- `turn_off_message_logging: true`, `redact_user_api_key_info: true` et
  `store_prompts_in_spend_logs: false` dans LiteLLM.
- Le plugin n'envoie la clé maître qu'à `127.0.0.1` ou `::1`, et ne suit
  pas les redirections. `localhost` est refusé.
- OpenRouter n'est pas dans la chaîne tant que son modèle n'est pas un
  identifiant réel dans `config/litellm.config.yaml`.
- Le ledger et les scripts de session sont ignorés par Git.
- Aucune donnée personnelle (nom, e-mail, hostname, GPU, ID de session) n'est nécessaire au fonctionnement.
- Avant toute publication : `grep` PII, `gitleaks`, `shellcheck`, `npm audit`.
- `npm audit` peut signaler des vulnérabilités **modérées transitives** via
  `@opencode/plugin` (`glob`/`minimatch`, outillage npm), sans correctif amont.
  Elles ne concernent pas les prompts envoyés aux modèles ; surveille les mises
  à jour du SDK.

## Dépannage

```bash
./doctor.sh
systemctl --user status litellm
journalctl --user -u litellm -n 100
curl -s http://127.0.0.1:11434/api/tags | jq
```

## Licence

MIT — voir [LICENSE](LICENSE). Les modèles et services tiers ont leurs propres licences et conditions d'utilisation ; voir [NOTICE](NOTICE).
