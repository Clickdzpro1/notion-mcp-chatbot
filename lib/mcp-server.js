const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { tools, executeTool } = require('./tools');
const config = require('../config');

// Active transports keyed by session ID
const transports = {};

// Bearer token auth middleware for MCP endpoints
function authMiddleware(req, res, next) {
  // Skip auth if no token configured
  if (!config.mcpToken) return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== config.mcpToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  next();
}

function createMcpServer() {
  const server = new McpServer({
    name: 'notion-agent-mcp',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });

  // Register each tool
  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      tool.input_schema.properties || {},
      async (params) => {
        try {
          const result = await executeTool(tool.name, params);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

// --- Stdio transport (for Claude Desktop / Claude Code) ---
async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Notion MCP server running on stdio');
}

// --- HTTP transports for Express (for Notion agents, web clients) ---
function mountMcpRoutes(app) {

  // ==========================================
  // Streamable HTTP Transport (2025 protocol)
  // Endpoint: /mcp  (GET, POST, DELETE)
  // ==========================================
  app.all('/mcp', authMiddleware, async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        const existing = transports[sessionId];
        if (existing instanceof StreamableHTTPServerTransport) {
          transport = existing;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session uses a different transport protocol' },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`  MCP session started: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`  MCP session closed: ${sid}`);
            delete transports[sid];
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // ==========================================
  // Legacy SSE Transport (2024 protocol)
  // Endpoint: GET /sse + POST /messages
  // ==========================================
  app.get('/sse', authMiddleware, async (req, res) => {
    console.log('  SSE client connected');
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;

    res.on('close', () => {
      console.log(`  SSE session closed: ${transport.sessionId}`);
      delete transports[transport.sessionId];
    });

    const server = createMcpServer();
    await server.connect(transport);
  });

  app.post('/messages', authMiddleware, async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];

    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.status(400).json({ error: 'Invalid or missing session' });
      return;
    }

    await transport.handlePostMessage(req, res, req.body);
  });

  console.log('  MCP endpoints mounted: /mcp, /sse, /messages');
}

module.exports = { createMcpServer, startMcpStdio, mountMcpRoutes };
