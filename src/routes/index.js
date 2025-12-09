const express = require('express');
const router = express.Router();

// Webhook Asaas
router.post('/asaas/webhook', (req, res) => {
  console.log('Webhook Asaas received:', req.body);
  // TODO: Implement webhook handler
  res.json({ received: true });
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

// Placeholder para rotas futuras de pagamento
router.post('/billing/create', (req, res) => {
  res.status(201).json({ message: 'Billing endpoint - coming soon' });
});

module.exports = router;
