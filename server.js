const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', require('./src/routes'));

// SPA - Rota raiz serve index.html (para suportar SPA routing)
// Catch-all: qualquer rota não encontrada serve index.html (SPA fallback)
app.get('*', (req, res) => {
  // Se for uma requisição de arquivo (tem extensão), retorna 404
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  // Caso contrário, serve a app SPA
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check para Vercel
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'VorconMatch V13 is running', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`⚛️ VorconMatch V13 running on port ${PORT}`);
  console.log(`🌐 Access at http://localhost:${PORT}`);
});

module.exports = app;
