#!/bin/bash
set -u
LOG_PREFIX="[PA-MONITOR $(date '+%Y-%m-%d %H:%M:%S')]"
EVOLUTION_URL="https://whatsapp-evolution-api.oxuzyt.easypanel.host"
EVOLUTION_KEY="7d39b8fa-7176-4ac8-90a3-effefe0d7103"
ALERT_INSTANCE="ZapPrincipal"
SUPERVISOR_NUMBER="244941713216"
ALERT_COOLDOWN_FILE="/tmp/pa-monitor-last-alert"
ALERT_COOLDOWN_SECONDS=900
FAILURES=()
CHECKS_OK=0
CHECKS_TOTAL=0

check_service() {
    local name="$1"; local url="$2"; local expected="$3"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    local response
    response=$(curl -s --max-time 10 "$url" 2>/dev/null) || response="TIMEOUT"
    if echo "$response" | grep -qi "$expected"; then
        echo "$LOG_PREFIX OK: $name"
        CHECKS_OK=$((CHECKS_OK + 1))
    else
        echo "$LOG_PREFIX FALHA: $name — $(echo "$response" | head -c 100)"
        FAILURES+=("$name")
    fi
}

check_docker_service() {
    local name="$1"; local service="$2"
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
    local replicas
    replicas=$(docker service ls --filter "name=$service" --format "{{.Replicas}}" 2>/dev/null) || replicas="ERROR"
    if [[ "$replicas" == "1/1" ]]; then
        echo "$LOG_PREFIX OK: $name ($replicas)"
        CHECKS_OK=$((CHECKS_OK + 1))
    else
        echo "$LOG_PREFIX FALHA: $name Docker ($replicas)"
        FAILURES+=("$name-docker")
    fi
}

send_whatsapp_alert() {
    local message="$1"
    if [[ -f "$ALERT_COOLDOWN_FILE" ]]; then
        local last_alert=$(cat "$ALERT_COOLDOWN_FILE")
        local now=$(date +%s)
        local diff=$((now - last_alert))
        if [[ $diff -lt $ALERT_COOLDOWN_SECONDS ]]; then
            echo "$LOG_PREFIX Alerta suprimido (cooldown ${diff}s/${ALERT_COOLDOWN_SECONDS}s)"
            return
        fi
    fi
    local payload
    payload=$(printf '{"number":"%s","text":"%s"}' "$SUPERVISOR_NUMBER" "$message")
    local result
    result=$(curl -s --max-time 15 -X POST \
        -H "Content-Type: application/json" \
        -H "apikey: $EVOLUTION_KEY" \
        -d "$payload" \
        "$EVOLUTION_URL/message/sendText/$ALERT_INSTANCE" 2>/dev/null) || result="SEND_FAILED"
    if echo "$result" | grep -qi "key"; then
        echo "$LOG_PREFIX Alerta WhatsApp enviado"
        date +%s > "$ALERT_COOLDOWN_FILE"
    else
        echo "$LOG_PREFIX Falha envio WhatsApp: $(echo "$result" | head -c 100)"
    fi
}

echo ""
echo "$LOG_PREFIX === INICIO MONITOR ==="

check_service "whatssiru-Zara" "http://localhost:8080/api/health" "ok"
check_docker_service "demo-moda-Bia" "jules_demo-moda"
check_docker_service "palanca-ai-Luna" "automacoes_palanca-ai"

CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
EVO_RESPONSE=$(curl -s --max-time 10 \
    -H "apikey: $EVOLUTION_KEY" \
    "$EVOLUTION_URL/instance/fetchInstances" 2>/dev/null) || EVO_RESPONSE="TIMEOUT"
EVO_CONNECTED=$(echo "$EVO_RESPONSE" | grep -o '"connectionStatus":"open"' | wc -l)
if [[ "$EVO_CONNECTED" -ge 2 ]]; then
    echo "$LOG_PREFIX OK: Evolution API ($EVO_CONNECTED instancias)"
    CHECKS_OK=$((CHECKS_OK + 1))
else
    echo "$LOG_PREFIX FALHA: Evolution API ($EVO_CONNECTED instancias)"
    FAILURES+=("evolution-api")
fi

DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [[ "$DISK_USAGE" -gt 90 ]]; then
    echo "$LOG_PREFIX ALERTA: Disco ${DISK_USAGE}%"
    FAILURES+=("disco-${DISK_USAGE}pct")
else
    echo "$LOG_PREFIX Disco: ${DISK_USAGE}%"
fi

RAM_USAGE=$(free | awk '/^Mem:/{printf "%.0f", $3/$2*100}')
if [[ "$RAM_USAGE" -gt 85 ]]; then
    echo "$LOG_PREFIX ALERTA: RAM ${RAM_USAGE}%"
    FAILURES+=("ram-${RAM_USAGE}pct")
else
    echo "$LOG_PREFIX RAM: ${RAM_USAGE}%"
fi

echo "$LOG_PREFIX === FIM: $CHECKS_OK/$CHECKS_TOTAL OK ==="

if [[ ${#FAILURES[@]} -gt 0 ]]; then
    FAIL_LIST=$(IFS=', '; echo "${FAILURES[*]}")
    echo "$LOG_PREFIX FALHAS: $FAIL_LIST"
    ALERT_MSG="PA MONITOR ALERTA | Problemas: $FAIL_LIST | Checks: $CHECKS_OK/$CHECKS_TOTAL | Disco: ${DISK_USAGE}% RAM: ${RAM_USAGE}% | $(date '+%H:%M %d/%m') | ssh root@46.224.99.52"
    send_whatsapp_alert "$ALERT_MSG"
else
    echo "$LOG_PREFIX Tudo operacional"
fi