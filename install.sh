#!/usr/bin/env bash
# vb-optifree installer — idempotent, sans sudo.
# Il installe LiteLLM, les configurations, le plugin opencode-quota et les
# services systemd *utilisateur*. Les paquets système sont seulement affichés.
set -euo pipefail

VERSION="0.1.0"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/vb-optifree"
LITELLM_DIR="$CONFIG_DIR/litellm"
OPENCODE_DIR="$CONFIG_DIR/opencode"
PLUGIN_DIR="$OPENCODE_DIR/opencode-quota"
SYSTEMD_DIR="$CONFIG_DIR/systemd/user"
LITELLM_BIN="$HOME/.local/bin/litellm"

DRY_RUN=0
NO_SYSTEMD=0
NO_PLUGIN=0
FORCE=0
ASSUME_YES=0
MASTER_KEY=""

if [ -t 1 ]; then
  C_INFO=$'\033[1;34m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'
  C_OK=$'\033[1;32m'; C_OFF=$'\033[0m'
else
  C_INFO=""; C_WARN=""; C_ERR=""; C_OK=""; C_OFF=""
fi

log()  { printf '%s[info]%s %s\n' "$C_INFO" "$C_OFF" "$*"; }
warn() { printf '%s[warn]%s %s\n' "$C_WARN" "$C_OFF" "$*"; }
err()  { printf '%s[error]%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; }
ok()   { printf '%s[ok]%s %s\n' "$C_OK" "$C_OFF" "$*"; }

usage() {
  cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --dry-run      Montre les actions sans les exécuter.
  --no-systemd   N'installe pas les services systemd utilisateur.
  --no-plugin    Installe uniquement LiteLLM et les configs.
  --force        Remplace les fichiers de config existants (backup auto).
  --yes          Répond oui aux confirmations.
  -h, --help     Affiche cette aide.

Le script ne lance jamais sudo. Les commandes pacman/AUR manquantes sont
affichées pour que l'utilisateur les exécute lui-même.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-systemd) NO_SYSTEMD=1 ;;
    --no-plugin) NO_PLUGIN=1 ;;
    --force) FORCE=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) err "Option inconnue : $1"; usage; exit 2 ;;
  esac
  shift
done

have() { command -v "$1" >/dev/null 2>&1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

confirm() {
  if [ "$ASSUME_YES" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
    return 0
  fi
  local answer
  read -r -p "$1 [y/N] " answer
  case "$answer" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

backup_if_exists() {
  local target="$1"
  if [ -e "$target" ]; then
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    run cp -a "$target" "$target.bak.$stamp"
    # Une sauvegarde peut contenir la clé déjà injectée.
    run chmod 600 "$target.bak.$stamp"
    warn "sauvegarde : $target.bak.$stamp"
  fi
}

copy_template() {
  local src="$1" dst="$2" mode="${3:-644}"
  if [ ! -e "$src" ]; then
    err "modèle introuvable : $src"
    return 1
  fi
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    warn "conserve l'existant : $dst (utilise --force pour remplacer)"
    return 0
  fi
  backup_if_exists "$dst"
  run mkdir -p "$(dirname "$dst")"
  run cp "$src" "$dst"
  run chmod "$mode" "$dst"
  ok "écrit : $dst"
}

print_system_hint() {
  local pkg="$1" hint="$2"
  warn "paquet manquant : $pkg — $hint"
}

read_master_key() {
  grep -E '^LITELLM_MASTER_KEY=' "$LITELLM_DIR/.env" 2>/dev/null \
    | head -n1 | cut -d= -f2- || true
}

write_master_key() {
  # La clé passe par l'environnement du processus awk, pas par ses arguments.
  local key="$1" tmp old_umask
  case "$key" in
    *$'\n'*|*$'\r'*)
      err "clé maître invalide"
      return 1
      ;;
  esac
  old_umask="$(umask)"
  umask 077
  tmp="$(mktemp "$LITELLM_DIR/.env.XXXXXX")"
  if ! LITELLM_MASTER_KEY="$key" awk '
    BEGIN { key = ENVIRON["LITELLM_MASTER_KEY"]; replaced = 0 }
    /^LITELLM_MASTER_KEY=/ { print "LITELLM_MASTER_KEY=" key; replaced = 1; next }
    { print }
    END { if (replaced == 0) print "LITELLM_MASTER_KEY=" key }
  ' "$LITELLM_DIR/.env" > "$tmp"; then
    rm -f "$tmp"
    umask "$old_umask"
    return 1
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$LITELLM_DIR/.env"
  umask "$old_umask"
}

ensure_master_key() {
  local key
  key="$(read_master_key)"
  case "$key" in
    ""|*change-me)
      if have openssl; then
        key="sk-$(openssl rand -hex 24)"
      else
        key="sk-$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
      fi
      if [ "$DRY_RUN" -eq 1 ]; then
        printf '[dry-run] générer une clé LITELLM_MASTER_KEY\n'
      else
        write_master_key "$key"
        ok "clé LiteLLM générée dans $LITELLM_DIR/.env"
      fi
      ;;
  esac
  MASTER_KEY="$key"
}

detect_gpu() {
  local vendor=""
  if have lspci; then
    if lspci 2>/dev/null | grep -Eiq 'vga|3d|display' && \
       lspci 2>/dev/null | grep -Eiq 'nvidia'; then
      vendor="nvidia"
    elif lspci 2>/dev/null | grep -Eiq 'vga|3d|display' && \
         lspci 2>/dev/null | grep -Eiq 'amd|ati|radeon'; then
      vendor="amd"
    fi
  fi
  if [ -z "$vendor" ] && [ -d /sys/class/drm ]; then
    local card vendor_id
    for card in /sys/class/drm/card*/device/vendor; do
      [ -r "$card" ] || continue
      vendor_id="$(cat "$card")"
      case "$vendor_id" in
        0x10de) vendor="nvidia"; break ;;
        0x1002) vendor="amd"; break ;;
      esac
    done
  fi
  printf '%s' "${vendor:-cpu}"
}

check_prerequisites() {
  log "Vérification des prérequis"
  local missing_required=0

  if ! have opencode; then
    err "opencode est requis."
    print_system_hint "opencode" "voir https://opencode.ai/docs ou le paquet AUR opencode"
    missing_required=1
  fi
  if ! have uv; then
    err "uv est requis pour installer LiteLLM sans sudo."
    print_system_hint "uv" "sudo pacman -S uv  (https://docs.astral.sh/uv/ — ne pas piper un installeur sans l'avoir lu)"
    missing_required=1
  fi
  if ! have node; then
    err "node (>= 22.19) est requis pour le plugin."
    print_system_hint "nodejs" "sudo pacman -S nodejs npm"
    missing_required=1
  else
    local node_major node_minor
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    node_minor="$(node -p 'process.versions.node.split(".")[1]')"
    if [ "$node_major" -lt 22 ] || { [ "$node_major" -eq 22 ] && [ "$node_minor" -lt 19 ]; }; then
      warn "node $(node -v) < 22.19 : certaines dépendances @effect peuvent échouer."
    fi
  fi
  if ! have npm; then
    err "npm est requis pour le plugin."
    print_system_hint "npm" "sudo pacman -S npm"
    missing_required=1
  fi

  have git   || print_system_hint "git"   "sudo pacman -S git"
  have jq    || print_system_hint "jq"    "sudo pacman -S jq"
  have curl  || print_system_hint "curl"  "sudo pacman -S curl"
  if ! have ollama; then
    log "ollama est absent : il n'est pas requis pour le chemin courant"
  fi

  if [ "$missing_required" -eq 1 ]; then
    err "Installe les prérequis ci-dessus puis relance ./install.sh"
    exit 1
  fi
}

install_litellm() {
  log "Installation de LiteLLM"
  if have litellm || [ -x "$LITELLM_BIN" ]; then
    ok "LiteLLM déjà présent : $(command -v litellm 2>/dev/null || printf '%s' "$LITELLM_BIN")"
    return 0
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] uv tool install %s\n' "'litellm[proxy]'"
    return 0
  fi
  uv tool install 'litellm[proxy]'
  ok "LiteLLM installé dans ~/.local/bin"
}

install_configs() {
  log "Installation des configurations"
  run mkdir -p "$LITELLM_DIR" "$OPENCODE_DIR" "$STATE_DIR" "$SYSTEMD_DIR"

  copy_template "$REPO_DIR/config/litellm.config.yaml" "$LITELLM_DIR/config.yaml" 644
  copy_template "$REPO_DIR/config/.env.example" "$LITELLM_DIR/.env" 600
  # Le contrôle est à nous : on le remplace à chaque installation.
  run cp "$REPO_DIR/scripts/check-litellm-env.sh" "$LITELLM_DIR/check-env.sh"
  run chmod 700 "$LITELLM_DIR/check-env.sh"

  if [ -f "$LITELLM_DIR/.env" ]; then
    run chmod 600 "$LITELLM_DIR/.env"
    if grep -Eq '^(GROQ|GEMINI|OPENROUTER|DEEPSEEK)_API_KEY=.+' "$LITELLM_DIR/.env" 2>/dev/null; then
      ok "au moins une clé API est renseignée dans $LITELLM_DIR/.env"
    else
      warn "aucune clé API renseignée : édite $LITELLM_DIR/.env avant la première requête cloud"
    fi
    ensure_master_key
  fi
}

merge_opencode_config() {
  log "Configuration d'OpenCode"
  local cfg="$OPENCODE_DIR/opencode.json"
  local jsonc="$OPENCODE_DIR/opencode.jsonc"

  if [ -f "$jsonc" ] && [ ! -f "$cfg" ]; then
    warn "opencode.jsonc détecté : fusion automatique non prise en charge."
    warn "Ajoute manuellement le provider 'litellm' (voir config/opencode.json) et le plugin :"
    printf '  %s\n' "$PLUGIN_DIR"
    return 0
  fi

  if [ ! -f "$cfg" ]; then
    run cp "$REPO_DIR/config/opencode.json" "$cfg"
    ok "créé : $cfg"
  elif [ "$FORCE" -eq 1 ]; then
    backup_if_exists "$cfg"
    run cp "$REPO_DIR/config/opencode.json" "$cfg"
    ok "remplacé : $cfg"
  else
    backup_if_exists "$cfg"
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] fusionner provider litellm + plugin + clé dans %s\n' "$cfg"
    printf '[dry-run] chmod 600 %s\n' "$cfg"
    return 0
  fi

  if ! have jq; then
    warn "jq absent : fusion automatique impossible."
    warn "Ajoute manuellement le provider 'litellm' et le plugin : $PLUGIN_DIR"
    return 0
  fi

  # OpenCode ne lit pas ~/.config/litellm/.env : on injecte donc la clé
  # générée dans opencode.json, et on protège le fichier (secret local).
  local tmp
  tmp="$(mktemp)"
  # VB_LITELLM_KEY est dans l'environnement de jq, pas dans sa ligne de commande.
  if VB_LITELLM_KEY="$MASTER_KEY" jq --slurpfile tpl "$REPO_DIR/config/opencode.json" \
        --arg plugin "$PLUGIN_DIR" '
        .provider = (.provider // {}) |
        .provider.litellm = $tpl[0].provider.litellm |
        (if (.model == null or .model == "") then .model = $tpl[0].model else . end) |
        (if (.small_model == null or .small_model == "") then .small_model = $tpl[0].small_model else . end) |
        (if env.VB_LITELLM_KEY != "" then .provider.litellm.options.apiKey = env.VB_LITELLM_KEY else . end) |
        .plugins = (((.plugins // []) | map(select(. != "./opencode-quota" and . != $plugin))) + [$plugin] | unique)
      ' "$cfg" > "$tmp"; then
    mv "$tmp" "$cfg"
    chmod 600 "$cfg"
    ok "fusionné : $cfg"
  else
    rm -f "$tmp"
    err "échec de la fusion jq ; fichier original conservé."
    return 1
  fi
}

install_plugin() {
  if [ "$NO_PLUGIN" -eq 1 ]; then
    log "Plugin ignoré (--no-plugin)"
    return 0
  fi
  log "Installation du plugin opencode-quota"
  run mkdir -p "$PLUGIN_DIR"
  run cp -R "$REPO_DIR/opencode-quota/src" "$PLUGIN_DIR/"
  run cp "$REPO_DIR/opencode-quota/package.json" "$PLUGIN_DIR/package.json"
  run cp "$REPO_DIR/opencode-quota/package-lock.json" "$PLUGIN_DIR/package-lock.json"
  run cp "$REPO_DIR/opencode-quota/README.md" "$PLUGIN_DIR/README.md" 2>/dev/null || true

  if [ "$DRY_RUN" -eq 0 ]; then
    if confirm "Installer les dépendances npm du plugin dans $PLUGIN_DIR ?"; then
      ( cd "$PLUGIN_DIR" && npm ci --omit=dev --no-audit --no-fund )
      ok "dépendances du plugin installées"
      if ( cd "$PLUGIN_DIR" && npm audit --omit=dev --audit-level=critical ); then
        ok "npm audit : aucune vulnérabilité critique"
      else
        warn "npm audit signale au moins une vulnérabilité critique"
      fi
    else
      warn "dépendances non installées : le plugin peut ne pas se charger."
    fi
  fi
}

install_services() {
  if [ "$NO_SYSTEMD" -eq 1 ]; then
    log "Services systemd ignorés (--no-systemd)"
    return 0
  fi
  log "Installation des services systemd utilisateur"
  run mkdir -p "$SYSTEMD_DIR"
  run cp "$REPO_DIR/systemd/litellm.service" "$SYSTEMD_DIR/litellm.service"
  ok "écrit : $SYSTEMD_DIR/litellm.service"
  log "ollama.service n'est pas installé : Ollama est hors du chemin courant"

  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] systemctl --user daemon-reload\n'
    printf '[dry-run] systemctl --user enable --now litellm.service\n'
    return 0
  fi

  if ! systemctl --user show-environment >/dev/null 2>&1; then
    warn "systemd utilisateur indisponible : lance LiteLLM manuellement."
    return 0
  fi

  systemctl --user daemon-reload
  if systemctl --user enable --now litellm.service; then
    ok "litellm.service activé"
  else
    warn "échec de l'activation de litellm.service ; voir : journalctl --user -u litellm"
  fi
}

run_doctor() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "Diagnostic ignoré (--dry-run)"
    return 0
  fi
  if [ -x "$REPO_DIR/doctor.sh" ]; then
    log "Diagnostic"
    "$REPO_DIR/doctor.sh" || true
  fi
}

main() {
  printf 'vb-optifree %s — installation\n' "$VERSION"
  printf 'dépôt : %s\n' "$REPO_DIR"
  printf 'GPU détecté (non requis) : %s\n' "$(detect_gpu)"

  check_prerequisites
  install_litellm
  install_configs
  merge_opencode_config
  install_plugin
  install_services
  run_doctor

  printf '\n'
  ok "installation terminée"
  cat <<EOF

Prochaines étapes :
  1. Sans modèle déjà choisi, le défaut est un modèle gratuit OpenCode Zen. Il ne demande pas de clé.
     Un modèle déjà écrit dans opencode.json est conservé.
  2. Pour allonger le quota, ajoute une clé par fournisseur.
     Le pas à pas est dans docs/ajouter-une-cle.md.
     Le fichier est ~/.config/litellm/.env, en mode 600 :
       GROQ_API_KEY=
       DEEPSEEK_API_KEY=
       GEMINI_API_KEY=
     Laisse OPENROUTER_API_KEY vide tant qu'un identifiant :free réel n'est pas écrit dans la config.
  3. Redémarre la passerelle :
       systemctl --user restart litellm
  4. Vérifie :
       ./doctor.sh
  5. Lance OpenCode :
       opencode
  6. Dans OpenCode :
       /quota
       /quote order
     Le plugin choisit le pool encore ouvert avant l'envoi.
     L'ordre par défaut après Zen est Groq, DeepSeek, puis Gemini.
  Ollama et le GPU restent hors de ce chemin.

Documentation : README.md, docs/ajouter-une-cle.md et docs/plan.md
EOF
}

main "$@"
