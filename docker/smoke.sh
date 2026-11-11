#!/usr/bin/env bash
# Banc d'essai Docker. Ne modifie pas la machine : pas de ~/.config, pas de
# systemd, pas de paquet, pas d'Ollama. Efface les clés générées et les
# volumes en sortant.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$REPO_DIR/docker/run"
ENV_FILE="$RUN_DIR/.env"
OPENCODE_ENV="$RUN_DIR/opencode.env"
COMPOSE=(docker compose -f "$REPO_DIR/docker/compose.yaml" --project-directory "$REPO_DIR/docker")
NODE_IMAGE="node@sha256:539d4d5b9c0df96bb9d1229264d358dc816e8592cb8867828a580b527e7ad0fa"
MARKER="vb-optifree-smoke-marker"

master=""
groq_key=""
gemini_key=""
deepseek_key=""
hdr=""
models=""
chat=""
oc_out=""

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_ERR=$'\033[1;31m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_ERR=""; C_OFF=""
fi

pass() { printf '%s[ok]%s %s\n' "$C_OK" "$C_OFF" "$*"; }
fail() {
  printf '%s[fail]%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2
  local logs
  logs="$("${COMPOSE[@]}" logs --tail 100 2>&1 || true)"
  if [ -n "$master" ]; then logs="$(printf '%s\n' "$logs" | grep -F -v -e "$master" || true)"; fi
  if [ -n "$groq_key" ]; then logs="$(printf '%s\n' "$logs" | grep -F -v -e "$groq_key" || true)"; fi
  if [ -n "$gemini_key" ]; then logs="$(printf '%s\n' "$logs" | grep -F -v -e "$gemini_key" || true)"; fi
  if [ -n "$deepseek_key" ]; then logs="$(printf '%s\n' "$logs" | grep -F -v -e "$deepseek_key" || true)"; fi
  printf '%s\n' "$logs" >&2
  if [ -n "$oc_out" ] && [ -f "$oc_out" ]; then
    printf '%s\n' "--- opencode ---" >&2
    sed -E 's/sk-[A-Za-z0-9]+/[key]/g' "$oc_out" | tail -n 40 >&2
  fi
  exit 1
}

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE" "$OPENCODE_ENV" "$hdr" "$models" "$chat" "$oc_out"
}
trap cleanup EXIT

hit_count() {
  local name="$1" n
  n="$("${COMPOSE[@]}" logs mock 2>&1 | grep -c "hit ${name}" || true)"
  printf '%s' "${n:-0}"
}

chat_content() {
  node -e '
    const fs = require("fs");
    const raw = fs.readFileSync(process.argv[1], "utf8");
    let data;
    try { data = JSON.parse(raw); }
    catch { process.exit(2); }
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== "string" || content.trim() === "") process.exit(1);
    process.stdout.write(content.trim().slice(0, 160));
  ' "$1"
}

post_chat() {
  local model="$1" outfile="$2" timeout_s="$3"
  curl -sS -o "$outfile" -w '%{http_code}' --max-time "$timeout_s" -H @"$hdr" \
    -d "{\"model\":\"${model}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reponds par le seul mot pong. Jeton : ${MARKER}\"}],\"max_tokens\":32}" \
    http://127.0.0.1:4000/v1/chat/completions || true
}

if ! command -v docker >/dev/null 2>&1; then
  fail "docker est absent"
fi
if ! docker info >/dev/null 2>&1; then
  fail "docker n'est pas utilisable par cet utilisateur"
fi
if ! command -v node >/dev/null 2>&1; then
  fail "node est absent sur la machine, il sert seulement à lire les réponses JSON"
fi

if ss -H -ltn 'sport = :4000' 2>/dev/null | grep -q .; then
  fail "le port 4000 est déjà pris sur la machine : le banc ne le réutilise pas"
fi

install -d -m 700 "$RUN_DIR"
umask 077
master="sk-$(openssl rand -hex 24)"
groq_key="sk-$(openssl rand -hex 24)"
gemini_key="sk-$(openssl rand -hex 24)"
deepseek_key="sk-$(openssl rand -hex 24)"
salt="sk-$(openssl rand -hex 24)"
cat > "$ENV_FILE" << EOF
LITELLM_MASTER_KEY=${master}
LITELLM_SALT_KEY=${salt}
GROQ_API_KEY=${groq_key}
GEMINI_API_KEY=${gemini_key}
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=${deepseek_key}
EOF
chmod 600 "$ENV_FILE"
unset salt

# Schéma v1 de opencode-ai 1.19.5 : provider (singulier) et npm @ai-sdk.
# Le schéma providers de la doc actuelle est ignoré par ce binaire.
# Le banc force litellm/default : il ne doit pas appeler OpenCode Zen.
config='{"share":"disabled","model":"litellm/default","small_model":"litellm/default","lsp":false,"snapshot":false,"permission":{"*":"deny"},"agent":{"bench":{"mode":"primary","model":"litellm/default","steps":8,"description":"banc"}},"provider":{"litellm":{"npm":"@ai-sdk/openai-compatible","name":"LiteLLM (local)","options":{"baseURL":"http://127.0.0.1:4000/v1","apiKey":"{env:LITELLM_MASTER_KEY}"},"models":{"default":{"name":"Defaut"},"groq-120b":{"name":"Groq"},"gemini-flash":{"name":"Gemini"},"deepseek-flash":{"name":"DeepSeek"}}}}}'
cat > "$OPENCODE_ENV" << EOF
LITELLM_MASTER_KEY=${master}
OPENCODE_DISABLE_PROJECT_CONFIG=1
OPENCODE_DISABLE_AUTOUPDATE=1
OPENCODE_DISABLE_MODELS_FETCH=1
HOME=/tmp/oc-home
OPENCODE_CONFIG_CONTENT=${config}
EOF
chmod 600 "$OPENCODE_ENV"
unset config

LITELLM_ENV_FILE="$ENV_FILE" "$REPO_DIR/scripts/check-litellm-env.sh" \
  || fail "le fichier de secrets du banc est refusé"
pass "clés du banc acceptées, elles restent hors du dépôt"

pass "tests du plugin dans un conteneur node"
docker run --rm \
  -v "$REPO_DIR/opencode-quota":/src:ro \
  "$NODE_IMAGE" \
  bash -c 'cp -a /src /tmp/q && cd /tmp/q && npm ci --no-audit --no-fund && npm test' \
  || fail "tests du plugin"

if "${COMPOSE[@]}" config --services | grep -qx ollama; then
  fail "le banc déclare encore un service ollama"
fi
pass "le banc ne déclare pas de service ollama"

pass "construction de l'image OpenCode 1.19.5"
COMPOSE_PROFILES=opencode "${COMPOSE[@]}" build opencode || fail "construction OpenCode"

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

ready=0
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T mock node -e 'fetch("http://127.0.0.1:8080/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || fail "le mock cloud du banc ne répond pas"
pass "le faux cloud écoute seulement dans le réseau du banc"

set_mode() {
  local mode="$1"
  "${COMPOSE[@]}" exec -T mock node -e '
    fetch("http://127.0.0.1:8080/mode", {method:"POST", body: process.argv[1]})
      .then((r) => process.exit(r.ok ? 0 : 1))
      .catch(() => process.exit(1));
  ' "$mode" || fail "impossible de basculer le faux cloud vers ${mode}"
}

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
grep -q 'groq-120b' "$models" || fail "groq-120b est absent de /v1/models"
grep -q 'gemini-flash' "$models" || fail "gemini-flash est absent de /v1/models"
grep -q 'deepseek-flash' "$models" || fail "deepseek-flash est absent de /v1/models"
grep -q 'default' "$models" || fail "l'alias default est absent de /v1/models"
if grep -q 'local-coder' "$models"; then
  fail "local-coder est encore annoncé"
fi
pass "avec la clé, la chaîne cloud est annoncée, sans modèle local"

chat="$(mktemp)"
set_mode "groq-ok"
g0="$(hit_count groq)"
e0="$(hit_count gemini)"
d0="$(hit_count deepseek)"
code="$(post_chat default "$chat" 60)"
content="$(chat_content "$chat" || true)"
[ "$code" = "200" ] || fail "default, Groq disponible, a répondu HTTP $code"
[ "$content" = "FROM-GROQ" ] || fail "default n'a pas choisi le premier hop"
[ "$(( $(hit_count groq) - g0 ))" -ge 1 ] || fail "default n'a pas appelé Groq"
[ "$(( $(hit_count gemini) - e0 ))" -eq 0 ] || fail "default a appelé Gemini alors que Groq répondait"
[ "$(( $(hit_count deepseek) - d0 ))" -eq 0 ] || fail "default a appelé DeepSeek alors que Groq répondait"
pass "default s'arrête sur Groq quand la clé de test est acceptée"

set_mode "groq-down-gemini-ok"
g0="$(hit_count groq)"
e0="$(hit_count gemini)"
d0="$(hit_count deepseek)"
code="$(post_chat default "$chat" 60)"
content="$(chat_content "$chat" || true)"
[ "$code" = "200" ] || fail "default, Groq en panne, a répondu HTTP $code"
[ "$content" = "FROM-DEEPSEEK" ] || fail "default n'est pas passé à DeepSeek (corps: ${content:-vide})"
[ "$(( $(hit_count groq) - g0 ))" -ge 1 ] || fail "la bascule n'a pas tenté Groq"
[ "$(( $(hit_count deepseek) - d0 ))" -ge 1 ] || fail "la bascule n'a pas tenté DeepSeek"
[ "$(( $(hit_count gemini) - e0 ))" -eq 0 ] || fail "la bascule a appelé Gemini avant DeepSeek"
pass "default passe de Groq à DeepSeek quand Groq refuse"

set_mode "all-cloud-down"
g0="$(hit_count groq)"
e0="$(hit_count gemini)"
d0="$(hit_count deepseek)"
code="$(post_chat default "$chat" 60)"
if [ "$code" = "200" ]; then
  fail "default a répondu HTTP 200 alors que les trois hops sont en panne"
fi
if grep -q 'FROM-' "$chat"; then
  fail "un hop en panne a quand même renvoyé un succès"
fi
[ "$(( $(hit_count groq) - g0 ))" -ge 1 ] || fail "le repli n'a pas tenté Groq"
[ "$(( $(hit_count gemini) - e0 ))" -ge 1 ] || fail "le repli n'a pas tenté Gemini"
[ "$(( $(hit_count deepseek) - d0 ))" -ge 1 ] || fail "le repli n'a pas tenté DeepSeek"
pass "sans Ollama, default échoue (HTTP ${code}) après Groq, DeepSeek et Gemini"

pass "OpenCode parle à LiteLLM sur 127.0.0.1:4000"
set_mode "groq-ok"
# LiteLLM garde un déploiement en pause au moins 5 s après un 503,
# même quand cooldown_time vaut 0. On attend la fin de cette pause.
sleep 8
g0="$(hit_count groq)"
e0="$(hit_count gemini)"
d0="$(hit_count deepseek)"
oc_out="$(mktemp)"
if ! COMPOSE_PROFILES=opencode timeout 180 "${COMPOSE[@]}" run --rm --no-deps opencode \
  run --pure --print-logs --log-level ERROR --format json --model litellm/default --agent bench --title bench \
  "Ignore le jeton ${MARKER}. Reponds uniquement par le mot pong." > "$oc_out" 2>&1; then
  fail "opencode run a échoué"
fi
if grep -q 'MAXIMUM STEPS REACHED' "$oc_out"; then
  fail "OpenCode a épuisé les étapes avant de répondre"
fi
oc_text="$(node -e '
const fs = require("fs");
const lines = fs.readFileSync(process.argv[1], "utf8").split(/\n/);
let found = "";
for (const line of lines) {
  if (!line.startsWith("{")) continue;
  let ev;
  try { ev = JSON.parse(line); } catch { continue; }
  const text = ev && ev.part && ev.part.text;
  if (ev.type === "text" && typeof text === "string" && text.trim()) found = text.trim();
}
if (!found) process.exit(1);
process.stdout.write(found.slice(0, 160));
' "$oc_out")" || fail "OpenCode n'a pas obtenu de réponse"
if ! printf '%s\n' "$oc_text" | grep -q 'FROM-GROQ'; then
  fail "OpenCode n'est pas passé par Groq (${oc_text})"
fi
[ "$(( $(hit_count gemini) - e0 ))" -eq 0 ] || fail "OpenCode a appelé Gemini alors que Groq répondait"
[ "$(( $(hit_count deepseek) - d0 ))" -eq 0 ] || fail "OpenCode a appelé DeepSeek alors que Groq répondait"
[ "$(( $(hit_count groq) - g0 ))" -ge 1 ] || fail "OpenCode n'a pas appelé Groq"
pass "OpenCode obtient FROM-GROQ via LiteLLM sur 127.0.0.1 (${oc_text})"

logs="$("${COMPOSE[@]}" logs 2>&1 || true)"
for secret in "$master" "$groq_key" "$gemini_key" "$deepseek_key"; do
  if printf '%s\n' "$logs" | grep -F -q -- "$secret"; then
    fail "un secret apparaît dans les journaux des conteneurs"
  fi
done
if printf '%s\n' "$logs" | grep -F -q -- "$MARKER"; then
  fail "le prompt de test apparaît dans les journaux des conteneurs"
fi
if grep -F -q -- "$master" "$oc_out" || grep -F -q -- "$groq_key" "$oc_out"; then
  fail "un secret apparaît dans la sortie OpenCode"
fi
pass "ni les clés ni le prompt de test ne sont dans les journaux"

rm -f "$hdr" "$models" "$chat" "$oc_out"
unset master groq_key gemini_key deepseek_key
pass "banc d'essai terminé"
