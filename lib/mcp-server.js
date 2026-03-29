/**
 * MCP Server — Proper implementation with three transport modes:
 *
 *   1. Stateless Streamable HTTP on /mcp (what Notion Custom MCP expects)
 *   2. SSE on /sse + /sse/message (legacy protocol)
 *   3. Stdio (for Claude Desktop / Claude Code)
 *
 * Each POST to /mcp creates a fresh server+transport, handles the request,
 * and tears down. No persistent sessions needed for Notion.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { WebStandardStreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const z = require('zod');
const { tools, executeTool } = require('./tools');
const config = require('../config');

// SSE sessions only (Streamable HTTP is stateless)
const sseSessions = {};

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of Object.entries(sseSessions)) {
    if (s.created < cutoff) delete sseSessions[id];
  }
}, 10 * 60 * 1000);

// ============================================================
// JSON Schema → Zod
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
      default:
        field = z.record(z.string(), z.any());
        break;
    }
    if (prop.description) field = field.describe(prop.description);
    if (!required.includes(key)) field = field.optional();
    shape[key] = field;
  }
  return shape;
}

// ============================================================
// Create MCP Server instance with all tools
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
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
        }
      }
    );
  }

  return server;
}

// ============================================================
// Auth (for Express req objects)
// ============================================================
function authenticate(req, res) {
  if (!config.mcpToken) return true;

  const raw = req.headers['authorization'] || '';
  const token = raw.replace(/^(Bearer|Token|Basic)\s+/i, '').trim();

  if (!token || token !== config.mcpToken) {
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
// Stdio
// ============================================================
async function startMcpStdio() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  console.error('Notion MCP server running on stdio');
}

// ============================================================
// Convert Express req/res to Web Standard Request/Response
// and handle the MCP Streamable HTTP protocol manually.
// This avoids the @hono/node-server rawHeaders issue where
// modified req.headers['accept'] is ignored.
// ============================================================
function buildWebRequest(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const url = `${protocol}://${host}${req.originalUrl}`;

  // Build headers from req.headers, ensuring Accept includes what SDK needs
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  // Always ensure Accept header includes both required types
  const accept = headers.get('accept') || '';
  if (!accept.includes('text/event-stream') || !accept.includes('application/json')) {
    headers.set('accept', 'application/json, text/event-stream');
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: JSON.stringify(req.body),
    duplex: 'half',
  });
}

async function sendWebResponse(webResponse, res) {
  res.status(webResponse.status);

  // Copy response headers
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  // Stream the response body
  const reader = webResponse.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
      // Flush for SSE
      if (typeof res.flush === 'function') res.flush();
    }
  } catch (err) {
    // Client disconnected
  } finally {
    res.end();
  }
}

// ============================================================
// Mount HTTP routes
// ============================================================
function mountMcpRoutes(app) {

  // ----------------------------------------------------------
  // /mcp — STATELESS Streamable HTTP
  // Every request creates a fresh server+transport. No sessions.
  // This is exactly what Notion's Custom MCP expects.
  // ----------------------------------------------------------

  app.post('/mcp', async (req, res) => {
    if (!authenticate(req, res)) return;

    try {
      const server = createMcpServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless — no sessions
      });

      await server.connect(transport);

      const webRequest = buildWebRequest(req);
      const webResponse = await transport.handleRequest(webRequest, {
        parsedBody: req.body,
      });

      await sendWebResponse(webResponse, res);

      transport.close();
      server.close();
    } catch (err) {
      console.error('  [MCP] Error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp → 405 (per MCP spec for stateless servers)
  app.get('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST.' },
      id: null,
    });
  });

  // DELETE /mcp → 405 (no sessions to delete in stateless mode)
  app.delete('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Stateless server.' },
      id: null,
    });
  });

  // ----------------------------------------------------------
  // /sse — Legacy SSE transport (fallback)
  // ----------------------------------------------------------

  app.get('/sse', async (req, res) => {
    if (!authenticate(req, res)) return;

    try {
      const transport = new SSEServerTransport('/sse/message', res);
      sseSessions[transport.sessionId] = { transport, created: Date.now() };

      res.on('close', () => {
        delete sseSessions[transport.sessionId];
      });

      const server = createMcpServer();
      await server.connect(transport);
    } catch (err) {
      console.error('  [SSE] Error:', err);
      if (!res.headersSent) res.status(500).end('SSE failed');
    }
  });

  app.post('/sse/message', async (req, res) => {
    if (!authenticate(req, res)) return;

    const sid = req.query.sessionId;
    const session = sseSessions[sid];

    if (!session?.transport) {
      res.status(404).json({ error: 'Unknown session' });
      return;
    }

    try {
      await session.transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error('  [SSE] Message error:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  });

  console.log('  MCP ready: /mcp (Streamable HTTP), /sse (SSE)');
}

module.exports = { createMcpServer, startMcpStdio, mountMcpRoutes };
