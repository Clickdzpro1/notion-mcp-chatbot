const notion = require('./notion');
const config = require('../config');

// Only load AI tools if ANTHROPIC_API_KEY is set
let aiTools = [];
let executeAiTool = async () => null;
if (config.hasAI) {
  const ai = require('./ai-tools');
  aiTools = ai.aiTools;
  executeAiTool = ai.executeAiTool;
}

const notionTools = [
  {
    name: 'search_notion',
    description: 'Search across all pages and databases in the connected Notion workspace. Use this to find pages, databases, or content by keyword.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query keywords' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_databases',
    description: 'List all Notion databases the chatbot has access to. Call this first to discover available databases before querying them.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_database_schema',
    description: 'Get the column structure (property names, types, and options) of a Notion database. Use this before creating or querying pages to understand what fields are available.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'The Notion database ID' },
      },
      required: ['database_id'],
    },
  },
  {
    name: 'query_database',
    description: 'Query rows from a Notion database with optional filters and sorts. Get the schema first to know available properties.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'The Notion database ID' },
        filter: {
          type: 'object',
          description: 'Notion API filter object. Example: {"property":"Status","select":{"equals":"Done"}}',
        },
        sorts: {
          type: 'array',
          description: 'Array of sort objects. Example: [{"property":"Created","direction":"descending"}]',
          items: { type: 'object' },
        },
      },
      required: ['database_id'],
    },
  },
  {
    name: 'get_page',
    description: 'Get the properties of a specific Notion page by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'The Notion page ID' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'get_page_content',
    description: 'Get the full text/block content of a Notion page. Returns the page body as readable markdown-like text.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'The Notion page ID' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'create_page',
    description: 'Create a new page/row in a Notion database. Get the database schema first to know which properties to set.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'The database ID to create the page in' },
        properties: {
          type: 'object',
          description: 'Key-value pairs of property names and their values. Use simple values (strings, numbers, booleans). For dates use ISO format. For multi_select use arrays.',
        },
      },
      required: ['database_id', 'properties'],
    },
  },
  {
    name: 'update_page',
    description: 'Update properties of an existing Notion page. Get the page first to see current values, and the database schema to know property types.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'The page ID to update' },
        properties: {
          type: 'object',
          description: 'Key-value pairs of property names and new values.',
        },
      },
      required: ['page_id', 'properties'],
    },
  },
];

// Combined tools = Notion tools + AI tools
const tools = [...notionTools, ...aiTools];

// Dispatcher — executes a tool by name
async function executeTool(name, input) {
  // Try AI tools first
  const aiResult = await executeAiTool(name, input);
  if (aiResult !== null) return aiResult;

  // Notion tools
  switch (name) {
    case 'search_notion':
      return await notion.searchNotion(input.query);
    case 'list_databases':
      return await notion.listDatabases();
    case 'get_database_schema':
      return await notion.getDatabaseSchema(input.database_id);
    case 'query_database':
      return await notion.queryDatabase(input.database_id, input.filter, input.sorts);
    case 'get_page':
      return await notion.getPage(input.page_id);
    case 'get_page_content':
      return await notion.getPageContent(input.page_id);
    case 'create_page':
      return await notion.createPage(input.database_id, input.properties);
    case 'update_page':
      return await notion.updatePage(input.page_id, input.properties);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { tools, executeTool };
