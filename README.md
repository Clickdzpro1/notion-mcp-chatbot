# Notion AI Chatbot + MCP Server

A sellable AI chatbot and MCP server that supercharges any Notion workspace. Bundle it with your Notion templates and agents to drive more sales — customers get an AI assistant that talks to their Notion data.

## What This Does

**Two products in one:**

1. **Web Chatbot** — Beautiful chat UI where users talk to their Notion workspace
2. **MCP Server** — Connect your Notion agents (like AGENT ZERO) to AI-powered tools via the Custom MCP server dialog

## Features

### Notion Tools (read/write your workspace)
- **Search** across all pages and databases
- **Query** databases with filters and sorts
- **Create** new pages/rows in any database
- **Update** existing page properties
- **Read** full page content

### AI-Powered Tools (what makes this valuable)
- **Chat with AI** — Multi-turn conversations with memory
- **Summarize Pages** — AI summaries (brief, detailed, or bullets)
- **Generate Content** — Blog posts, reports, emails, descriptions
- **Analyze Databases** — Ask questions about your data, get insights
- **Smart Search** — Search + AI summarization of results
- **Draft from Template** — Generate meeting notes, project briefs, SOPs, proposals

---

## Quick Start

### 1. Get your API keys

- **Notion Integration Token**: [notion.so/my-integrations](https://www.notion.so/my-integrations)
- **Claude API Key**: [console.anthropic.com](https://console.anthropic.com)

### 2. Share databases with your integration

In Notion: open each database → "..." menu → "Connections" → Add your integration.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-your-key
NOTION_API_KEY=ntn_your-key
PORT=3000
BOT_NAME=My Notion Assistant
```

### 4. Install & Run

```bash
npm install
npm start
```

You'll see:

```
  ✦ My Notion Assistant is running!

  Chat UI:    http://localhost:3000
  MCP Server: http://localhost:3000/mcp
```

---

## Connecting to Your Notion Agent

This is the key feature — connect your custom Notion agent to this MCP server.

### Step 1: Deploy your server

Deploy to any hosting provider (see Deployment section) so you have a public URL like `https://your-app.railway.app`.

### Step 2: Connect in Notion

1. Open your Notion agent (e.g., AGENT ZERO)
2. Click **"Add connection"** → **"+ Add custom MCP"**
3. Enter your MCP Server URL:

```
https://your-app.railway.app/mcp
```

4. Click **Connect**

### Step 3: Your agent now has superpowers

Your Notion agent can now:
- Have AI conversations via `chat_with_ai`
- Summarize any page via `summarize_page`
- Generate content via `generate_content`
- Analyze database data via `analyze_database`
- Smart search with AI summaries via `smart_search`
- Draft documents from templates via `draft_from_template`
- Plus all Notion CRUD tools (search, query, create, update)

---

## Customization

### Bot personality

Edit `prompts/system.md` to customize the AI's behavior and tone.

### Branding

Edit CSS custom properties in `public/index.html`:

```css
:root {
  --primary: #000000;        /* Your brand color */
  --accent: #2563eb;         /* Accent color */
}
```

### Bot name

Change `BOT_NAME` in your `.env` file.

---

## All 14 MCP Tools

| Tool | Type | Description |
|------|------|-------------|
| `search_notion` | Notion | Search across all pages and databases |
| `list_databases` | Notion | List all accessible databases |
| `get_database_schema` | Notion | Get column structure of a database |
| `query_database` | Notion | Query database rows with filters |
| `get_page` | Notion | Get page properties |
| `get_page_content` | Notion | Get full page content as text |
| `create_page` | Notion | Create a new page in a database |
| `update_page` | Notion | Update page properties |
| `chat_with_ai` | AI | Multi-turn AI conversation with memory |
| `summarize_page` | AI | AI-powered page summarization |
| `generate_content` | AI | Generate any type of content |
| `analyze_database` | AI | Ask questions about your data |
| `smart_search` | AI | Search + AI summarization |
| `draft_from_template` | AI | Generate docs from templates |

---

## Using with Claude Desktop / Claude Code

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "notion-assistant": {
      "command": "node",
      "args": ["path/to/notion-chatbot/server.js", "--mcp-stdio"],
      "env": {
        "NOTION_API_KEY": "ntn_your-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-key"
      }
    }
  }
}
```

### Claude Code

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "notion-assistant": {
      "command": "node",
      "args": ["path/to/notion-chatbot/server.js", "--mcp-stdio"],
      "env": {
        "NOTION_API_KEY": "ntn_your-key",
        "ANTHROPIC_API_KEY": "sk-ant-your-key"
      }
    }
  }
}
```

---

## Deployment

For your Notion agent to connect, the MCP server needs a public URL.

| Platform | Command | Free tier |
|----------|---------|-----------|
| **Railway** | `railway up` | Yes |
| **Render** | Connect repo | Yes |
| **Fly.io** | `fly launch` | Yes |
| **VPS** | `npm start` + PM2 | N/A |

### Example: Deploy to Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Copy the URL and paste it into your Notion agent's MCP server field.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | ALL | Streamable HTTP MCP endpoint (for Notion agents) |
| `/sse` | GET | Legacy SSE MCP endpoint |
| `/messages` | POST | Legacy SSE message endpoint |
| `/api/chat` | POST | Chat API for the web UI |
| `/api/chat/:id` | DELETE | Reset a conversation |
| `/api/notion/databases` | GET | List available databases |
| `/api/health` | GET | Check API connectivity |

## License

MIT
