#!/usr/bin/env bash
# Refuse une clé maître absente, un placeholder, ou un fichier de secrets
# lisible par d'autres comptes. Ne jamais afficher la clé.
set -euo pipefail

envfile="${LITELLM_ENV_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/litellm/.env}"

if [ ! -f "$envfile" ]; then
  printf 'vb-optifree: fichier de secrets absent\n' >&2
  exit 1
fi

mode="$(stat -c '%a' "$envfile" 2>/dev/null || printf '?')"
if [ "$mode" != "600" ]; then
  printf 'vb-optifree: le fichier de secrets doit être en mode 600 (mode actuel %s)\n' "$mode" >&2
  exit 1
fi

key="$(grep -E '^LITELLM_MASTER_KEY=' "$envfile" | head -n1 | cut -d= -f2- || true)"
case "$key" in
  *$'\n'*|*$'\r'*)
    printf 'vb-optifree: clé maître absente ou encore un placeholder\n' >&2
    exit 1
    ;;
esac
key_lc="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
case "$key_lc" in
  ""|*change-me*)
    printf 'vb-optifree: clé maître absente ou encore un placeholder\n' >&2
    exit 1
    ;;
esac

if [ "${#key}" -lt 16 ]; then
  printf 'vb-optifree: clé maître trop courte\n' >&2
  exit 1
fi
