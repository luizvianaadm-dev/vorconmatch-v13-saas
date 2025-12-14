const express = require('express');
const router = express.Router();

const { createPaymentBilling, createAsaasCustomer, handleAsaasWebhook } = require('../lib/asaas');
const { processReconciliation } = require('../lib/reconciliation');
const { generateReconciliationReport } = require('../lib/pdf-generator');

// TODO: Initialize Supabase client if database integration is needed
const supabaseClient = null;

// Report Endpoint
router.post('/report/pdf', (req, res) => {
  try {
    // Frontend sends flattened structure: matches 'index.html' implementation
    const { stats, unmatchedBank, unmatchedFin } = req.body;

    // Validate essential data exists
    if (!stats || !unmatchedBank || !unmatchedFin) {
      console.error('Missing data', req.body);
      return res.status(400).json({ error: 'Missing logic data for PDF' });
    }

    // Map to structure expected by 'generateReconciliationReport'
    const resultsShim = {
      stats: stats,
      totalReconciled: 'N/A', // Frontend doesn't send this explicitly, but we can calculate or ignore
      unmatched: {
        bank: unmatchedBank,
        asaas: unmatchedFin
      }
    };

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio-conciliacao.pdf');

    generateReconciliationReport(resultsShim, res);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Reconciliation Endpoint
router.post('/reconcile', (req, res) => {
  try {
    const { bankStatement, asaasStatement } = req.body;

    if (!bankStatement || !asaasStatement) {
      return res.status(400).json({ error: 'Missing bankStatement or asaasStatement' });
    }

    const results = processReconciliation(bankStatement, asaasStatement);
    res.json(results);
  } catch (error) {
    console.error('Reconciliation Error:', error);
    res.status(500).json({ error: 'Failed to process reconciliation' });
  }
});

// Webhook Asaas
router.post('/asaas/webhook', async (req, res) => {
  try {
    const { event, payment } = req.body;
    await handleAsaasWebhook(event, payment, supabaseClient);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running', env: process.env.NODE_ENV });
});

// Create Payment Billing
router.post('/billing/create', async (req, res) => {
  try {
    const { customerId, plan, amount, paymentMethod } = req.body;

    if (!customerId || !amount) {
      return res.status(400).json({ error: 'Missing customerId or amount' });
    }

    const result = await createPaymentBilling(customerId, plan || 'standard', amount, paymentMethod);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Init Access (Registration + Billing)
router.post('/billing/init-access', async (req, res) => {
  try {
    const { name, email, cpf, cnpj, amount } = req.body;

    // 1. Create or Get Customer with Full Details
    // Use CNPJ if available for the customer record, or CPF
    const mainDoc = cnpj || cpf || '00000000000';

    const customer = await createAsaasCustomer(
      email,
      mainDoc,
      '11999999999', // Mock phone
      name // Pass Name
    );

    // Update customer name if possible (Asaas API dependent, but create handles it)
    // We note that 'createAsaasCustomer' in asaas.js currently splits email for name. 
    // We should probably update that too, but for now passing the data is step 1.
    // Ideally we would update the createAsaasCustomer signature to accept name.

    // 2. Create Billing
    const billing = await createPaymentBilling(
      customer.id,
      'BETA_ACCESS',
      amount,
      'PIX'
    );

    res.json(billing);
  } catch (error) {
    console.error("Billing Init Error:", error);
    res.status(500).json({ error: error.message || 'Falha ao gerar cobrança' });
  }
});

module.exports = router;
