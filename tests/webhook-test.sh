#!/bin/bash

# VorconMatch V13 - Asaas Webhook Test Script
# Testa integracao de webhook com Asaas (Sandbox)

set -e

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== VorconMatch V13 - Asaas Webhook Test ===${NC}"
echo ""

# Variables
WEBHOOK_URL="${1:-https://app.vorcon.com.br/api/asaas/webhook}"
WEBHOOK_SECRET="${2:-your-webhook-secret-here}"
TEST_TYPE="${3:-payment.confirmed}"

echo "[INFO] Configuracoes de teste:"
echo "  Webhook URL: $WEBHOOK_URL"
echo "  Event Type: $TEST_TYPE"
echo ""

case "$TEST_TYPE" in
  "payment.confirmed")
    echo -e "${YELLOW}[TEST] Testando: Pagamento Confirmado${NC}"
    PAYLOAD='{
      "id": "evt_test_'$(date +%s)'",
      "event": "payment.confirmed",
      "createdDate": "'$(date -u +%Y-%m-%dT%H:%M:%S)'",
      "data": {
        "object": "payment",
        "id": "pay_test_'$(date +%s)'",
        "customer": "cus_test_abc123",
        "value": 99.99,
        "status": "CONFIRMED",
        "paymentMethod": "PIX",
        "externalReference": "vorcon-test-user"
      }
    }'
    ;;
  "payment.failed")
    echo -e "${YELLOW}[TEST] Testando: Pagamento Falhado${NC}"
    PAYLOAD='{
      "id": "evt_test_'$(date +%s)'",
      "event": "payment.failed",
      "createdDate": "'$(date -u +%Y-%m-%dT%H:%M:%S)'",
      "data": {
        "object": "payment",
        "id": "pay_test_'$(date +%s)'",
        "customer": "cus_test_abc123",
        "value": 99.99,
        "status": "FAILED",
        "failureReason": "INSUFFICIENT_FUNDS"
      }
    }'
    ;;
  "payment.received")
    echo -e "${YELLOW}[TEST] Testando: Pagamento Recebido (PIX)${NC}"
    PAYLOAD='{
      "id": "evt_test_'$(date +%s)'",
      "event": "payment.received",
      "createdDate": "'$(date -u +%Y-%m-%dT%H:%M:%S)'",
      "data": {
        "object": "payment",
        "id": "pay_test_'$(date +%s)'",
        "customer": "cus_test_abc123",
        "value": 99.99,
        "status": "RECEIVED",
        "paymentMethod": "PIX",
        "receivedDate": "'$(date -u +%Y-%m-%dT%H:%M:%S)'"
      }
    }'
    ;;
  *)
    echo -e "${RED}[ERROR] Tipo de evento desconhecido: $TEST_TYPE${NC}"
    echo "Eventos suportados: payment.confirmed, payment.failed, payment.received"
    exit 1
    ;;
esac

echo "[INFO] Enviando payload..."
echo ""

# Send webhook test
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "asaas-webhook-token: $WEBHOOK_SECRET" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "[RESPONSE] HTTP Status: $HTTP_CODE"
echo "[RESPONSE] Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}[SUCCESS] Webhook processado com sucesso!${NC}"
  exit 0
else
  echo -e "${RED}[ERROR] Webhook falhou com status $HTTP_CODE${NC}"
  exit 1
fi
