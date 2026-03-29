/**
 * Result Formatter — Converts tool results into structured + markdown output.
 *
 * Returns { markdown, structured, suggestions } for rich UI rendering.
 */

const dbCache = require('./database-cache');

function format(toolName, result, resolvedDb) {
  if (!result) return empty('No results found.');
  if (result.error) return empty(`❌ Error: ${result.error}`);

  switch (toolName) {
    case 'list_databases': return formatDatabaseList(result);
    case 'search_notion': return formatSearch(result);
    case 'get_database_schema': return formatSchema(result);
    case 'query_database': return formatQuery(result);
    case 'get_page': return formatPage(result);
    case 'get_page_content': return formatContent(result);
    case 'create_page': return formatCreated(result);
    case 'update_page': return formatUpdated(result);
    case 'summarize_page': return formatSummary(result);
    case 'analyze_database': return formatAnalysis(result);
    case 'smart_search': return formatSmartSearch(result);
    case 'generate_content': return formatGenerate(result);
    case 'draft_from_template': return formatDraft(result);
    case 'chat_with_ai': return formatChat(result);
    default: return empty(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  }
}

function empty(text) {
  return { markdown: text, structured: null, suggestions: [] };
}

// ============================================================
// Formatters
// ============================================================

function formatDatabaseList(result) {
  if (!Array.isArray(result) || result.length === 0) return empty('No databases found.');

  const md = result.map((db, i) =>
    `**${i + 1}. ${db.title}**\n${db.description || 'No description'}`
  ).join('\n\n');

  return {
    markdown: `📊 **${result.length} Databases Found:**\n\n${md}`,
    structured: { type: 'database_list', items: result },
    suggestions: result.slice(0, 4).flatMap(db => [
      { label: `📋 Query`, action: `query ${db.id}`, icon: 'query' },
      { label: `📊 Analyze`, action: `analyze ${db.id} Give me an overview`, icon: 'analyze' },
    ]),
  };
}

function formatSearch(result) {
  if (!Array.isArray(result) || result.length === 0) return empty('🔍 No results found.');

  const md = result.slice(0, 10).map((r, i) =>
    `**${i + 1}. ${r.title}** _(${r.type})_`
  ).join('\n');

  return {
    markdown: `🔍 **Found ${result.length} results:**\n\n${md}`,
    structured: { type: 'search_results', items: result.slice(0, 10) },
    suggestions: result.slice(0, 3).map(r => ({
      label: r.type === 'database' ? `📋 Query ${r.title.substring(0, 20)}` : `📖 Read ${r.title.substring(0, 20)}`,
      action: r.type === 'database' ? `query ${r.id}` : `content ${r.id}`,
    })),
  };
}

function formatSchema(result) {
  if (!result.schema) return empty(JSON.stringify(result, null, 2));

  const fields = Object.entries(result.schema).map(([name, info]) => ({
    name,
    type: info.type,
    options: info.options?.map(o => o.name || o) || null,
  }));

  const md = fields.map(f =>
    `• **${f.name}** \`${f.type}\`${f.options ? ' — ' + f.options.join(', ') : ''}`
  ).join('\n');

  return {
    markdown: `📋 **${result.title}** — Schema\n\n${md}`,
    structured: { type: 'schema', title: result.title, id: result.id, fields },
    suggestions: [
      { label: '📋 Query rows', action: `query ${result.id}` },
      { label: '📊 Analyze', action: `analyze ${result.id} Give me an overview` },
      { label: '➕ Create entry', action: `create ${result.id}` },
    ],
  };
}

function formatQuery(result) {
  if (!result.results || result.results.length === 0) return empty('📄 No rows found.');

  const rows = result.results.slice(0, 15);
  const md = rows.map((r, i) => {
    const props = Object.entries(r.properties || {})
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `  ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n');
    return `**${i + 1}.** ${r.title || 'Row'}\n${props}`;
  }).join('\n\n');

  return {
    markdown: `📄 **${result.total} rows** (showing ${rows.length}):\n\n${md}`,
    structured: { type: 'query_results', total: result.total, rows },
    suggestions: rows.slice(0, 2).map(r => ({
      label: `📖 Read ${(r.title || 'Row').substring(0, 20)}`,
      action: `content ${r.id}`,
    })),
  };
}

function formatPage(result) {
  const props = Object.entries(result.properties || {})
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => ({ key: k, value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));

  const md = props.map(p => `• **${p.key}:** ${p.value}`).join('\n');

  return {
    markdown: `📝 **${result.title || 'Page'}**\n\n${md}`,
    structured: { type: 'page', id: result.id, title: result.title, properties: props },
    suggestions: [
      { label: '📖 Read content', action: `content ${result.id}` },
      { label: '📝 Summarize', action: `summarize ${result.id}` },
    ],
  };
}

function formatContent(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return {
    markdown: `📖 **Page Content:**\n\n${text.substring(0, 3000)}`,
    structured: { type: 'content', text },
    suggestions: [],
  };
}

function formatCreated(result) {
  return {
    markdown: `✅ **Page created!**\n\n🔗 [Open in Notion](${result.url})`,
    structured: { type: 'created', id: result.id, url: result.url },
    suggestions: [
      { label: '📖 Read it', action: `content ${result.id}` },
    ],
  };
}

function formatUpdated(result) {
  return {
    markdown: `✅ **Page updated successfully!**`,
    structured: { type: 'updated', id: result.id },
    suggestions: [
      { label: '📝 View page', action: `page ${result.id}` },
    ],
  };
}

function formatSummary(result) {
  const md = `📝 **${result.page_title}**

📊 **Stats:** ${result.stats.word_count} words · ${result.stats.headings} sections · ${result.stats.links} links

${result.sections?.length > 0 ? '**Sections:** ' + result.sections.join(' → ') : ''}

${result.content?.substring(0, 2000) || 'No content'}`;

  return {
    markdown: md,
    structured: { type: 'summary', ...result },
    suggestions: [
      { label: '📖 Full content', action: `content ${result.page_id}` },
    ],
  };
}

function formatAnalysis(result) {
  let statsmd = '';
  if (result.computed_stats && Object.keys(result.computed_stats).length > 0) {
    const lines = [];
    for (const [prop, stat] of Object.entries(result.computed_stats)) {
      if (stat.type === 'number') {
        lines.push(`📈 **${prop}:** Total ${stat.sum} · Avg ${stat.avg} · Min ${stat.min} · Max ${stat.max}`);
      } else if (stat.distribution) {
        const dist = Object.entries(stat.distribution)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        lines.push(`📊 **${prop}:** ${dist}`);
      } else if (stat.type === 'checkbox') {
        lines.push(`☑️ **${prop}:** ✅ ${stat.checked} · ❌ ${stat.unchecked}`);
      }
    }
    statsmd = lines.join('\n');
  }

  return {
    markdown: `📊 **${result.database}** — ${result.total_rows} rows\n\n❓ ${result.question}\n\n${statsmd}`,
    structured: { type: 'analysis', ...result },
    suggestions: [
      { label: '📋 View rows', action: `query ${result.database_id}` },
      { label: '📋 Schema', action: `schema ${result.database_id}` },
    ],
  };
}

function formatSmartSearch(result) {
  if (result.enriched_results) {
    const md = result.enriched_results.map((r, i) =>
      `**${i + 1}. ${r.title}** _(${r.type}${r.word_count ? ', ' + r.word_count + ' words' : ''})_\n${r.preview ? '> ' + r.preview.substring(0, 150) + '...' : ''}`
    ).join('\n\n');

    return {
      markdown: `🔍 **"${result.query}"** — ${result.total_found} results\n\n${md}`,
      structured: { type: 'smart_search', ...result },
      suggestions: result.enriched_results.slice(0, 3).map(r => ({
        label: `📖 ${r.title.substring(0, 20)}`,
        action: `content ${r.id}`,
      })),
    };
  }
  return formatSearch(result.results || []);
}

function formatGenerate(result) {
  return {
    markdown: `✍️ **Ready to Generate**\n\n• Type: ${result.content_type}\n• Tone: ${result.tone}\n• Prompt: ${result.prompt}${result.database_context ? '\n• Context: ' + result.database_context.database_title : ''}`,
    structured: { type: 'generate', ...result },
    suggestions: [],
  };
}

function formatDraft(result) {
  const md = `📝 **${result.template_name}: ${result.topic}**\n\n${result.sections.map(s => `### ${s}\n_[Content to be filled]_`).join('\n\n')}${result.related_workspace_content ? '\n\n📎 **Related:** ' + result.related_workspace_content.map(r => r.title).join(', ') : ''}`;

  return {
    markdown: md,
    structured: { type: 'draft', ...result },
    suggestions: [],
  };
}

function formatChat(result) {
  let md = '';
  if (result.workspace_context && result.workspace_context !== 'No related items found.') {
    md = `💬 **Workspace Context:**\n${result.workspace_context}`;
  } else {
    md = '💬 Processing your message...';
  }

  return {
    markdown: md,
    structured: { type: 'chat', ...result },
    suggestions: [],
  };
}

// ============================================================
// Help text for when no intent matches
// ============================================================
function getHelp(botName, databases) {
  const dbList = (databases || []).slice(0, 6).map(db =>
    `• **${db.title}**`
  ).join('\n');

  return {
    markdown: `👋 **${botName}** here! Try asking me:\n\n💬 _"What databases do I have?"_\n💬 _"Search for clients"_\n💬 _"Analyze the CRM"_\n💬 _"Draft a meeting agenda"_\n\n${dbList ? `📊 **Your databases:**\n${dbList}` : ''}`,
    structured: { type: 'help', databases: (databases || []).slice(0, 6) },
    suggestions: [
      { label: '📊 List databases', action: 'list databases' },
      { label: '🔍 Search workspace', action: 'search ' },
    ],
  };
}

module.exports = { format, getHelp };
