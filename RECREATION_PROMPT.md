# MASTER PROMPT: Build a Notion MCP Chatbot from Scratch

> Use this prompt with Claude Code (or any AI coding assistant) to recreate the full AGENT ZERO Notion chatbot + MCP server project.

---

## 🎯 PROJECT OVERVIEW

Build a **Node.js chatbot** that:
1. **Serves as an MCP server** for Notion's Custom MCP Server feature — allowing Notion AI agents to call tools that interact with the user's workspace
2. **Provides a standalone web chat UI** — a dark-mode chat interface that lets users interact with their Notion workspace through natural language
3. **Requires ZERO external AI APIs** — the chat UI uses keyword-scoring intent matching (no OpenAI, no Anthropic, no OpenRouter). When used via MCP with Notion's agent (which already runs on Claude), it provides data tools only
4. **Supports 50+ databases** — with multilingual keyword matching (Arabic, English, French), guided multi-step workflows for creating entries, and a first-time onboarding experience

---

## 📦 TECH STACK

- **Runtime:** Node.js (v18+)
- **Server:** Express.js
- **MCP SDK:** `@modelcontextprotocol/sdk` (latest) — for MCP protocol transport
- **Notion API:** `@notionhq/client` — for workspace CRUD
- **Schema:** `zod` (comes with MCP SDK) — for MCP tool schema registration
- **Other:** `cors`, `dotenv`, `uuid`
- **Frontend:** Vanilla HTML/CSS/JS (no React/Vue — everything embedded in one HTML file)
- **Deployment:** Railway (auto-deploys from GitHub, binds to 0.0.0.0)

---

## 🏗️ ARCHITECTURE (16 files)

```
notion-chatbot/
├── server.js                    # Entry point (web mode or MCP stdio mode)
├── config/index.js              # Environment variables + validation
├── lib/
│   ├── mcp-server.js            # ⭐ MCP protocol (Streamable HTTP + SSE + Stdio)
│   ├── notion.js                # Notion API wrapper with response simplification
│   ├── tools.js                 # 14 tool definitions + dispatcher
│   ├── ai-tools.js              # 6 data-enrichment tools (no external AI)
│   ├── database-registry.js     # Master catalog of all 50 databases
│   ├── database-cache.js        # In-memory database name→ID cache with fuzzy matching
│   ├── intent-engine.js         # Keyword-scoring intent resolver
│   ├── context-memory.js        # Per-session entity tracking for follow-ups
│   ├── workflow-engine.js       # Multi-step guided entry creation
│   ├── onboarding.js            # First-time user experience
│   ├── result-formatter.js      # Tool results → {markdown, structured, suggestions}
│   └── claude.js                # Chat orchestrator (intent → tool → format → respond)
├── routes/
│   ├── chat.js                  # POST /api/chat — message handling
│   ├── dashboard.js             # GET /api/dashboard — stats + categories
│   ├── health.js                # GET /api/health — uptime check
│   └── notion.js                # GET /api/databases, /api/databases/:id/schema
├── public/
│   ├── index.html               # Full SPA with embedded CSS (dark mode, responsive)
│   └── js/
│       ├── app.js               # Frontend chat logic + session management
│       ├── components.js        # Rich UI: database cards, tables, stats, workflow steps
│       └── markdown.js          # Lightweight markdown→HTML renderer
├── prompts/system.md            # Customizable system prompt
├── .env.example                 # Configuration template
├── AGENT_ZERO_INSTRUCTIONS.md   # System prompt for the Notion agent
└── package.json
```

---

## 🔧 CRITICAL IMPLEMENTATION DETAILS

### 1. MCP Server (`lib/mcp-server.js`) — THE MOST IMPORTANT FILE

The MCP server must support three transport modes:

**A. Stateless Streamable HTTP on `/mcp` (primary — what Notion uses):**
- Use `WebStandardStreamableHTTPServerTransport` (NOT the Node.js wrapper `StreamableHTTPServerTransport`)
- WHY: The Node.js wrapper uses `@hono/node-server` which reads from `req.rawHeaders` — you can't modify the Accept header after that. Using the WebStandard transport lets you build a `Request` object manually.
- Set `sessionIdGenerator: undefined` for stateless mode
- Create a FRESH server + transport for EVERY POST request
- After handling, close both transport and server

**CRITICAL Accept Header Fix:**
```javascript
function buildWebRequest(req) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  // Notion's MCP client may not send the required Accept header
  const accept = headers.get('accept') || '';
  if (!accept.includes('text/event-stream') || !accept.includes('application/json')) {
    headers.set('accept', 'application/json, text/event-stream');
  }
  return new Request(url, { method: req.method, headers, body: JSON.stringify(req.body), duplex: 'half' });
}
```

**Stream the Web Response back to Express:**
```javascript
async function sendWebResponse(webResponse, res) {
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => res.setHeader(key, value));
  const reader = webResponse.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(decoder.decode(value, { stream: true }));
  }
  res.end();
}
```

**B. GET /mcp returns 405** (per MCP spec for stateless servers)
**C. DELETE /mcp returns 405** (no sessions to delete)
**D. SSE on /sse + /sse/message** (legacy fallback)
**E. Stdio mode** (for Claude Desktop)

**Zod Schema Conversion:**
MCP SDK requires Zod schemas for tool registration. Convert JSON Schema → Zod:
- `string` → `z.string()`, with `z.enum()` if `enum` provided
- `number`/`integer` → `z.number()`
- `boolean` → `z.boolean()`
- `array` → `z.array(z.any())`
- `object` → `z.record(z.string(), z.any())` ← MUST use two-arg form, single-arg `z.record(z.any())` breaks in Zod v4

**Authentication:**
- Optional `MCP_AUTH_TOKEN` env var
- Checks `Authorization` header, strips `Bearer`/`Token`/`Basic` prefix
- Returns JSON-RPC 401 error on mismatch

### 2. Intent Engine (`lib/intent-engine.js`) — Zero-AI Routing

Every tool defines keyword groups with weights:
```javascript
{
  tool: 'list_databases',
  keywords: {
    primary: ['databases', 'database', ...],  // +3 points
    action: ['list', 'show', 'what', ...],    // +2 points
    qualifier: ['my', 'available', ...],       // +1 point
  },
  minScore: 4,
}
```

Scoring per message:
1. Tokenize message (lowercase, strip punctuation)
2. Score each token against ALL tool definitions
3. Add bonuses: database name match (+3), context follow-up (+1), pronoun resolution (+3)
4. Add `priorityBonus` only when primary keywords matched (for workflow trigger)
5. Subtract penalty if tool needs database/page ID but none resolved (-2)
6. Highest score above `minScore` wins

**Workflow trigger (`__start_workflow__`) gets +3 priority bonus** so it beats `create_page` when both match.

### 3. Database Registry (`lib/database-registry.js`) — 50 Database Catalog

Each database entry:
```javascript
{
  keywords: ['عملاء', 'crm', 'client', 'customers', ...],  // AR + EN + FR
  emoji: '👥',
  category: 'sales',
  purpose: 'Manage clients from first contact to last receipt',
  naturalTriggers: ['add client', 'ضيف عميل', 'new client'],
  workflowHint: { type: 'title_first', keyFields: ['phone', 'email', 'source'] },
}
```

11 categories: sales, operations, growth, marketing, team, events, experiments, security, personal, productivity, tools

### 4. Database Cache (`lib/database-cache.js`)

- On startup: fetch all databases from Notion, build keyword index
- Index sources: database titles, description words, registry keywords, natural trigger tokens
- Fuzzy matching: Levenshtein distance ≤ 2-3 for typo tolerance
- Auto-refresh every 5 minutes
- `resolveDatabase(text)` returns `{id, title, confidence}` or null

### 5. Workflow Engine (`lib/workflow-engine.js`)

Built-in templates for common databases (CRM, Tasks, Content, Leads, Invoices, Notes) with predefined field steps. Dynamic fallback: auto-generate steps from any database schema.

State machine: `{active, databaseId, steps[], currentStep, collected{}}`

User can type `skip` for optional fields, `cancel` to exit.

### 6. Notion API Wrapper (`lib/notion.js`)

**Key function: `buildPropertyValue(type, value)`** — converts simple values to Notion API format:
- `'title'` → `{title: [{text: {content: value}}]}`
- `'select'` → `{select: {name: value}}`
- `'multi_select'` → `{multi_select: value.map(v => ({name: v}))}`
- `'date'` → `{date: {start: value}}` (handles `end` if array)
- `'number'` → `{number: Number(value)}`

**Key function: `getPageContent(id)`** — recursively fetches blocks, converts to markdown

### 7. Frontend (`public/index.html`)

Single HTML file with ALL CSS embedded (no external stylesheets). Dark mode via `prefers-color-scheme`. Rich components: database cards with action buttons, data tables, stat panels with bar charts, workflow progress indicators with step dots, suggestion chips.

`public/js/components.js` renders structured API responses. `public/js/app.js` handles messages. `public/js/markdown.js` converts markdown to HTML.

### 8. Chat Orchestrator (`lib/claude.js`)

Decision tree:
```
1. Active workflow? → handle step input
2. First-time user? → run onboarding
3. Greeting? → show help with database shortcuts
4. Intent engine match? → execute tool (or start workflow)
5. Fallback search → search workspace
6. Show help
```

### 9. Result Formatter (`lib/result-formatter.js`)

Every tool result → `{markdown, structured, suggestions}`:
- `markdown`: Emoji-rich formatted text for display
- `structured`: JSON object for rich UI components (type + data)
- `suggestions`: Array of `{label, action}` for quick-action buttons

---

## 🌍 ENVIRONMENT VARIABLES

```env
# REQUIRED
NOTION_API_KEY=ntn_your-key-here

# OPTIONAL
MCP_AUTH_TOKEN=any-secret-string      # For MCP auth
NOTION_DATABASE_IDS=id1,id2           # Empty = auto-discover all
PORT=3000
BOT_NAME=Notion Assistant
MAX_HISTORY=50
```

---

## 🚀 DEPLOYMENT (Railway)

1. Push to GitHub
2. Connect repo to Railway
3. Set `NOTION_API_KEY` in Railway environment variables
4. Railway auto-detects Node.js, runs `npm start`
5. Generate a public domain (e.g., `your-app.up.railway.app`)
6. In Notion → Agent settings → Custom MCP → URL: `https://your-app.up.railway.app/mcp`

---

## 🔌 NOTION AGENT CONNECTION

In Notion's agent settings:
- **URL:** `https://your-app.up.railway.app/mcp`
- **Auth:** None (if no MCP_AUTH_TOKEN set) or HTTP Bearer (with matching token)
- All 14 tools should appear and be toggleable

---

## ✅ VERIFICATION CHECKLIST

After building, verify:
1. `curl -X POST your-url/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'` → returns 200 with server info
2. `curl -X POST your-url/mcp -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'` → returns 14 tools
3. `curl -X GET your-url/mcp` → returns 405
4. `curl your-url/api/health` → returns `{"status":"ok","notion":true}`
5. Chat UI: "What databases do I have?" → lists databases
6. Chat UI: "add a new client" → starts guided workflow
7. Chat UI: "analyze the CRM" → shows pre-computed stats
8. Notion agent: connects and shows all 14 tools enabled

---

## 📝 IMPORTANT GOTCHAS

1. **MCP SDK v1.28+** uses `WebStandardStreamableHTTPServerTransport` — the Node.js wrapper has an Accept header bug via `@hono/node-server` that reads from `rawHeaders` (immutable). Must build Web Standard Request manually.

2. **Zod v4** changed `z.record()` — must use `z.record(z.string(), z.any())` not `z.record(z.any())`. The single-arg form causes `_zod undefined` errors during `tools/list` serialization.

3. **Notion's MCP client** may not send the required `Accept: application/json, text/event-stream` header. The server must inject it.

4. **Workflow trigger** must have `priorityBonus` that only activates when primary keywords (add/create/new) are present, otherwise "search for tasks" gets misrouted to a workflow.

5. **Database name resolution** needs multi-layer fallback: cache index → registry keywords → built-in template keywords → Levenshtein fuzzy match.

6. **Session-based onboarding** means every new session starts fresh. Use `sessionStorage` on frontend to persist `sessionId`.

7. **Notion API rate limits**: The database cache avoids repeated API calls. Refresh every 5 minutes, not on every request.

8. **Property value building**: `createPage` must fetch the schema first to know property types, then build Notion API-compatible objects. Simple values in, complex Notion objects out.
