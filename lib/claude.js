/**
 * Smart Command Router — No AI API needed
 *
 * Parses user messages into tool calls using pattern matching.
 * Formats results into clean, readable responses.
 * Fast, free, zero external dependencies.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { tools, executeTool } = require('./tools');

// ============================================================
// Command patterns — maps user intent to tool calls
// ============================================================
const COMMANDS = [
  {
    patterns: [/^(list|show|عرض|اعرض).*(database|db|داتا|قاعد)/i, /^(databases|داتابيز)/i, /واش عند/i],
    tool: 'list_databases',
    args: () => ({}),
    desc: 'Listing all databases...',
  },
  {
    patterns: [/^(search|find|ابحث|بحث|دور)\s+(.+)/i, /^(وين|فين)\s+(.+)/i],
    tool: 'search_notion',
    args: (m) => ({ query: m[2] || m[0] }),
    desc: 'Searching workspace...',
  },
  {
    patterns: [/schema\s+([\w-]+)/i, /structure\s+([\w-]+)/i, /هيكل\s+([\w-]+)/i],
    tool: 'get_database_schema',
    args: (m) => ({ database_id: m[1] }),
    desc: 'Getting database schema...',
  },
  {
    patterns: [/query\s+([\w-]+)(.*)/i, /اجلب.*([\w-]{36})/i],
    tool: 'query_database',
    args: (m) => ({ database_id: m[1] }),
    desc: 'Querying database...',
  },
  {
    patterns: [/page\s+([\w-]{32,36})/i, /صفحة\s+([\w-]{32,36})/i],
    tool: 'get_page',
    args: (m) => ({ page_id: m[1] }),
    desc: 'Getting page...',
  },
  {
    patterns: [/content\s+([\w-]{32,36})/i, /read\s+([\w-]{32,36})/i, /محتوى\s+([\w-]{32,36})/i],
    tool: 'get_page_content',
    args: (m) => ({ page_id: m[1] }),
    desc: 'Reading page content...',
  },
  {
    patterns: [/summarize\s+([\w-]{32,36})/i, /summary\s+([\w-]{32,36})/i, /لخص\s+([\w-]{32,36})/i],
    tool: 'summarize_page',
    args: (m) => ({ page_id: m[1], style: 'brief' }),
    desc: 'Fetching page for summary...',
  },
  {
    patterns: [/analyze\s+([\w-]{32,36})\s*(.*)/i, /حلل\s+([\w-]{32,36})\s*(.*)/i],
    tool: 'analyze_database',
    args: (m) => ({ database_id: m[1], question: m[2] || 'Give me an overview of this data' }),
    desc: 'Analyzing database...',
  },
  {
    patterns: [/draft\s+(meeting|project|blog|weekly|sop|proposal)\s*(.*)/i],
    tool: 'draft_from_template',
    args: (m) => ({
      template_type: m[1] === 'meeting' ? 'meeting-notes' : m[1] === 'project' ? 'project-brief' : m[1] === 'blog' ? 'blog-post' : m[1] === 'weekly' ? 'weekly-report' : m[1],
      topic: m[2] || 'General',
    }),
    desc: 'Preparing template...',
  },
  {
    patterns: [/generate\s+(.*)/i, /اكتب\s+(.*)/i, /create content\s+(.*)/i],
    tool: 'generate_content',
    args: (m) => ({ prompt: m[1] }),
    desc: 'Preparing content generation...',
  },
  {
    patterns: [/smart.?search\s+(.*)/i],
    tool: 'smart_search',
    args: (m) => ({ query: m[1], summarize: true }),
    desc: 'Smart searching...',
  },
];

// ============================================================
// Format tool results into readable text
// ============================================================
function formatResult(toolName, result) {
  if (!result) return 'No results found.';
  if (result.error) return `❌ Error: ${result.error}`;

  switch (toolName) {
    case 'list_databases': {
      if (!Array.isArray(result) || result.length === 0) return 'No databases found.';
      const lines = result.map((db, i) => `${i + 1}. **${db.title}**\n   ${db.description || 'No description'}\n   ID: \`${db.id}\``);
      return `📊 **Found ${result.length} databases:**\n\n${lines.join('\n\n')}`;
    }

    case 'search_notion': {
      if (!Array.isArray(result) || result.length === 0) return '🔍 No results found.';
      const lines = result.slice(0, 10).map((r, i) => `${i + 1}. **${r.title}** (${r.type})\n   ID: \`${r.id}\``);
      return `🔍 **Found ${result.length} results:**\n\n${lines.join('\n\n')}`;
    }

    case 'get_database_schema': {
      if (!result.schema) return JSON.stringify(result, null, 2);
      const fields = Object.entries(result.schema).map(([name, info]) =>
        `- **${name}** (${info.type})${info.options ? ': ' + info.options.map(o => o.name || o).join(', ') : ''}`
      );
      return `📋 **${result.title}** Schema:\n\n${fields.join('\n')}`;
    }

    case 'query_database': {
      if (!result.results || result.results.length === 0) return '📄 No rows found.';
      const rows = result.results.slice(0, 10).map((r, i) => {
        const props = Object.entries(r.properties || {}).map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        return `**Row ${i + 1}** (ID: \`${r.id}\`)\n${props.join('\n')}`;
      });
      return `📄 **${result.total} rows found** (showing ${Math.min(10, result.results.length)}):\n\n${rows.join('\n\n')}`;
    }

    case 'get_page': {
      const props = Object.entries(result.properties || {}).map(([k, v]) => `- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      return `📝 **${result.title || 'Page'}**\n\n${props.join('\n')}`;
    }

    case 'get_page_content': {
      return `📖 **Page Content:**\n\n${typeof result === 'string' ? result.substring(0, 2000) : JSON.stringify(result).substring(0, 2000)}`;
    }

    case 'summarize_page': {
      return `📝 **${result.page_title}**\n\n📊 Stats: ${result.stats.word_count} words, ${result.stats.line_count} lines, ${result.stats.headings} headings\n\n${result.sections?.length > 0 ? '📑 Sections: ' + result.sections.join(', ') : ''}\n\n📄 Content:\n${result.content?.substring(0, 1500) || 'No content'}`;
    }

    case 'analyze_database': {
      let text = `📊 **${result.database}** — ${result.total_rows} rows\n\n❓ Question: ${result.question}\n\n`;
      if (result.computed_stats && Object.keys(result.computed_stats).length > 0) {
        text += '**📈 Stats:**\n';
        for (const [prop, stat] of Object.entries(result.computed_stats)) {
          if (stat.type === 'number') {
            text += `- ${prop}: sum=${stat.sum}, avg=${stat.avg}, min=${stat.min}, max=${stat.max}\n`;
          } else if (stat.distribution) {
            const dist = Object.entries(stat.distribution).map(([k, v]) => `${k}: ${v}`).join(', ');
            text += `- ${prop}: ${dist}\n`;
          } else if (stat.type === 'checkbox') {
            text += `- ${prop}: ✅ ${stat.checked} / ❌ ${stat.unchecked}\n`;
          }
        }
      }
      return text;
    }

    case 'smart_search': {
      if (result.enriched_results) {
        const lines = result.enriched_results.map((r, i) =>
          `${i + 1}. **${r.title}** (${r.type}${r.word_count ? ', ' + r.word_count + ' words' : ''})\n   ${r.preview ? r.preview.substring(0, 150) + '...' : ''}`
        );
        return `🔍 **Smart Search: "${result.query}"** — ${result.total_found} results\n\n${lines.join('\n\n')}`;
      }
      return formatResult('search_notion', result.results || result);
    }

    case 'draft_from_template': {
      let text = `📝 **${result.template_name}: ${result.topic}**\n\n`;
      text += result.sections.map(s => `## ${s}\n[Content to be filled]`).join('\n\n');
      if (result.related_workspace_content) {
        text += `\n\n📎 **Related in workspace:**\n${result.related_workspace_content.map(r => `- ${r.title}`).join('\n')}`;
      }
      return text;
    }

    case 'generate_content': {
      return `✍️ **Content Generation Ready**\n\n- Type: ${result.content_type}\n- Tone: ${result.tone}\n- Prompt: ${result.prompt}\n${result.database_context ? '\n📊 Database context loaded: ' + result.database_context.database_title : ''}`;
    }

    case 'create_page':
      return `✅ **Page created!**\n\nID: \`${result.id}\`\nURL: ${result.url}`;

    case 'update_page':
      return `✅ **Page updated!**\n\nID: \`${result.id}\``;

    default:
      return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  }
}

// ============================================================
// Parse and execute user message
// ============================================================
async function chat(conversationHistory, userMessage) {
  const msg = userMessage.trim();

  // Check against command patterns
  for (const cmd of COMMANDS) {
    for (const pattern of cmd.patterns) {
      const match = msg.match(pattern);
      if (match) {
        try {
          const args = cmd.args(match);
          const result = await executeTool(cmd.tool, args);
          const formatted = formatResult(cmd.tool, result);

          conversationHistory.push({ role: 'user', content: msg });
          conversationHistory.push({ role: 'assistant', content: formatted });

          return { response: formatted, conversationHistory };
        } catch (err) {
          const errorMsg = `❌ Error running ${cmd.tool}: ${err.message}`;
          conversationHistory.push({ role: 'user', content: msg });
          conversationHistory.push({ role: 'assistant', content: errorMsg });
          return { response: errorMsg, conversationHistory };
        }
      }
    }
  }

  // Fallback: try smart search if message looks like a question
  if (msg.length > 3 && !msg.match(/^(hi|hey|hello|مرحبا|سلام|salut|bonjour)/i)) {
    try {
      const results = await executeTool('search_notion', { query: msg });
      if (Array.isArray(results) && results.length > 0) {
        const formatted = formatResult('search_notion', results);
        const response = `🤖 I searched your workspace for "${msg}":\n\n${formatted}\n\n💡 **Tip:** Use specific commands like:\n- \`list databases\` — show all databases\n- \`search [keyword]\` — search workspace\n- \`schema [database-id]\` — view database structure\n- \`query [database-id]\` — query database rows\n- \`analyze [database-id] [question]\` — analyze data\n- \`summarize [page-id]\` — summarize a page\n- \`draft meeting [topic]\` — create a document draft`;

        conversationHistory.push({ role: 'user', content: msg });
        conversationHistory.push({ role: 'assistant', content: response });
        return { response, conversationHistory };
      }
    } catch {}
  }

  // Greeting or unrecognized
  const greeting = `👋 **Welcome to ${config.botName}!**

I'm your Notion workspace assistant. Here's what I can do:

📊 **Data Access:**
- \`list databases\` — show all databases
- \`search [keyword]\` — find pages and databases
- \`schema [database-id]\` — view database structure
- \`query [database-id]\` — fetch database rows
- \`page [page-id]\` — get page properties
- \`content [page-id]\` — read page content

🧠 **AI-Powered (via AGENT ZERO):**
- \`analyze [database-id] [question]\` — data analysis with stats
- \`summarize [page-id]\` — page summary with stats
- \`smart search [keyword]\` — search with content previews
- \`generate [prompt]\` — prepare content generation
- \`draft meeting/project/blog/sop/proposal [topic]\` — document templates

✏️ **Actions:**
- \`create page\` — create new database entries
- \`update page\` — modify existing pages

Just type what you need!`;

  conversationHistory.push({ role: 'user', content: msg });
  conversationHistory.push({ role: 'assistant', content: greeting });
  return { response: greeting, conversationHistory };
}

module.exports = { chat, provider: 'command-router' };
