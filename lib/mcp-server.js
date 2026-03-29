/**
 * MCP Server — handles Streamable HTTP and SSE transports
 *
 * Endpoints:
 *   POST /mcp          → Streamable HTTP (modern protocol)
 *   GET  /mcp          → Streamable HTTP GET (session listen)
 *   DELETE /mcp        → Streamable HTTP session close
 *   GET  /sse          → SSE stream (legacy protocol, opens connection)
 *   POST /sse/message  → SSE message handler (client posts JSON-RPC here)
 */

const { randomUUID } = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { isInitializeRequest } = require('@modelcontextprotocol/sdk/types.js');
const z = require('zod');
const { tools, executeTool } = require('./tools');
const config = require('../config');

// ============================================================
// Session store
// ============================================================
const sessions = {};

// Cleanup stale sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of Object.entries(sessions)) {
    if (now - s.created > 30 * 60 * 1000) {
      delete sessions[id];
    }
  }
}, 10 * 60 * 1000);

// ============================================================
// JSON Schema → Zod converter
// ============================================================
function toZod(properties, required = []) {
  const shape = {};
  for (const [key, prop] of Object.entries(properties || {})) {
    let field;
    switch (prop.type) {
      case 'string':
        field = prop.enum ? z.enum(prop.enum) : z.string();
        break;
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(z.any());
        break;
      case 'object':
      default:
        field = z.record(z.any());
        break;
    }
    if (prop.description) field = field.describe(prop.description);
    if (!required.includes(key)) field = field.optional();
    shape[key] = field;
  }
  return shape;
}

// ============================================================
// Create MCP Server with all tools registered
// ============================================================
function createMcpServer() {
  const server = new McpServer(
    { name: 'notion-agent-mcp', version: '1.0.0' },
    { capabilities: { logging: {} } }
  );

  for (const tool of tools) {
    server.tool(
      tool.name,
      tool.description,
      toZod(tool.input_schema.properties, tool.input_schema.required || []),
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

// ============================================================
// Authentication middleware
// ============================================================
function authenticate(req, res) {
  // If no MCP_AUTH_TOKEN configured, allow all requests
  if (!config.mcpToken) return true;

  const authHeader = req.headers['authorization'] || '';

  // Accept: "Bearer <token>", "Token <token>", "Basic <token>", or raw "<token>"
  const token = authHeader
    .replace(/^(Bearer|Token|Basic)\s+/i, '')
    .trim();

  if (!token || token !== config.mcpToken) {
    console.error(`  [AUTH] Rejected: got "${token ? token.substring(0, 4) + '...' : 'empty'}"`);
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });
    return false;
  }

  return true;
}

// ============================================================
// Stdio transport (for Claude Desktop / Claude Code)
// ============================================================
async function startMcpStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Notion MCP server running on stdio');
}

// ============================================================
// Mount HTTP routes on Express app
// ============================================================
function mountMcpRoutes(app) {

  // ----------------------------------------------------------
  // Streamable HTTP Transport — /mcp
  // ----------------------------------------------------------

  app.post('/mcp', async (req, res) => {
    if (!authenticate(req, res)) return;

    try {
      const sessionId = req.headers['mcp-session-id'];
      let transport;

      if (sessionId && sessions[sessionId]?.transport instanceof StreamableHTTPServerTransport) {
        // Existing session
        transport = sessions[sessionId].transport;
      } else if (isInitializeRequest(req.body)) {
        // New session
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            console.log(`  [MCP/HTTP] Session: ${sid}`);
            sessions[sid] = { transport, created: Date.now() };
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) delete sessions[sid];
        };

        const server = createMcpServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'No session. Send initialize first.' },
          id: req.body?.id || null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('  [MCP/HTTP] Error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err.message },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (req, res) => {
    if (!authenticate(req, res)) return;

    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && sessions[sessionId]?.transport instanceof StreamableHTTPServerTransport) {
      await sessions[sessionId].transport.handleRequest(req, res);
      return;
    }

    // No session — return server info (health check)
    res.json({
      name: 'notion-agent-mcp',
      version: '1.0.0',
      status: 'ready',
      tools: tools.length,
      endpoints: {
        streamableHttp: '/mcp',
        sse: '/sse',
        sseMessages: '/sse/message',
      },
    });
  });

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && sessions[sessionId]?.transport instanceof StreamableHTTPServerTransport) {
      await sessions[sessionId].transport.handleRequest(req, res);
      return;
    }
    res.status(404).json({ error: 'No such session' });
  });

  // ----------------------------------------------------------
  // SSE Transport — GET /sse + POST /sse/message
  // Notion's Custom MCP (beta) likely uses this protocol.
  // ----------------------------------------------------------

  app.get('/sse', async (req, res) => {
    if (!authenticate(req, res)) return;

    try {
      // Build absolute POST endpoint URL so Notion can resolve it
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const absolutePostUrl = `${proto}://${host}/sse/message`;

      console.log(`  [MCP/SSE] Connection opened, POST endpoint: ${absolutePostUrl}`);

      const transport = new SSEServerTransport(absolutePostUrl, res);
      sessions[transport.sessionId] = { transport, created: Date.now() };

      res.on('close', () => {
        console.log(`  [MCP/SSE] Connection closed: ${transport.sessionId}`);
        delete sessions[transport.sessionId];
      });

      const server = createMcpServer();
      await server.connect(transport);
    } catch (err) {
      console.error('  [MCP/SSE] Connection error:', err);
      if (!res.headersSent) {
        res.status(500).end('SSE connection failed');
      }
    }
  });

  app.post('/sse/message', async (req, res) => {
    if (!authenticate(req, res)) return;

    const sessionId = req.query.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId query parameter' });
      return;
    }

    const session = sessions[sessionId];
    if (!session || !(session.transport instanceof SSEServerTransport)) {
      res.status(404).json({ error: 'Unknown session. Reconnect via GET /sse.' });
      return;
    }

    try {
      await session.transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error('  [MCP/SSE] Message error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  });

  console.log('  MCP ready: /mcp (Streamable HTTP), /sse (SSE)');
}

module.exports = { createMcpServer, startMcpStdio, mountMcpRoutes };
