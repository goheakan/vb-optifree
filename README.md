# vb-optifree — Vibe-Coding Optimal Free

> Une seule CLI, tout FLOSS, le plus longtemps possible sur des quotas gratuits.

`vb-optifree` assemble des briques libres pour faire du vibe-coding à coût quasi nul :

| Brique | Rôle | Licence |
|---|---|---|
| [OpenCode](https://opencode.ai) | CLI agent de vibe-coding, et pool Zen free | MIT |
| [LiteLLM](https://github.com/BerriAI/litellm) | passerelle OpenAI-compatible : routage, fallbacks, quotas, spend | MIT |

Le principe : **cumuler les quotas** de plusieurs fournisseurs. L'ordre par défaut est Zen, Groq, DeepSeek, puis Gemini. DeepSeek est payant et passe avant Gemini. Le plugin `opencode-quota` choisit le pool encore ouvert avant l'envoi. Tu changes l'ordre dans OpenCode avec `/quote order`. Ollama viendra après, pour le contenu sensible.

## Architecture

```text
┌──────────────────────────────┐
│ OpenCode (CLI, MIT)          │
│  - agent de code             │
│  - commandes /quota /quote   │
└──────────────┬───────────────┘
               │ OpenAI-compatible
               ▼
┌──────────────────────────────┐
│ OpenCode Zen free            │
│  (sans clé, dans OpenCode)   │
└──────────────┬───────────────┘
               │ si le pool est bloqué
               ▼
┌──────────────────────────────┐
│ LiteLLM (127.0.0.1:4000)     │
│  - alias default             │
│  - Groq → DeepSeek → Gemini  │
│  - clés providers            │
└──────────────────────────────┘
```

## Prérequis

- Linux (testé sur Arch Linux ; les commandes d'installation sont indiquées pour pacman/AUR).
- [OpenCode](https://opencode.ai) installé.
- [uv](https://docs.astral.sh/uv/) pour installer LiteLLM sans `sudo`.
- `git`, `node` (≥ 22.19), `npm`, `jq`, `curl`.
- Ollama et un GPU ne sont pas requis pour ce chemin.

Si `node -v` est inférieur à 22.19 et que Node vient de [nvm](https://github.com/nvm-sh/nvm), lance ces commandes dans le terminal où `nvm` existe, puis ouvre un nouveau terminal :

```bash
nvm install 22
nvm alias default 22
node -v
```

`nvm install 22` prend la dernière publication de la branche 22. Le 11 nov. 2026, c'est la 22.23.5. Un Node installé par le gestionnaire de paquets de la distribution se met à jour avec le reste du système. Sur Arch, c'est un `pacman -Syu` complet, que tu lances toi-même. Installer `nodejs` à côté d'un Node nvm laisse deux exécutables.

## Démarrage rapide

```bash
git clone https://github.com/goheakan/vb-optifree.git
cd vb-optifree
./install.sh                 # installe LiteLLM, les configs, le plugin et les services user
$EDITOR ~/.config/litellm/.env   # une clé par fournisseur, voir docs/ajouter-une-cle.md
systemctl --user restart litellm
opencode
```

Le pas à pas pour obtenir chaque clé, puis la ranger, est dans [docs/ajouter-une-cle.md](docs/ajouter-une-cle.md). La clé reste dans `~/.config/litellm/.env`. Elle ne va ni dans le dépôt, ni dans le chat.

Puis, dans OpenCode :

```text
/quota                 # dashboard des pools
/quota check 12000     # pré-vol : 12k tokens estimés
/quota policy          # rappel de la politique de routage
/quote order           # affiche l'ordre des pools
/quote order zen groq gemini deepseek
```

## Ce que fait `install.sh`

- Vérifie les prérequis et **affiche** les commandes pacman/AUR manquantes (il ne lance jamais `sudo`).
- Affiche le GPU détecté. Il n'est pas requis : Ollama n'est pas dans le chemin courant.
- Installe LiteLLM avec `uv tool install 'litellm[proxy]'`.
- Copie les modèles de config dans `~/.config/litellm/` et `~/.config/opencode/` **sans écraser** un fichier existant (sauf `--force`).
- Installe le plugin dans `~/.config/opencode/opencode-quota/`.
- Fusionne le provider `litellm` et le plugin dans `~/.config/opencode/opencode.json` (via `jq`).
- Installe et active le service **utilisateur** systemd `litellm`. Il n'active pas `ollama`.
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

Ollama et le GPU ne font pas partie du chemin courant. Le tableau reste là pour la suite, quand le projet tournera déjà sans modèle local.

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

| Ordre | Pool | Cible |
|---|---|---|
| 1 | OpenCode Zen free | `opencode/deepseek-v4.1-flash-free` (sans clé, seulement dans OpenCode) |
| 2 | Groq | `groq-120b` |
| 3 | DeepSeek | `deepseek-flash`, payant |
| 4 | Gemini Flash | `gemini-flash`, dernier de l'ordre par défaut |

OpenRouter reste hors de cette chaîne tant qu'un identifiant `:free` réel n'est pas écrit dans la config. Une clé par fournisseur. Pas de second compte pour contourner une limite.

L'alias `sensitive` et les modèles locaux attendent Ollama. Ils ne sont pas renvoyés vers un cloud gratuit.

La règle d'or : **ne jamais envoyer un secret à un modèle cloud gratuit**. Les offres gratuites peuvent entraîner sur les données ou les conserver.

## Commandes du plugin `opencode-quota`

| Commande | Effet |
|---|---|
| `/quota` | dashboard : pools, % restant, reset, statut |
| `/quota refresh` | relit les sources (headers, APIs, LiteLLM) |
| `/quota check <tokens>` | pré-vol : OK / ⚠ / ⛔ selon le restant |
| `/quota policy` | rappelle la politique de routage |
| `/quota reset <pool>` | correction manuelle du ledger |
| `/quota order` | affiche l'ordre, ou le change si des pools suivent |
| `/quote order` | même action |
| `/quote order groq deepseek gemini` | enregistre cet ordre |

Les pools acceptés sont `zen`, `groq`, `deepseek` et `gemini`, une fois chacun. L'ordre est écrit dans le ledger. Le choix avant l'envoi le suit tout de suite. La config LiteLLM installée est réécrite pour le repli sur un HTTP 503. Ce repli prend effet après `systemctl --user restart litellm`.

Le ledger est stocké dans `~/.local/state/vb-optifree/quotas.json` et dans le stockage du plugin. Il n'est **jamais** versionné. Le plugin choisit le pool encore ouvert avant l'envoi, et avertit si le restant passe sous 20 %. Une bascule vers DeepSeek rappelle qu'il est payant.

## Banc d'essai Docker

```bash
./docker/smoke.sh
```

Il télécharge des images épinglées, lance un faux cloud et LiteLLM, joue les tests du plugin, puis tout efface. Il ne démarre pas Ollama, ne monte pas `~/.config`, et ne publie le port `4000` que sur `127.0.0.1`. Le GPU n'est pas passé aux conteneurs.

L'alias `default` suit Groq, puis DeepSeek, puis Gemini. Si les trois hops tombent, la requête échoue : il n'y a pas de repli local. Ces hops parlent à un serveur du réseau Docker, avec des clés créées au lancement et effacées à la sortie. Aucune requête de test ne part chez Groq, Google ou DeepSeek. OpenCode 1.19.5, dans le même banc, envoie son prompt à `litellm/default` sur `http://127.0.0.1:4000/v1`.

La config de production reste `config/litellm.config.yaml`. Le fichier du banc est `docker/litellm.test.yaml`. Le repli de `default` est aussi déclaré sur l'alias : LiteLLM cherche la chaîne sur le nom demandé par le client. Un hop ne revient pas vers un pool déjà passé.

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
│   │   ├── route.ts
│   │   └── commands.ts
│   └── test/
│       ├── ledger.test.ts
│       ├── route.test.ts
│       ├── security.test.ts
│       └── store.test.ts
├── docker/
│   ├── compose.yaml
│   ├── smoke.sh
│   ├── litellm.test.yaml
│   ├── mock_upstream.mjs
│   ├── Dockerfile.opencode
│   └── opencode-entry.sh
├── docs/
│   ├── plan.md
│   ├── ajouter-une-cle.md
│   └── initial-sketch.md
└── .github/
    └── workflows/ci.yml
```

## Sécurité et vie privée

- LiteLLM écoute uniquement sur `127.0.0.1`. `doctor.sh` échoue si LiteLLM
  ou Ollama écoutent ailleurs. Ollama lui-même n'est pas requis.
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
```

## Licence

MIT — voir [LICENSE](LICENSE). Les modèles et services tiers ont leurs propres licences et conditions d'utilisation ; voir [NOTICE](NOTICE).
