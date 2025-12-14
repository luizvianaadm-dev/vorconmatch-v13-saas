// File: src/lib/asaas.js
// VorconMatch V14 - Asaas Payment Gateway Integration
// Handles: Customer creation, payment billings, recurring subscriptions, webhooks

const axios = require('axios');

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_ENV = process.env.ASAAS_ENV || 'sandbox';
const ASAAS_BASE_URL = ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/v3';

const asaasClient = axios.create({
    baseURL: ASAAS_BASE_URL,
    headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json'
    }
});

// ==================== CLIENTES ====================
async function createAsaasCustomer(userEmail, userCPF, userPhone, userName, addressObj = {}) {
    try {
        const payload = {
            name: userName || userEmail.split('@')[0],
            email: userEmail,
            cpfCnpj: userCPF,
            phone: userPhone,
            mobilePhone: userPhone,
            notificationDisabled: false,
            postalCode: addressObj.postalCode || '',
            address: addressObj.address || '',
            addressNumber: addressObj.addressNumber || '',
            province: '' // Bairro currently not asked, can be optional
        };

        const response = await asaasClient.post('/customers', payload);

        return response.data;
    } catch (error) {
        // Handle "Customer already exists" error
        const errData = error.response?.data;
        if (errData?.errors?.some(e => e.code === 'INVALID_CUSTOMER' || e.description.includes('email'))) {
            // Try to find existing customer
            console.log(`⚠️ Cliente já existe (${userEmail}), buscando...`);
            try {
                const search = await asaasClient.get(`/customers?email=${userEmail}`);
                if (search.data.data && search.data.data.length > 0) {
                    return search.data.data[0];
                }
            } catch (searchErr) {
                console.error("Erro ao buscar cliente existente:", searchErr.message);
            }
        }

        console.error('❌ Erro ao criar cliente Asaas:', errData || error.message);
        throw new Error('Falha ao criar cliente de pagamento (Verifique se o email é válido)');
    }
}

// ==================== COBRANÇAS (PIX + BOLETO) ====================
async function createPaymentBilling(customerId, plan, amountBRL, paymentMethod = 'PIX') {
    try {
        const dueDateDays = 3;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + dueDateDays);

        // Validate amount
        if (!amountBRL || amountBRL <= 0) {
            throw new Error('Valor inválido para cobrança');
        }

        const response = await asaasClient.post('/payments', {
            customer: customerId,
            value: amountBRL,
            dueDate: dueDate.toISOString().split('T')[0],
            description: `Assinatura ${plan.toUpperCase()} - VorconMatch`,
            billingType: paymentMethod,
            remoteIp: '0.0.0.0', // Em produção, pegar o IP real da request
            notificationDisabled: false
        });

        return response.data;
    } catch (error) {
        console.error('❌ Erro ao criar cobrança:', error.response?.data || error.message);
        throw new Error('Falha ao gerar link de pagamento');
    }
}

// ==================== ASSINATURAS RECORRENTES ====================
async function createRecurringSubscription(customerId, plan, cycle = 'MONTHLY') {
    try {
        const PLANS_CONFIG = {
            starter: { value: 29.00, description: 'Assinatura Starter' },
            pro: { value: 99.00, description: 'Assinatura Profissional' },
            elite: { value: 299.00, description: 'Assinatura Elite' }
        };

        const planConfig = PLANS_CONFIG[plan];
        if (!planConfig) throw new Error(`Plano ${plan} não existe`);

        const response = await asaasClient.post('/subscriptions', {
            customer: customerId,
            billingType: 'PIX',
            value: planConfig.value,
            nextDueDate: new Date().toISOString().split('T')[0],
            description: planConfig.description,
            cycle: cycle,
            maxPayments: cycle === 'ANNUALLY' ? 1 : null,
            notificationDisabled: false
        });

        return response.data;
    } catch (error) {
        console.error('❌ Erro ao criar assinatura recorrente:', error.response?.data || error.message);
        throw new Error('Falha ao criar assinatura');
    }
}

// ==================== WEBHOOK HANDLER ====================
async function handleAsaasWebhook(event, paymentData, supabaseClient) {
    console.log(`📬 Webhook Asaas: ${event}`);

    if (!supabaseClient) {
        console.warn('⚠️ SupabaseClient não fornecido. Pulando atualização de banco de dados.');
        return;
    }

    try {
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
                    .eq('asaas_payment_id', paymentData.id);

                await supabaseClient.rpc('activate_user_subscription', {
                    payment_id: paymentData.id
                });

                console.log('✅ Pagamento confirmado:', paymentData.id);
                break;

            case 'PAYMENT_REFUNDED':
                await supabaseClient
                    .from('payments')
                    .update({
                        status: 'refunded',
                        updated_at: new Date().toISOString()
                    })
                    .eq('asaas_payment_id', paymentData.id);
                break;

            case 'PAYMENT_OVERDUE':
                console.warn('⚠ Pagamento vencido:', paymentData.id);
                break;

            case 'PAYMENT_FAILED':
                await supabaseClient
                    .from('payments')
                    .update({
                        status: 'failed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('asaas_payment_id', paymentData.id);
                break;
        }
    } catch (error) {
        console.error('❌ Erro no processamento do webhook:', error.message);
    }
}

module.exports = {
    asaasClient,
    createAsaasCustomer,
    createPaymentBilling,
    createRecurringSubscription,
    handleAsaasWebhook
};
