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

// Bearer token auth check
function checkAuth(req, res) {
  if (!config.mcpToken) return true; // no auth configured

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return false;
  }

  const token = authHeader.replace(/^(Bearer|Token)\s+/i, '');
  if (token !== config.mcpToken) {
    res.status(403).json({ error: 'Invalid token' });
    return false;
  }

  return true;
}

// --- Stdio transport ---
async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Notion MCP server running on stdio');
}

// --- HTTP transports for Express ---
function mountMcpRoutes(app) {

  // ==========================================
  // /mcp — Handles BOTH protocols:
  //   GET  → SSE transport (what Notion uses)
  //   POST → Streamable HTTP transport
  //   DELETE → Streamable HTTP session cleanup
  // ==========================================

  // GET /mcp — SSE stream (Notion agents connect here)
  app.get('/mcp', async (req, res) => {
    console.log('  [MCP] GET /mcp — SSE connection');
    if (!checkAuth(req, res)) return;

    try {
      const transport = new SSEServerTransport('/mcp', res);
      transports[transport.sessionId] = transport;
      console.log(`  [MCP] SSE session started: ${transport.sessionId}`);

      res.on('close', () => {
        console.log(`  [MCP] SSE session closed: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      });

      const server = createMcpServer();
      await server.connect(transport);
    } catch (err) {
      console.error('  [MCP] SSE error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'MCP SSE connection failed' });
      }
    }
  });

  // POST /mcp — handles both SSE messages AND Streamable HTTP
  app.post('/mcp', async (req, res) => {
    if (!checkAuth(req, res)) return;

    try {
      // Check if this is an SSE message (has sessionId query param)
      const sseSessionId = req.query.sessionId;
      if (sseSessionId && transports[sseSessionId]) {
        const transport = transports[sseSessionId];
        if (transport instanceof SSEServerTransport) {
          console.log(`  [MCP] POST /mcp — SSE message for session: ${sseSessionId}`);
          await transport.handlePostMessage(req, res, req.body);
          return;
        }
      }

      // Otherwise, handle as Streamable HTTP
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
      } else if (!sessionId && isInitializeRequest(req.body)) {
        console.log('  [MCP] POST /mcp — New Streamable HTTP session');
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`  [MCP] Streamable HTTP session started: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            console.log(`  [MCP] Streamable HTTP session closed: ${sid}`);
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

  // DELETE /mcp — Streamable HTTP session cleanup
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      if (transport instanceof StreamableHTTPServerTransport) {
        await transport.handleRequest(req, res, req.body);
        return;
      }
    }
    res.status(400).json({ error: 'Invalid session' });
  });

  // ==========================================
  // Legacy endpoints (backwards compatibility)
  // /sse → SSE stream, /messages → SSE messages
  // ==========================================
  app.get('/sse', async (req, res) => {
    console.log('  [MCP] GET /sse — Legacy SSE connection');
    if (!checkAuth(req, res)) return;

    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;

    res.on('close', () => {
      delete transports[transport.sessionId];
    });

    const server = createMcpServer();
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    if (!checkAuth(req, res)) return;
    const sessionId = req.query.sessionId;
    const transport = transports[sessionId];

    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.status(400).json({ error: 'Invalid or missing session' });
      return;
    }

    await transport.handlePostMessage(req, res, req.body);
  });

  console.log('  MCP endpoints: /mcp (SSE+HTTP), /sse, /messages');
}

module.exports = { createMcpServer, startMcpStdio, mountMcpRoutes };
