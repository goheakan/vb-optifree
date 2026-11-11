# Ajouter une clé fournisseur

Une clé ouvre un pool après OpenCode Zen. Zen n'a pas de clé : il vit dans OpenCode. Groq, DeepSeek et Gemini ont chacun la leur. Une clé par fournisseur. Un second compte pour contourner une limite n'est pas le fonctionnement prévu.

L'ordre par défaut, après Zen, est Groq, puis DeepSeek, puis Gemini. DeepSeek est payant. Tu peux changer cet ordre. La fin de cette page dit comment.

## Obtenir chaque clé

Un compte par fournisseur, une clé. Tu la copies au moment où la page l'affiche. Ensuite elle va seulement dans le fichier de la section suivante. Elle ne va pas dans le chat, ni dans un dépôt.

### Groq

1. Ouvre [console.groq.com](https://console.groq.com) et crée un compte, ou connecte-toi.
2. Ouvre [API Keys](https://console.groq.com/keys). Le guide officiel est [Quickstart](https://console.groq.com/docs/quickstart).
3. Crée une clé pour ce projet. Seuls le propriétaire du projet et un rôle développeur peuvent le faire.
4. Copie la clé tout de suite. Si la page ne la réaffiche plus, supprime-la et crée-en une autre.

La variable est `GROQ_API_KEY`.

### DeepSeek

Le site de discussion et la plateforme API sont deux comptes distincts. La clé se crée sur la plateforme.

1. Ouvre [platform.deepseek.com](https://platform.deepseek.com) et crée un compte, ou connecte-toi.
2. Ouvre [API keys](https://platform.deepseek.com/api_keys). La documentation l'indique dans [Your First API Call](https://api-docs.deepseek.com/).
3. Crée une clé et copie-la tout de suite.
4. L'API est facturée. Un solde à zéro répond HTTP 402. La recharge se fait sur [Top up](https://platform.deepseek.com/top_up). Les moyens indiqués par la FAQ sont PayPal, carte bancaire, Alipay et WeChat Pay ([FAQ](https://api-docs.deepseek.com/faq)). Les tarifs du jour sont sur [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/).

La variable est `DEEPSEEK_API_KEY`.

### Gemini

1. Ouvre [Google AI Studio](https://aistudio.google.com) avec le compte Google choisi et accepte les conditions si la page le demande.
2. Ouvre [API Keys](https://aistudio.google.com/apikey). Le détail est dans [Using Gemini API keys](https://aistudio.google.com/docs/api-key).
3. Un nouveau compte reçoit un projet et une clé après les conditions. Un compte qui a déjà des projets Google Cloud les importe d'abord : Dashboard, Projects, Import projects, puis retour sur API Keys.
4. Clique sur Create API key, puis copie la clé. Depuis le 28 mai 2026, une clé créée dans AI Studio est une clé d'autorisation, limitée à l'API Gemini.
5. Si le bouton est indisponible, le compte n'a pas le droit de créer une clé dans ce projet. La page officielle décrit les droits manquants. Un projet personnel, hors organisation, permet de continuer.

La variable est `GEMINI_API_KEY`.

### OpenRouter

Laisse `OPENROUTER_API_KEY` vide. Ce pool n'est pas dans la chaîne tant qu'un identifiant `:free` réel n'est pas écrit dans `config/litellm.config.yaml`.

## Où la clé doit aller

Elle va dans un seul fichier, sur ta machine :

```text
~/.config/litellm/.env
```

Ce fichier est en mode `600`. Il n'est pas versionné. La clé ne va nulle part ailleurs :

- pas dans le dépôt, ni dans un fichier d'exemple ;
- pas dans `opencode.json` (ce fichier peut déjà contenir la clé locale de LiteLLM, pas celles des fournisseurs) ;
- pas dans le chat, un journal, une issue ou un message à une IA.

`install.sh` crée le fichier et la clé locale `LITELLM_MASTER_KEY`. Tu n'as pas à la recopier. Tu ajoutes seulement les clés des fournisseurs.

## Écrire le fichier

Ouvre le fichier avec ton éditeur. Les lignes existent déjà, vides. Colle la clé après le signe `=`, sans espace, sans guillemets. Une ligne, une variable.

```text
GROQ_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
```

Tu peux n'en remplir qu'une. Le pool sans clé ne pourra pas répondre. Les autres restent utilisables.

Vérifie le mode du fichier, puis relance la passerelle. Ces commandes ne demandent pas `sudo`.

```bash
chmod 600 ~/.config/litellm/.env
systemctl --user restart litellm
```

Depuis le dépôt :

```bash
./doctor.sh
```

`doctor.sh` avertit si aucune clé fournisseur n'est renseignée. Il ne l'affiche pas. Un avertissement sur le mode `600` ou sur la clé locale `LITELLM_MASTER_KEY` se corrige avant d'envoyer un prompt.

## Voir que la clé est prise

Dans OpenCode :

```text
/quota
/quote order
```

`/quota` montre les pools. Une clé absente n'y apparaît pas comme un secret : le pool reste simplement inutilisable tant que le fournisseur n'a pas répondu. Le premier envoi qui passe par ce pool confirme la clé. Si la passerelle répond que la clé est refusée, corrige la ligne dans `.env` et relance `systemctl --user restart litellm`. Ne colle pas le message s'il contient la clé.

## Changer l'ordre

`/quote order` sans argument affiche l'ordre enregistré. `/quota order` fait la même chose.

Pour en enregistrer un autre, nomme les pools, une fois chacun. Les noms connus sont `zen`, `groq`, `deepseek` et `gemini`.

```text
/quote order zen groq gemini deepseek
/quote order groq deepseek gemini
```

La première ligne remet Gemini avant DeepSeek. La seconde retire Zen : un envoi qui visait Zen suit alors Groq.

Le choix du plugin, avant l'envoi, suit le nouvel ordre tout de suite. Le repli de LiteLLM, celui qui rattrape un HTTP 503 pendant la requête, suit `~/.config/litellm/config.yaml`. La commande réécrit seulement l'alias `default` et les replis de ce fichier. Elle ne touche pas aux clés. Ce repli prend effet après :

```bash
systemctl --user restart litellm
```

Si la config n'est pas installée, l'ordre du plugin est quand même enregistré. Le message dans OpenCode le dit.

Un pool déjà passé n'est pas rejoué. Gemini, dernier de l'ordre par défaut, n'a pas de repli.
