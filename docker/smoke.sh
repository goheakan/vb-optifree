#!/usr/bin/env bash
# Banc d'essai Docker. Ne modifie pas la machine : pas de ~/.config, pas de
# systemd, pas de paquet. Efface la clé générée et les volumes en sortant.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO_DIR/docker/run"
ENV_FILE="$RUN_DIR/.env"
COMPOSE=(docker compose -f "$REPO_DIR/docker/compose.yaml" --project-directory "$REPO_DIR/docker")
NODE_IMAGE="node@sha256:539d4d5b9c0df96bb9d1229264d358dc816e8592cb8867828a580b527e7ad0fa"
MARKER="vb-optifree-smoke-marker"

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_ERR=$'\033[1;31m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_ERR=""; C_OFF=""
fi

pass() { printf '%s[ok]%s %s\n' "$C_OK" "$C_OFF" "$*"; }
fail() {
  printf '%s[fail]%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2
  "${COMPOSE[@]}" logs --tail 80 >&2 || true
  exit 1
}

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  fail "docker est absent"
fi
if ! docker info >/dev/null 2>&1; then
  fail "docker n'est pas utilisable par cet utilisateur"
fi

if ss -H -ltn 'sport = :4000' 2>/dev/null | grep -q .; then
  fail "le port 4000 est déjà pris sur la machine : le banc ne le réutilise pas"
fi

install -d -m 700 "$RUN_DIR"
umask 077
master="sk-$(openssl rand -hex 24)"
salt="sk-$(openssl rand -hex 24)"
cat > "$ENV_FILE" << EOF
LITELLM_MASTER_KEY=${master}
LITELLM_SALT_KEY=${salt}
GROQ_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
EOF
chmod 600 "$ENV_FILE"
unset salt

LITELLM_ENV_FILE="$ENV_FILE" "$REPO_DIR/scripts/check-litellm-env.sh" \
  || fail "le fichier de secrets du banc est refusé"
pass "clé du banc acceptée par check-litellm-env.sh"

pass "tests du plugin dans un conteneur node"
docker run --rm \
  -v "$REPO_DIR/opencode-quota":/src:ro \
  "$NODE_IMAGE" \
  bash -c 'cp -a /src /tmp/q && cd /tmp/q && npm ci --no-audit --no-fund && npm test' \
  || fail "tests du plugin"

pass "démarrage du banc (images épinglées)"
"${COMPOSE[@]}" up -d --pull never || "${COMPOSE[@]}" up -d || fail "docker compose up"

ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:4000/health/liveliness >/dev/null 2>&1 \
    || curl -fsS --max-time 2 http://127.0.0.1:4000/health/liveness >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" -eq 1 ] || fail "LiteLLM ne répond pas sur 127.0.0.1:4000"
pass "LiteLLM répond sur 127.0.0.1:4000"

listeners="$(ss -H -ltn 'sport = :4000' 2>/dev/null || true)"
printf '%s\n' "$listeners" | grep -q '127.0.0.1:4000' || fail "4000 n'écoute pas sur 127.0.0.1"
if printf '%s\n' "$listeners" | grep -E -q '0\.0\.0\.0:4000|\*:4000|\[::\]:4000'; then
  fail "4000 est publié hors de la boucle locale"
fi
pass "le port 4000 de l'hôte reste sur 127.0.0.1"

if ss -H -ltn 'sport = :11434' 2>/dev/null | grep -E -q '0\.0\.0\.0:11434|\*:11434|\[::\]:11434'; then
  fail "11434 est apparu hors de la boucle locale"
fi
pass "l'Ollama de la machine n'est pas exposé hors de la boucle locale"

hdr="$(mktemp)"
chmod 600 "$hdr"
printf 'Authorization: Bearer %s\n' "$master" > "$hdr"
printf 'Content-Type: application/json\n' >> "$hdr"

code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  http://127.0.0.1:4000/v1/models || true)"
[ "$code" = "401" ] || [ "$code" = "403" ] || fail "sans clé, /v1/models a répondu $code"
pass "sans clé, /v1/models est refusé ($code)"

models="$(mktemp)"
code="$(curl -sS -o "$models" -w '%{http_code}' --max-time 20 -H @"$hdr" \
  http://127.0.0.1:4000/v1/models || true)"
[ "$code" = "200" ] || fail "avec la clé, /v1/models a répondu $code"
grep -q 'local-coder' "$models" || fail "local-coder est absent de /v1/models"
grep -q 'sensitive' "$models" || fail "l'alias sensitive est absent de /v1/models"
pass "avec la clé, les alias locaux sont annoncés"

chat="$(mktemp)"
code="$(curl -sS -o "$chat" -w '%{http_code}' --max-time 30 -H @"$hdr" \
  -d "{\"model\":\"sensitive\",\"messages\":[{\"role\":\"user\",\"content\":\"${MARKER}\"}]}" \
  http://127.0.0.1:4000/v1/chat/completions || true)"
if grep -E -q 'api\.groq\.com|generativelanguage\.googleapis|openrouter\.ai|api\.deepseek\.com' "$chat"; then
  fail "la requête sensitive a visé un fournisseur cloud"
fi
if ! grep -E -q 'ollama|11434|local-coder|qwen2.5-coder|model' "$chat"; then
  fail "la requête sensitive n'a pas visé Ollama (HTTP $code)"
fi
pass "sensitive vise Ollama et aucun cloud (HTTP $code, modèle absent : normal)"

if "${COMPOSE[@]}" logs 2>&1 | grep -F -q -- "$master"; then
  fail "la clé maître apparaît dans les journaux des conteneurs"
fi
if "${COMPOSE[@]}" logs 2>&1 | grep -F -q -- "$MARKER"; then
  fail "le prompt de test apparaît dans les journaux des conteneurs"
fi
pass "ni la clé ni le prompt de test ne sont dans les journaux"

rm -f "$hdr" "$models" "$chat"
unset master
pass "banc d'essai terminé"
