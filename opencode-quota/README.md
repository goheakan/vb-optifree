# opencode-quota

Petit plugin OpenCode qui affiche l'état des quotas des pools gratuits et fait
un pré-vol avant une tâche coûteuse. Il **n'effectue aucun routage** : le
routage, les clés et les fallbacks restent dans LiteLLM.

## Installation

Le plus simple est d'utiliser le dépôt `vb-optifree` :

```bash
./install.sh
```

Le plugin est alors copié dans `~/.config/opencode/opencode-quota` et référencé
dans `~/.config/opencode/opencode.json`.

Installation manuelle :

```bash
mkdir -p ~/.config/opencode/opencode-quota
cp -R src package.json ~/.config/opencode/opencode-quota/
cd ~/.config/opencode/opencode-quota
npm install --omit=dev
```

Puis ajoute le chemin absolu du plugin dans `plugins` de ta config OpenCode :

```json
{
  "plugins": ["/home/<user>/.config/opencode/opencode-quota"]
}
```

## Commandes

| Commande | Effet |
|---|---|
| `/quota` | dashboard des pools |
| `/quota refresh` | relit les sources disponibles |
| `/quota check <tokens>` | pré-vol : OK / ⚠ / ⛔ |
| `/quota policy` | rappelle la politique de routage |
| `/quota reset <pool>` | remet les compteurs du pool à zéro |

## Ledger

Le fichier `~/.local/state/vb-optifree/quotas.json` contient les limites, les
consommations, la date de reset et la source de chaque pool. Il est créé au
premier usage et n'est jamais versionné.

## Sources de données

- **Groq** : en-têtes `x-ratelimit-*` des réponses.
- **OpenRouter** : `GET https://openrouter.ai/api/v1/key`.
- **LiteLLM** : `GET /key/info` (spend) et `/health`.
- **Gemini** : saisie manuelle (les quotas ne sont pas exposés par l'API).
- **Ollama** : illimité par construction.

## Limites

- OpenCode V2 ne permet pas à un plugin de changer de provider par requête ;
  le fallback inter-fournisseurs est assuré par LiteLLM.
- Le pré-vol est **non bloquant** : il affiche un avertissement, il n'empêche
  pas l'envoi.
- Les noms de modèles et les quotas gratuits évoluent : adapte
  `config/litellm.config.yaml` et le ledger.

## Développement

```bash
npm install
npm test
npm run typecheck
```

## Licence

MIT.
