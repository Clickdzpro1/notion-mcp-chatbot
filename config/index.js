const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('  ENV check: NOTION_API_KEY =', process.env.NOTION_API_KEY ? 'set (' + process.env.NOTION_API_KEY.substring(0, 8) + '...)' : 'NOT SET');
console.log('  ENV check: PORT =', process.env.PORT || '(default 3000)');

if (!process.env.NOTION_API_KEY && !process.argv.includes('--mcp-stdio')) {
  console.error('\n  Missing required: NOTION_API_KEY');
  console.error('  Copy .env.example to .env and add your Notion integration token.\n');
  process.exit(1);
}

module.exports = {
  notionApiKey: process.env.NOTION_API_KEY,
  mcpToken: process.env.MCP_AUTH_TOKEN || null,
  notionDatabaseIds: process.env.NOTION_DATABASE_IDS
    ? process.env.NOTION_DATABASE_IDS.split(',').map(id => id.trim()).filter(Boolean)
    : [],
  port: parseInt(process.env.PORT, 10) || 3000,
  botName: process.env.BOT_NAME || 'Notion Assistant',
  maxHistory: parseInt(process.env.MAX_HISTORY, 10) || 50,
};
