# Asaas Webhook Setup - VorconMatch V13

## 1. Obtener Credenciais Asaas (Sandbox & Produção)

### Passo 1: Acesso ao Dashboard Asaas
1. Acesse: https://app.asaas.com/login
2. Login com suas credenciais VORCON
3. Navegue para: **Configurações → Integrações → Webhooks**

### Passo 2: Gerar API Keys

#### Sandbox:
```
URL: https://sandbox.asaas.com
API_Key (Sandbox): sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Webhook Secret (Sandbox): wh_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

#### Produção:
```
URL: https://app.asaas.com
API_Key (Produção): sk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Webhook Secret (Produção): wh_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## 2. Configurar Webhook no Asaas

### Endpoint de Webhook:
```
https://app.vorcon.com.br/api/asaas/webhook
```

### Eventos para Monitorar:
- `payment.created` - Pagamento criado
- `payment.confirmed` - Pagamento confirmado
- `payment.failed` - Pagamento falhou
- `payment.refunded` - Pagamento reembolsado
- `payment.received` - Pagamento recebido (PIX)
- `customer.created` - Cliente criado

### Passos no Dashboard Asaas:
1. Em **Webhooks**, clique em **"+ Adicionar Webhook"**
2. Informe: `https://app.vorcon.com.br/api/asaas/webhook`
3. Selecione os eventos acima
4. Copie a **chave secreta** (webhook secret)
5. Salve

## 3. Atualizar Credenciais no Vercel

### Sandbox (Para Testes):
```bash
# No Vercel Dashboard:
# Settings → Environment Variables

ASAAS_API_KEY = sk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ASAAS_WEBHOOK_SECRET = wh_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ASAAS_ENVIRONMENT = sandbox
```

### Produção:
```bash
ASAAS_API_KEY = sk_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ASAAS_WEBHOOK_SECRET = wh_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ASAAS_ENVIRONMENT = production
```

## 4. Testar Webhook com Sandbox

### Via curl (Terminal):
```bash
curl -X POST https://app.vorcon.com.br/api/asaas/webhook \
  -H "Content-Type: application/json" \
  -H "asaas-webhook-token: wh_test_XXXXXXXX" \
  -d '{
    "id": "evt_test_123456",
    "event": "payment.confirmed",
    "createdDate": "'$(date -u +%Y-%m-%dT%H:%M:%S)'",
    "data": {
      "object": "payment",
      "id": "pay_test_123456",
      "customer": "cus_test_abc123",
      "value": 100.00,
      "status": "CONFIRMED",
      "paymentMethod": "PIX"
    }
  }'
```

### Via Postman:
1. Método: **POST**
2. URL: `https://app.vorcon.com.br/api/asaas/webhook`
3. Headers:
   ```
   Content-Type: application/json
   asaas-webhook-token: wh_test_XXXXXXXX
   ```
4. Body (JSON):
   ```json
   {
     "id": "evt_test_123456",
     "event": "payment.confirmed",
     "createdDate": "2025-12-09T11:00:00Z",
     "data": {
       "object": "payment",
       "id": "pay_test_123456",
       "customer": "cus_test_abc123",
       "value": 100.00,
       "status": "CONFIRMED",
       "paymentMethod": "PIX",
       "externalReference": "vorcon-user-123"
     }
   }
   ```

## 5. Validação do Webhook

O endpoint `/api/asaas/webhook` faz:

1. **Verificação de Autenticidade**:
   - Valida token `asaas-webhook-token`
   - Compara com `ASAAS_WEBHOOK_SECRET`

2. **Processamento**:
   - Insere evento em `audit_logs` (Supabase)
   - Atualiza status de pagamento em `payments`
   - Executa `activate_user_subscription` se confirmado

3. **Resposta**:
   ```json
   {
     "success": true,
     "message": "Webhook processado com sucesso",
     "eventId": "evt_test_123456"
   }
   ```

## 6. Fluxo de Pagamento

```
Cliente clica "Renovar Assinatura"
         ↓
  Gatekeeper redireciona para Asaas
         ↓
Cliente realiza pagamento (PIX/Boleto/CC)
         ↓
   Asaas confirma pagamento
         ↓
  Webhook POST → /api/asaas/webhook
         ↓
  Database atualiza status → `payments` & `user_subscriptions`
         ↓
  Trigger executa → `activate_user_subscription`
         ↓
  Usuário tem acesso renovado ✅
```

## 7. Logs & Monitoramento

Verifique os logs no Supabase:
```sql
SELECT * FROM audit_logs 
WHERE event_type = 'payment' 
ORDER BY created_at DESC 
LIMIT 10;
```

## 8. Troubleshooting

### ❌ Webhook não recebe eventos
- Verifique se o endpoint está acessível: `https://app.vorcon.com.br/health`
- Confirme a chave secreta no Vercel e Asaas
- Tente novamente via sandbox

### ❌ Token inválido
- Regenere a chave no dashboard Asaas
- Atualize no Vercel
- Espere 5 minutos para propagação

### ❌ Erro 500 no webhook
- Verifique logs do Vercel: **Deployments → Logs**
- Confirme conexão com Supabase
- Valide dados do evento

## 9. Status Atual

✅ Webhook handler implementado: `src/app/api/asaas/webhook/route.ts`
✅ Banco de dados configurado: `payments`, `audit_logs`
✅ Trigger de ativação: `activate_user_subscription`
✅ Vercel deployment: Ready
⏳ **Credenciais Asaas**: PENDENTE (insira suas chaves)
⏳ **Teste com Sandbox**: PENDENTE
⏳ **Produção**: PENDENTE após validação

---

**Próximos Passos:**
1. Obter API keys do Asaas (sandbox)
2. Atualizar credenciais no Vercel
3. Testar webhook com curl/Postman
4. Monitorar logs no Supabase
5. Passar para produção
