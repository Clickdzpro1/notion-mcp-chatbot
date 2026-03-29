const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const { tools, executeTool } = require('./tools');
const config = require('../config');

const transports = {};

function createMcpServer() {
  const server = new McpServer({
    name: 'notion-agent-mcp',
    version: '1.0.0',
  }, { capabilities: { logging: {} } });

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

function checkAuth(req, res) {
  if (!config.mcpToken) return true;

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return false;
  }

  const token = authHeader.replace(/^(Bearer|Token)\s+/i, '').trim();
  if (token !== config.mcpToken) {
    res.status(403).json({ error: 'Invalid token' });
    return false;
  }

  return true;
}

async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Notion MCP server running on stdio');
}

function mountMcpRoutes(app) {

  // ==========================================
  // STREAMABLE HTTP — /mcp (POST, GET, DELETE)
  // This is the modern MCP protocol (2025)
  // ==========================================
  app.post('/mcp', async (req, res) => {
    if (!checkAuth(req, res)) return;

    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
        if (!(transport instanceof StreamableHTTPServerTransport)) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session uses a different protocol' },
            id: null,
          });
          return;
        }
      } else if (isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`  [MCP] New session: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) delete transports[sid];
        };

        const server = createMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'No valid session. Send initialize first.' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('  [MCP] POST error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      if (transport instanceof StreamableHTTPServerTransport) {
        await transport.handleRequest(req, res);
        return;
      }
    }
    // If no session, return server info (useful for health checks)
    res.json({
      name: 'notion-agent-mcp',
      version: '1.0.0',
      protocol: 'streamable-http',
      status: 'ready',
    });
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      if (transport instanceof StreamableHTTPServerTransport) {
        await transport.handleRequest(req, res);
        return;
      }
    }
    res.status(400).json({ error: 'Invalid session' });
  });

  // ==========================================
  // SSE — /sse (GET) + /sse (POST with ?sessionId)
  // Legacy protocol for older MCP clients
  // Notion may use /sse as fallback
  // ==========================================
  app.get('/sse', async (req, res) => {
    console.log('  [MCP] SSE connection on /sse');
    if (!checkAuth(req, res)) return;

    try {
      // SSEServerTransport: 1st arg = where client should POST messages
      const transport = new SSEServerTransport('/sse', res);
      transports[transport.sessionId] = transport;

      res.on('close', () => {
        delete transports[transport.sessionId];
      });

      const server = createMcpServer();
      await server.connect(transport);
    } catch (err) {
      console.error('  [MCP] SSE error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'SSE connection failed' });
      }
    }
  });

  app.post('/sse', async (req, res) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];

    if (transport && transport instanceof SSEServerTransport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).json({ error: 'Invalid session' });
    }
  });

  console.log('  MCP endpoints: /mcp (Streamable HTTP), /sse (SSE)');
}

module.exports = { createMcpServer, startMcpStdio, mountMcpRoutes };
