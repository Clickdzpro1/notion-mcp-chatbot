const dotenv = require('dotenv');
const path = require('path');

// Load .env file if it exists (ignored on platforms like Railway that set env vars directly)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Debug: log which env vars are detected (safe — only shows key names, not values)
console.log('  ENV check: NOTION_API_KEY =', process.env.NOTION_API_KEY ? 'set (' + process.env.NOTION_API_KEY.substring(0, 8) + '...)' : 'NOT SET');
console.log('  ENV check: PORT =', process.env.PORT || '(default 3000)');

// Only NOTION_API_KEY is required — AI key is optional
if (!process.env.NOTION_API_KEY && !process.argv.includes('--mcp-stdio')) {
  console.error('\n  Missing required: NOTION_API_KEY');
  console.error('  Copy .env.example to .env and add your Notion integration token.\n');
  console.error('  If deploying to Railway/Render, add NOTION_API_KEY as an environment variable.\n');
  process.exit(1);
}

module.exports = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  hasAI: !!process.env.ANTHROPIC_API_KEY,
  notionApiKey: process.env.NOTION_API_KEY,
  mcpToken: process.env.MCP_AUTH_TOKEN || null,
  notionDatabaseIds: process.env.NOTION_DATABASE_IDS
    ? process.env.NOTION_DATABASE_IDS.split(',').map(id => id.trim()).filter(Boolean)
    : [],
  port: parseInt(process.env.PORT, 10) || 3000,
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
  botName: process.env.BOT_NAME || 'Notion Assistant',
  maxHistory: parseInt(process.env.MAX_HISTORY, 10) || 50,
};
