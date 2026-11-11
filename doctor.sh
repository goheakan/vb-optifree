#!/usr/bin/env bash
# vb-optifree doctor — diagnostic local, sans sudo, sans modification.
set -uo pipefail

OK=0
WARN=0
FAIL=0

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'
  C_INFO=$'\033[1;34m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_INFO=""; C_OFF=""
fi

pass() { printf '%s[ok]%s %s\n'   "$C_OK"   "$C_OFF" "$*"; OK=$((OK + 1)); }
warn() { printf '%s[warn]%s %s\n' "$C_WARN" "$C_OFF" "$*"; WARN=$((WARN + 1)); }
fail() { printf '%s[fail]%s %s\n' "$C_ERR"  "$C_OFF" "$*"; FAIL=$((FAIL + 1)); }
info() { printf '%s[info]%s %s\n' "$C_INFO" "$C_OFF" "$*"; }

have() { command -v "$1" >/dev/null 2>&1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
LITELLM_DIR="$CONFIG_DIR/litellm"
OPENCODE_DIR="$CONFIG_DIR/opencode"
PLUGIN_DIR="$OPENCODE_DIR/opencode-quota"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/vb-optifree"
LITELLM_URL="${LITELLM_URL:-http://127.0.0.1:4000}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"

check_command() {
  local cmd="$1" label="${2:-$1}"
  if have "$cmd"; then
    pass "$label présent ($(command -v "$cmd"))"
  else
    warn "$label absent"
  fi
}

http_check() {
  local url="$1" label="$2" auth="${3:-}"
  if ! have curl; then
    warn "curl absent : impossible de tester $label"
    return 0
  fi
  local args=(-fsS --max-time 3 -o /dev/null)
  local hdr="" old_umask=""
  if [ -n "$auth" ]; then
    # Le secret est dans un fichier 600, pas dans la ligne de commande de curl.
    old_umask="$(umask)"
    umask 077
    hdr="$(mktemp)"
    umask "$old_umask"
    chmod 600 "$hdr"
    printf 'Authorization: Bearer %s\n' "$auth" > "$hdr"
    args+=(-H "@${hdr}")
  fi
  local rc=0
  curl "${args[@]}" "$url" >/dev/null 2>&1 || rc=$?
  if [ -n "$hdr" ]; then
    rm -f "$hdr"
  fi
  if [ "$rc" -eq 0 ]; then
    pass "$label répond ($url)"
  else
    warn "$label ne répond pas ($url)"
  fi
}

loopback_listener() {
  local port="$1" label="$2"
  if ! have ss; then
    warn "ss absent : écoute de $label non vérifiée"
    return 0
  fi
  local lines
  lines="$(ss -H -ltn "sport = :${port}" 2>/dev/null || true)"
  if [ -z "$lines" ]; then
    warn "$label n'écoute pas sur le port ${port}"
    return 0
  fi
  local bad=0 line addr
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    addr="$(printf '%s\n' "$line" | awk '{print $4}')"
    if [ "$addr" = "127.0.0.1:${port}" ] || [ "$addr" = "[::1]:${port}" ]; then
      continue
    fi
    fail "$label écoute sur ${addr} (attendu : 127.0.0.1 ou ::1)"
    bad=1
  done <<< "$lines"
  if [ "$bad" -eq 0 ]; then
    pass "$label n'écoute que sur la boucle locale"
  fi
}

info "vb-optifree doctor"
info "config : $CONFIG_DIR"
info "état   : $STATE_DIR"

info "Outils"
check_command opencode
check_command uv
check_command node
check_command npm
check_command jq
check_command curl
check_command ollama

info "Installation"
if [ -x "$HOME/.local/bin/litellm" ] || have litellm; then
  pass "binaire litellm présent"
else
  fail "binaire litellm absent (lance ./install.sh)"
fi

if [ -f "$LITELLM_DIR/config.yaml" ]; then
  pass "config LiteLLM : $LITELLM_DIR/config.yaml"
else
  fail "config LiteLLM absente : $LITELLM_DIR/config.yaml"
fi

if [ -f "$LITELLM_DIR/.env" ]; then
  pass "fichier .env présent"
  check_script="$SCRIPT_DIR/scripts/check-litellm-env.sh"
  check_out=""
  if [ -x "$check_script" ]; then
    if check_out="$(LITELLM_ENV_FILE="$LITELLM_DIR/.env" "$check_script" 2>&1)"; then
      pass "secrets LiteLLM : mode 600 et clé maître utilisable"
    else
      fail "secrets LiteLLM : ${check_out}"
    fi
  else
    fail "contrôle des secrets introuvable : $check_script"
  fi
  if grep -Eq '^(GROQ|GEMINI|OPENROUTER|DEEPSEEK)_API_KEY=.+' "$LITELLM_DIR/.env" 2>/dev/null; then
    pass "au moins une clé API renseignée"
  else
    warn "aucune clé API renseignée dans .env"
  fi
else
  fail ".env absent (lance ./install.sh)"
fi

if [ -d "$PLUGIN_DIR" ]; then
  pass "plugin installé : $PLUGIN_DIR"
  if [ -d "$PLUGIN_DIR/node_modules" ] || [ -f "$PLUGIN_DIR/package.json" ]; then
    pass "package.json du plugin présent"
  else
    warn "package.json du plugin absent"
  fi
else
  warn "plugin non installé (option --no-plugin ?)"
fi

if [ -f "$OPENCODE_DIR/opencode.json" ] && have jq; then
  if jq -e '.provider.litellm' "$OPENCODE_DIR/opencode.json" >/dev/null 2>&1; then
    pass "provider litellm configuré dans opencode.json"
  else
    warn "provider litellm absent de opencode.json"
  fi
  api_key="$(jq -r '.provider.litellm.options.apiKey // empty' "$OPENCODE_DIR/opencode.json" 2>/dev/null || true)"
  cfg_mode="$(stat -c '%a' "$OPENCODE_DIR/opencode.json" 2>/dev/null || printf '?')"
  case "$api_key" in
    ""|"{env:LITELLM_MASTER_KEY}")
      pass "opencode.json ne contient pas la clé en clair"
      ;;
    *)
      api_key_lc="$(printf '%s' "$api_key" | tr '[:upper:]' '[:lower:]')"
      case "$api_key_lc" in
        *change-me*)
          fail "opencode.json contient encore un placeholder de clé"
          ;;
        *)
          if [ "$cfg_mode" = "600" ]; then
            pass "opencode.json contient une clé locale et est en mode 600"
          else
            fail "opencode.json contient une clé et n'est pas en mode 600 (mode ${cfg_mode})"
          fi
          ;;
      esac
      unset api_key_lc
      ;;
  esac
  unset api_key
  if jq -e '.plugins | index("'"$PLUGIN_DIR"'")' "$OPENCODE_DIR/opencode.json" >/dev/null 2>&1; then
    pass "plugin référencé dans opencode.json"
  else
    warn "plugin non référencé dans opencode.json"
  fi
elif [ -f "$OPENCODE_DIR/opencode.jsonc" ]; then
  warn "opencode.jsonc détecté : vérification automatique ignorée"
else
  warn "opencode.json absent"
fi

info "Services"
if have systemctl && systemctl --user show-environment >/dev/null 2>&1; then
  if systemctl --user is-active --quiet litellm.service; then
    pass "litellm.service actif"
  else
    warn "litellm.service inactif"
  fi
  if systemctl --user is-active --quiet ollama.service; then
    pass "ollama.service (user) actif"
  elif systemctl is-active --quiet ollama.service 2>/dev/null; then
    pass "ollama.service (système) actif"
  else
    warn "aucun service ollama actif"
  fi
else
  warn "systemd utilisateur indisponible"
fi

info "Écoute réseau"
loopback_listener 4000 "LiteLLM"
loopback_listener 11434 "Ollama"

info "Endpoints"
http_check "$OLLAMA_URL/api/tags" "Ollama"
MASTER_KEY=""
if [ -f "$LITELLM_DIR/.env" ]; then
  MASTER_KEY="$(grep -E '^LITELLM_MASTER_KEY=' "$LITELLM_DIR/.env" | head -n1 | cut -d= -f2- || true)"
fi
http_check "$LITELLM_URL/health" "LiteLLM /health"
if [ -n "$MASTER_KEY" ]; then
  http_check "$LITELLM_URL/v1/models" "LiteLLM /v1/models" "$MASTER_KEY"
else
  warn "LITELLM_MASTER_KEY vide : test /v1/models ignoré"
fi

info "Espace disque"
if [ -d "$STATE_DIR" ]; then
  pass "répertoire d'état : $STATE_DIR"
else
  warn "répertoire d'état absent (créé au premier /quota)"
fi

printf '\n'
info "Résultat : $OK ok, $WARN avertissement(s), $FAIL échec(s)"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
