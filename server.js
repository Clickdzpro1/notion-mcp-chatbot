const config = require('./config');

// MCP stdio mode — for Claude Desktop / Claude Code
if (process.argv.includes('--mcp-stdio')) {
  const { startMcpStdio } = require('./lib/mcp-server');
  startMcpStdio();
} else {
  // Web server mode — serves chatbot UI + MCP HTTP endpoints
  const express = require('express');
  const cors = require('cors');
  const path = require('path');
  const { mountMcpRoutes } = require('./lib/mcp-server');
  const dbCache = require('./lib/database-cache');

  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // --- MCP HTTP endpoints (for Notion agents to connect) ---
  mountMcpRoutes(app);

  // --- Chat API ---
  app.use('/api/chat', require('./routes/chat'));
  app.use('/api/notion', require('./routes/notion'));
  app.use('/api/health', require('./routes/health'));
  app.use('/api/dashboard', require('./routes/dashboard'));

  // Bot config endpoint
  app.get('/api/config', (req, res) => {
    res.json({ botName: config.botName });
  });

  // Database list for frontend autocomplete
  app.get('/api/databases', (req, res) => {
    res.json(dbCache.getAll());
  });

  // SPA fallback (skip MCP/API routes)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/mcp') || req.path.startsWith('/sse')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Init database cache then start server
  dbCache.refresh().then(() => {
    app.listen(config.port, '0.0.0.0', () => {
      console.log('');
      console.log(`  ✦ ${config.botName} is running!`);
      console.log('');
      console.log(`  Chat UI:    http://localhost:${config.port}`);
      console.log(`  MCP Server: http://localhost:${config.port}/mcp`);
      console.log(`  MCP (SSE):  http://localhost:${config.port}/sse`);
      console.log(`  Health:     http://localhost:${config.port}/api/health`);
      console.log('');
      console.log(`  Mode:       Zero-dependency (no AI API needed)`);
      console.log(`  Databases:  ${dbCache.getAll().length} cached`);
      console.log('');
    });
  }).catch(err => {
    console.error('Failed to init database cache:', err.message);
    // Start anyway — cache will refresh on first request
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`  ✦ ${config.botName} running on port ${config.port} (cache failed, will retry)`);
    });
  });
}
