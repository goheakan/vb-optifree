# opencode-quota

Petit plugin OpenCode qui affiche l'état des quotas et fait un pré-vol avant
une tâche coûteuse. Avant l'envoi, il choisit le premier pool encore ouvert.
L'ordre par défaut est Zen, Groq, DeepSeek, puis Gemini. `/quote order` le
change. Les clés et le repli pendant la requête restent dans LiteLLM.

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
| `/quota order` | affiche ou change l'ordre des pools |
| `/quote order` | même action |
| `/quote order groq deepseek gemini` | enregistre cet ordre |

## Ledger

Le fichier `~/.local/state/vb-optifree/quotas.json` contient les limites, les
consommations, la date de reset et la source de chaque pool. La même copie est
écrite dans le stockage du plugin (`ctx.storage`). Si ce stockage échoue, le
fichier suffit. Il est créé au premier usage et n'est jamais versionné.

## Sources de données

- **Zen, Groq, Gemini, DeepSeek** : en-têtes `x-ratelimit-*` quand ils sont relayés. Un HTTP 200 sans en-tête compte une requête. Un HTTP 429 bloque le pool jusqu'au `retry-after`, sinon 24 h.
- **OpenRouter** : `GET https://openrouter.ai/api/v1/key`. Hors chaîne tant que l'identifiant `:free` n'est pas fixé.
- **LiteLLM** : `GET /key/info` (spend).

## Limites

- Le changement de fournisseur (Zen vers LiteLLM) passe par `session.switchModel`. Dans LiteLLM, `model.resolve` réécrit seulement le modèle du même fournisseur.
- Le pré-vol est **non bloquant** : il affiche un avertissement, il n'empêche
  pas l'envoi. Les budgets LiteLLM restent le vrai arrêt.
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
