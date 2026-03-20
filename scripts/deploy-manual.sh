#!/usr/bin/env bash
set -euo pipefail

SERVICE="${1:-}"
if [ "$SERVICE" != "whatssiru" ] && [ "$SERVICE" != "demo-moda" ]; then
  echo "Uso: $0 whatssiru|demo-moda" >&2
  exit 1
fi

: "${HOST:?Defina HOST (ex: 46.224.99.52)}"
: "${USERNAME:?Defina USERNAME (ex: root)}"
: "${SSH_KEY:?Defina SSH_KEY como conteudo da chave privada (BEGIN/END) ou path para ficheiro}"

tmpkey="$(mktemp -t deploy-manual-sshkey-XXXXXX)"
cleanup() { rm -f "$tmpkey"; }
trap cleanup EXIT

# SSH_KEY pode ser conteudo (BEGIN ...) ou caminho para ficheiro.
if [[ "$SSH_KEY" == *"BEGIN"* ]]; then
  printf "%s\n" "$SSH_KEY" > "$tmpkey"
else
  if [ -f "$SSH_KEY" ]; then
    cp "$SSH_KEY" "$tmpkey"
  else
    echo "SSH_KEY nao parece ser conteudo nem caminho valido: $SSH_KEY" >&2
    exit 1
  fi
fi
chmod 600 "$tmpkey"

REPO_SSH="git@github.com:dariomilagre8-bot/whatsapp-bo.git"
BASE="/etc/easypanel/projects/jules"

SSH_COMMON_OPTS=(-i "$tmpkey" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null)

ssh "${SSH_COMMON_OPTS[@]}" "${USERNAME}@${HOST}" bash -s -- "$SERVICE" <<'REMOTE'
set -euo pipefail
SERVICE="$1"

BASE="/etc/easypanel/projects/jules"
REPO_SSH="git@github.com:dariomilagre8-bot/whatsapp-bo.git"

DOCKERFILE_PATH="$(find "$BASE" -name Dockerfile 2>/dev/null | head -n 1 || true)"
PACKAGE_JSON_PATH="$(find "$BASE" -name package.json 2>/dev/null | head -n 1 || true)"

if [ -n "$DOCKERFILE_PATH" ]; then
  SOURCE_DIR="$(dirname "$DOCKERFILE_PATH")"
elif [ -n "$PACKAGE_JSON_PATH" ]; then
  SOURCE_DIR="$(dirname "$PACKAGE_JSON_PATH")"
else
  SOURCE_DIR="$BASE/whatsapp-bo"
fi

if [ -d "$SOURCE_DIR/.git" ]; then
  cd "$SOURCE_DIR"
  git pull
else
  # Se a pasta existir mas tiver ficheiros que nao sejam um repo Git, abortamos.
  if [ -e "$SOURCE_DIR" ] && [ -n "$(ls -A "$SOURCE_DIR" 2>/dev/null || true)" ]; then
    echo "Diretorio $SOURCE_DIR existe e nao parece ser um repo Git. Ajuste BASE ou remova o diretorio." >&2
    exit 1
  fi
  mkdir -p "$SOURCE_DIR"
  cd "$SOURCE_DIR"
  git clone "$REPO_SSH" .
fi

health_url_whatssiru="https://jules-whatssiru.oxuzyt.easypanel.host/health"
health_url_demo_moda="https://jules-demo-moda.oxuzyt.easypanel.host/health"

wait_health() {
  local url="$1"
  local retries="${2:-10}"
  local sleep_s="${3:-2}"

  for ((i=1; i<=retries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "OK health: $url"
      return 0
    fi
    sleep "$sleep_s"
  done

  echo "Falha no health: $url" >&2
  return 1
}

if [ "$SERVICE" = "whatssiru" ]; then
  docker build -t easypanel/jules/whatssiru:latest .

  # Evita problemas com host-mode ports: reescala para 0 e volta a 1.
  docker service scale jules_whatssiru=0
  sleep 10
  docker service scale jules_whatssiru=1
elif [ "$SERVICE" = "demo-moda" ]; then
  docker build -t easypanel/jules/demo-moda:latest .
  docker service update --image easypanel/jules/demo-moda:latest jules_demo-moda
fi

sleep 10
wait_health "$health_url_whatssiru"
wait_health "$health_url_demo_moda"
REMOTE

