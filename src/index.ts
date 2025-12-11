import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA - Serve index.html for all non-file routes (SPA fallback)
app.get('*', (req, res) => {
  // If the request is for a file (has extension), return 404
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  // Otherwise, serve the SPA HTML file
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});



app.get('/about', function (req, res) {
  res.sendFile(path.join(__dirname, '..', 'components', 'about.htm'))
})

// Example API endpoint - JSON
app.get('/api-data', (req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default app
