#!/bin/bash
# scripts/fix-webhook-evolution.sh — Corrige webhooks Evolution API → whatssiru (Streamzone Braulio + Zara-Teste)
# Redes Docker isoladas: liga Evolution à rede do whatssiru, descobre URL acessível, actualiza ambos os webhooks.
#
# Executar NO VPS (com SSH):
#   scp scripts/fix-webhook-evolution.sh don@46.224.99.52:/tmp && ssh don@46.224.99.52 'bash /tmp/fix-webhook-evolution.sh'
# Ou no servidor: bash /tmp/fix-webhook-evolution.sh

set -e

EVOLUTION_API_URL="${EVOLUTION_API_URL:-https://whatsapp-evolution-api.oxuzyt.easypanel.host}"
EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-429683C4C977415CAAFCCE10F7D57E11}"
# Ambas as instâncias: produção (Bráulio) + demo (Don)
INSTANCES=("Streamzone Braulio" "Zara-Teste")

echo "=== 1. Containers e redes ==="
# Nomes podem variar: whatsapp_evolution-api (Easypanel) ou evolution-api
EVO_CONTAINER=$(docker ps -q -f 'name=whatsapp_evolution-api' | head -1)
[ -z "$EVO_CONTAINER" ] && EVO_CONTAINER=$(docker ps -q -f 'name=evolution-api' | head -1)
WHATSSIRU_CONTAINER=$(docker ps -q -f 'name=jules_whatssiru' | head -1)
[ -z "$WHATSSIRU_CONTAINER" ] && WHATSSIRU_CONTAINER=$(docker ps -q -f 'name=whatssiru' | head -1)

if [ -z "$EVO_CONTAINER" ]; then
  echo "Container evolution-api não encontrado. A tentar alternativas..."
  EVO_CONTAINER=$(docker ps -q -f 'name=whatsapp_evolution' | head -1)
fi
if [ -z "$WHATSSIRU_CONTAINER" ]; then
  echo "Container whatssiru não encontrado."
fi

if [ -z "$EVO_CONTAINER" ]; then
  echo "ERRO: Nenhum container da Evolution API encontrado."
  docker ps --format '{{.Names}}'
  exit 1
fi
if [ -z "$WHATSSIRU_CONTAINER" ]; then
  echo "ERRO: Nenhum container whatssiru encontrado."
  docker ps --format '{{.Names}}'
  exit 1
fi

EVO_NAME=$(docker inspect "$EVO_CONTAINER" --format '{{.Name}}')
WHATSSIRU_NAME=$(docker inspect "$WHATSSIRU_CONTAINER" --format '{{.Name}}')
echo "Evolution: $EVO_NAME ($EVO_CONTAINER)"
echo "Whatssiru: $WHATSSIRU_NAME ($WHATSSIRU_CONTAINER)"

echo ""
echo "Redes do container Evolution API:"
docker inspect "$EVO_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool 2>/dev/null || docker inspect "$EVO_CONTAINER" --format '{{json .NetworkSettings.Networks}}'

echo ""
echo "Redes do container whatssiru:"
docker inspect "$WHATSSIRU_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool 2>/dev/null || docker inspect "$WHATSSIRU_CONTAINER" --format '{{json .NetworkSettings.Networks}}'

# Obter nome da rede do whatssiru (ex.: jules_default)
WHATSSIRU_NET=$(docker inspect "$WHATSSIRU_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)
EVO_NET=$(docker inspect "$EVO_CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)

echo ""
echo "Rede principal whatssiru: $WHATSSIRU_NET"
echo "Rede principal evolution: $EVO_NET"

# Obter IP do whatssiru na sua rede (para fallback)
WHATSSIRU_IP=$(docker inspect "$WHATSSIRU_CONTAINER" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' | head -1)
echo "IP do whatssiru (rede actual): $WHATSSIRU_IP"

echo ""
echo "=== 2. Conectar Evolution API à rede do whatssiru (se redes diferentes) ==="
if [ -n "$WHATSSIRU_NET" ] && [ "$EVO_NET" != "$WHATSSIRU_NET" ]; then
  if docker network inspect "$WHATSSIRU_NET" &>/dev/null; then
    echo "A ligar Evolution à rede $WHATSSIRU_NET ..."
    # Tentar ligar container (compose/standalone)
    if docker network connect "$WHATSSIRU_NET" "$EVO_CONTAINER" 2>/dev/null; then
      echo "Ligação à rede feita (container)."
    else
      # Swarm: ligar o serviço à rede (nome do serviço pode ser whatsapp_evolution-api ou evolution-api)
      EVO_SERVICE=$(docker inspect "$EVO_CONTAINER" --format '{{index .Config.Labels "com.docker.swarm.service.name"}}' 2>/dev/null || true)
      if [ -z "$EVO_SERVICE" ]; then
        EVO_SERVICE=$(docker inspect "$EVO_CONTAINER" --format '{{.Name}}' | sed 's/^\///' | cut -d. -f1)
      fi
      if [ -n "$EVO_SERVICE" ]; then
        echo "Swarm detectado. A actualizar serviço $EVO_SERVICE para rede $WHATSSIRU_NET ..."
        if docker service update --network-add name="$WHATSSIRU_NET" "$EVO_SERVICE" 2>/dev/null; then
          echo "Serviço actualizado. Aguardar 15s para o novo task..."
          sleep 15
          EVO_CONTAINER=$(docker ps -q -f 'name=evolution-api' | head -1)
        else
          echo "Nota: service update falhou. A testar por IP directo."
        fi
      else
        echo "Nota: network connect falhou. A testar por IP directo."
      fi
    fi
  fi
else
  echo "Containers já na mesma rede ou rede única. A testar conectividade."
fi

echo ""
echo "=== 3. Testar URLs a partir do container Evolution API ==="

# Nomes de serviço típicos no Easypanel (project_service); IP directo funciona entre redes após connect
for URL in "http://${WHATSSIRU_IP}:80" "http://jules_whatssiru:80" "http://whatssiru:80"; do
  for EP in "/api/health" "/health"; do
    echo -n "  ${URL}${EP} -> "
    OUT=$(docker exec "$EVO_CONTAINER" wget -q -O- --timeout=5 "${URL}${EP}" 2>/dev/null || true)
    if echo "$OUT" | grep -q "ok\|status\|healthy"; then
      echo " OK"
      WORKING_BASE="$URL"
      break 2
    else
      echo " falhou"
    fi
  done
done

if [ -z "$WORKING_BASE" ]; then
  echo ""
  echo "Nenhum URL respondeu. A tentar gateway do host (porta 80 no host)..."
  # Gateway da rede do container (geralmente .1)
  GW=$(docker exec "$EVO_CONTAINER" sh -c 'ip route | grep default | awk "{print \$3}"' 2>/dev/null | head -1)
  if [ -n "$GW" ]; then
    echo -n "  http://${GW}:80/api/health -> "
    OUT=$(docker exec "$EVO_CONTAINER" wget -q -O- --timeout=5 "http://${GW}:80/api/health" 2>/dev/null || true)
    if echo "$OUT" | grep -q "ok\|status\|healthy"; then
      echo " OK"
      WORKING_BASE="http://${GW}:80"
    else
      echo " falhou"
    fi
  fi
fi

if [ -z "$WORKING_BASE" ]; then
  echo ""
  echo "ERRO: Nenhum URL acessível a partir do container Evolution API."
  echo "Sugestão: No Easypanel, adicionar o serviço evolution-api à mesma rede do projecto 'jules' (whatssiru)."
  exit 1
fi

WEBHOOK_URL="${WORKING_BASE}/webhook"
echo ""
echo "=== 4. URL de webhook a usar (acessível pela Evolution): $WEBHOOK_URL ==="

echo ""
echo "=== 5. Actualizar webhooks na Evolution API (ambas as instâncias) ==="
BODY=$(cat <<EOF
{"url":"$WEBHOOK_URL","enabled":true,"webhookByEvents":false,"webhookBase64":false,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE","QRCODE_UPDATED"]}
EOF
)
for INSTANCE_NAME in "${INSTANCES[@]}"; do
  INSTANCE_ENC=$(echo -n "$INSTANCE_NAME" | python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.stdin.read().strip()))')
  echo -n "  $INSTANCE_NAME -> "
  HTTP=$(curl -s -o /tmp/evo_webhook_resp.txt -w "%{http_code}" -X PUT \
    "${EVOLUTION_API_URL}/webhook/set/${INSTANCE_ENC}" \
    -H "apikey: ${EVOLUTION_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$BODY")
  if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
    HTTP=$(curl -s -o /tmp/evo_webhook_resp.txt -w "%{http_code}" -X POST \
      "${EVOLUTION_API_URL}/webhook/set/${INSTANCE_ENC}" \
      -H "apikey: ${EVOLUTION_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$BODY")
  fi
  if [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
    echo "OK (HTTP $HTTP)"
  else
    echo "Falhou (HTTP $HTTP)"
    cat /tmp/evo_webhook_resp.txt
  fi
done

echo ""
echo "=== 6. Testar: enviar mensagem para 244941529470 (Bráulio) e 244958765478 (Don) e ver logs ==="
echo "  docker service logs jules_whatssiru --tail 30 -f"
echo "  (ou: docker logs $WHATSSIRU_CONTAINER --tail 30 -f)"
echo ""
echo "Concluído."
