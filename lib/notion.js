const { Client } = require('@notionhq/client');
const config = require('../config');

const notion = new Client({ auth: config.notionApiKey });

// --- Helpers to simplify Notion's verbose responses ---

function extractTitle(properties) {
  for (const [key, val] of Object.entries(properties)) {
    if (val.type === 'title' && val.title) {
      return val.title.map(t => t.plain_text).join('');
    }
  }
  return 'Untitled';
}

function simplifyProperty(prop) {
  switch (prop.type) {
    case 'title':
      return prop.title?.map(t => t.plain_text).join('') || '';
    case 'rich_text':
      return prop.rich_text?.map(t => t.plain_text).join('') || '';
    case 'number':
      return prop.number;
    case 'select':
      return prop.select?.name || null;
    case 'multi_select':
      return prop.multi_select?.map(s => s.name) || [];
    case 'date':
      return prop.date ? { start: prop.date.start, end: prop.date.end } : null;
    case 'checkbox':
      return prop.checkbox;
    case 'url':
      return prop.url;
    case 'email':
      return prop.email;
    case 'phone_number':
      return prop.phone_number;
    case 'status':
      return prop.status?.name || null;
    case 'people':
      return prop.people?.map(p => p.name || p.id) || [];
    case 'files':
      return prop.files?.map(f => f.name || f.file?.url || f.external?.url) || [];
    case 'formula':
      return prop.formula?.[prop.formula.type];
    case 'relation':
      return prop.relation?.map(r => r.id) || [];
    case 'rollup':
      return prop.rollup?.[prop.rollup.type];
    case 'created_time':
      return prop.created_time;
    case 'last_edited_time':
      return prop.last_edited_time;
    case 'created_by':
      return prop.created_by?.name || prop.created_by?.id;
    case 'last_edited_by':
      return prop.last_edited_by?.name || prop.last_edited_by?.id;
    case 'unique_id':
      return prop.unique_id ? `${prop.unique_id.prefix || ''}${prop.unique_id.number}` : null;
    default:
      return `[${prop.type}]`;
  }
}

function simplifyProperties(properties) {
  const result = {};
  for (const [key, val] of Object.entries(properties)) {
    result[key] = simplifyProperty(val);
  }
  return result;
}

function simplifyPage(page) {
  return {
    id: page.id,
    title: extractTitle(page.properties),
    properties: simplifyProperties(page.properties),
    url: page.url,
    created_time: page.created_time,
    last_edited_time: page.last_edited_time,
  };
}

// --- Core Notion operations ---

async function searchNotion(query) {
  const response = await notion.search({ query, page_size: 20 });
  return response.results.map(item => ({
    id: item.id,
    type: item.object,
    title: item.object === 'page'
      ? extractTitle(item.properties)
      : item.title?.map(t => t.plain_text).join('') || 'Untitled',
    url: item.url,
  }));
}

async function listDatabases() {
  const response = await notion.search({
    filter: { property: 'object', value: 'database' },
    page_size: 100,
  });

  let databases = response.results.map(db => ({
    id: db.id,
    title: db.title?.map(t => t.plain_text).join('') || 'Untitled',
    description: db.description?.map(t => t.plain_text).join('') || '',
    url: db.url,
  }));

  // Filter to configured databases if specified
  if (config.notionDatabaseIds.length > 0) {
    const ids = new Set(config.notionDatabaseIds.map(id => id.replace(/-/g, '')));
    databases = databases.filter(db => ids.has(db.id.replace(/-/g, '')));
  }

  return databases;
}

async function getDatabaseSchema(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  const schema = {};
  for (const [name, prop] of Object.entries(db.properties)) {
    const entry = { type: prop.type };
    if (prop.type === 'select' || prop.type === 'status') {
      entry.options = prop[prop.type]?.options?.map(o => o.name) || [];
    }
    if (prop.type === 'multi_select') {
      entry.options = prop.multi_select?.options?.map(o => o.name) || [];
    }
    if (prop.type === 'number') {
      entry.format = prop.number?.format;
    }
    schema[name] = entry;
  }
  return {
    id: db.id,
    title: db.title?.map(t => t.plain_text).join('') || 'Untitled',
    schema,
  };
}

async function queryDatabase(databaseId, filter, sorts, pageSize = 100) {
  const params = { database_id: databaseId, page_size: Math.min(pageSize, 100) };
  if (filter) params.filter = filter;
  if (sorts) params.sorts = sorts;

  const response = await notion.databases.query(params);
  return {
    results: response.results.map(simplifyPage),
    has_more: response.has_more,
    total: response.results.length,
  };
}

async function getPage(pageId) {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return simplifyPage(page);
}

async function getPageContent(pageId) {
  const blocks = [];
  let cursor;
  let iterations = 0;

  do {
    const response = await notion.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
    iterations++;
  } while (cursor && iterations < 10); // Cap at ~1000 blocks

  return blocks.map(block => {
    const type = block.type;
    const data = block[type];
    if (!data) return `[${type}]`;

    if (data.rich_text) {
      const text = data.rich_text.map(t => t.plain_text).join('');
      switch (type) {
        case 'heading_1': return `# ${text}`;
        case 'heading_2': return `## ${text}`;
        case 'heading_3': return `### ${text}`;
        case 'bulleted_list_item': return `- ${text}`;
        case 'numbered_list_item': return `1. ${text}`;
        case 'to_do': return `- [${data.checked ? 'x' : ' '}] ${text}`;
        case 'toggle': return `> ${text}`;
        case 'quote': return `> ${text}`;
        case 'callout': return `> ${data.icon?.emoji || ''} ${text}`;
        case 'code': return `\`\`\`${data.language || ''}\n${text}\n\`\`\``;
        default: return text;
      }
    }

    if (type === 'divider') return '---';
    if (type === 'image') return `![image](${data.file?.url || data.external?.url || ''})`;
    if (type === 'bookmark') return `[Bookmark](${data.url || ''})`;
    if (type === 'equation') return `$$${data.expression}$$`;

    return `[${type}]`;
  }).join('\n');
}

function buildPropertyValue(type, value, options = {}) {
  switch (type) {
    case 'title':
      return { title: [{ text: { content: String(value) } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value) } }] };
    case 'number':
      return { number: Number(value) };
    case 'select':
      return { select: { name: String(value) } };
    case 'multi_select':
      const items = Array.isArray(value) ? value : [value];
      return { multi_select: items.map(name => ({ name: String(name) })) };
    case 'date':
      if (typeof value === 'object' && value.start) {
        return { date: value };
      }
      return { date: { start: String(value) } };
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'url':
      return { url: String(value) };
    case 'email':
      return { email: String(value) };
    case 'phone_number':
      return { phone_number: String(value) };
    case 'status':
      return { status: { name: String(value) } };
    case 'people':
      const people = Array.isArray(value) ? value : [value];
      return { people: people.map(id => ({ id: String(id) })) };
    case 'relation':
      const relations = Array.isArray(value) ? value : [value];
      return { relation: relations.map(id => ({ id: String(id) })) };
    default:
      return undefined;
  }
}

async function createPage(databaseId, properties) {
  // Get schema to build proper property values
  const schema = await getDatabaseSchema(databaseId);
  const notionProperties = {};

  for (const [key, value] of Object.entries(properties)) {
    const propSchema = schema.schema[key];
    if (!propSchema) continue;
    const built = buildPropertyValue(propSchema.type, value);
    if (built) notionProperties[key] = built;
  }

  const page = await notion.pages.create({
    parent: { database_id: databaseId },
    properties: notionProperties,
  });

  return simplifyPage(page);
}

async function updatePage(pageId, properties) {
  // Get current page to find its parent database
  const currentPage = await notion.pages.retrieve({ page_id: pageId });
  let schema = null;

  if (currentPage.parent?.database_id) {
    schema = await getDatabaseSchema(currentPage.parent.database_id);
  }

  const notionProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (schema && schema.schema[key]) {
      const built = buildPropertyValue(schema.schema[key].type, value);
      if (built) notionProperties[key] = built;
    }
  }

  const page = await notion.pages.update({
    page_id: pageId,
    properties: notionProperties,
  });

  return simplifyPage(page);
}

module.exports = {
  searchNotion,
  listDatabases,
  getDatabaseSchema,
  queryDatabase,
  getPage,
  getPageContent,
  createPage,
  updatePage,
};
