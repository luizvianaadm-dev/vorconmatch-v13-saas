// File: src/lib/asaas.ts
// VorconMatch V13 - Asaas Payment Gateway Integration
// Handles: Customer creation, payment billings, recurring subscriptions, webhooks

import axios, { AxiosInstance } from 'axios'

const ASAAS_API_KEY = process.env.ASAAS_API_KEY
const ASAAS_ENV = process.env.ASAAS_ENV || 'sandbox'
const ASAAS_BASE_URL = ASAAS_ENV === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/v3'

const asaasClient: AxiosInstance = axios.create({
  baseURL: ASAAS_BASE_URL,
  headers: {
    'access_token': ASAAS_API_KEY,
    'Content-Type': 'application/json'
  }
})

// ==================== CLIENTES ====================
export async function createAsaasCustomer(
  userEmail: string,
  userCPF?: string,
  userPhone?: string
) {
  try {
    const response = await asaasClient.post('/customers', {
      name: userEmail.split('@')[0],
      email: userEmail,
      cpfCnpj: userCPF,
      phone: userPhone,
      notificationDisabled: false
    })
    
    return response.data
  } catch (error: any) {
    console.error('❌ Erro ao criar cliente Asaas:', error.response?.data)
    throw new Error('Falha ao criar cliente de pagamento')
  }
}

// ==================== COBRANÇAS (PIX + BOLETO) ====================
export async function createPaymentBilling(
  customerId: string,
  plan: string,
  amountBRL: number,
  paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD' = 'PIX'
) {
  try {
    const dueDateDays = 3
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + dueDateDays)
    
    const response = await asaasClient.post('/payments', {
      customer: customerId,
      value: amountBRL,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `Assinatura ${plan.toUpperCase()} - VorconMatch`,
      billingType: paymentMethod,
      remoteIp: '0.0.0.0',
      notificationDisabled: false
    })
    
    return response.data
  } catch (error: any) {
    console.error('❌ Erro ao criar cobrança:', error.response?.data)
    throw new Error('Falha ao gerar link de pagamento')
  }
}

// ==================== ASSINATURAS RECORRENTES ====================
export async function createRecurringSubscription(
  customerId: string,
  plan: string,
  cycle: 'MONTHLY' | 'ANNUALLY' = 'MONTHLY'
) {
  try {
    const PLANS_CONFIG: Record<string, { value: number; description: string }> = {
      starter: { value: 29.00, description: 'Assinatura Starter' },
      pro: { value: 99.00, description: 'Assinatura Profissional' },
      elite: { value: 299.00, description: 'Assinatura Elite' }
    }
    
    const planConfig = PLANS_CONFIG[plan]
    if (!planConfig) throw new Error(`Plano ${plan} não existe`)
    
    const response = await asaasClient.post('/subscriptions', {
      customer: customerId,
      billingType: 'PIX',
      value: planConfig.value,
      nextDueDate: new Date().toISOString().split('T')[0],
      description: planConfig.description,
      cycle: cycle,
      maxPayments: cycle === 'ANNUALLY' ? 1 : null,
      notificationDisabled: false
    })
    
    return response.data
  } catch (error: any) {
    console.error('❌ Erro ao criar assinatura recorrente:', error.response?.data)
    throw new Error('Falha ao criar assinatura')
  }
}

// ==================== WEBHOOK HANDLER ====================
export async function handleAsaasWebhook(
  event: string,
  paymentData: any,
  supabaseClient: any
) {
  console.log(`📬 Webhook Asaas: ${event}`)
  
  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      await supabaseClient
        .from('payments')
        .update({
          status: 'paid',
          paid_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('asaas_payment_id', paymentData.id)
      
      await supabaseClient.rpc('activate_user_subscription', {
        payment_id: paymentData.id
      })
      
      console.log('✅ Pagamento confirmado:', paymentData.id)
      break
      
    case 'PAYMENT_REFUNDED':
      await supabaseClient
        .from('payments')
        .update({
          status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('asaas_payment_id', paymentData.id)
      break
      
    case 'PAYMENT_OVERDUE':
      console.warn('⚠ Pagamento vencido:', paymentData.id)
      break
      
    case 'PAYMENT_FAILED':
      await supabaseClient
        .from('payments')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('asaas_payment_id', paymentData.id)
      break
  }
}

export { asaasClient }
