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

  // Bot config endpoint
  app.get('/api/config', (req, res) => {
    res.json({ botName: config.botName });
  });

  // SPA fallback (skip MCP/API routes)
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/mcp') || req.path.startsWith('/sse')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Bind to 0.0.0.0 for Railway/Render/Docker compatibility
  app.listen(config.port, '0.0.0.0', () => {
    console.log('');
    console.log(`  ✦ ${config.botName} is running!`);
    console.log('');
    console.log(`  Chat UI:    http://localhost:${config.port}`);
    console.log(`  MCP Server: http://localhost:${config.port}/mcp`);
    console.log(`  MCP (SSE):  http://localhost:${config.port}/sse`);
    console.log(`  Health:     http://localhost:${config.port}/api/health`);
    console.log('');
    const aiStatus = config.aiProvider === 'anthropic' ? 'Anthropic (Claude)'
      : config.aiProvider === 'openrouter' ? `OpenRouter (${config.openRouterModel})`
      : 'Disabled (no ANTHROPIC_API_KEY or OPENROUTER_API_KEY)';
    console.log(`  AI Chat:    ${aiStatus}`);
    console.log('');
    console.log('  → Paste the MCP Server URL into your Notion agent\'s');
    console.log('    "Custom MCP server" connection dialog.');
    console.log('');
  });
}
