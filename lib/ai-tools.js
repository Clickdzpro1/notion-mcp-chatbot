/**
 * Smart Data Tools for MCP
 *
 * These tools fetch, structure, and enrich Notion data — NO external AI needed.
 * When called by AGENT ZERO (Opus 4.6), it does the actual thinking.
 * When called from the chat UI, the command router handles formatting.
 *
 * Zero dependencies. Zero API costs. Maximum speed.
 */

const notion = require('./notion');

// In-memory conversation store
const conversations = new Map();

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, conv] of conversations) {
    if (conv.lastAccess < cutoff) conversations.delete(id);
  }
}, 60 * 60 * 1000);

// --- Tool Implementations ---

async function chatWithAI({ message, conversation_id, context }) {
  // Without an external AI, this tool provides workspace context for the agent.
  // AGENT ZERO (Opus 4.6) handles the actual conversation.
  const convId = conversation_id || 'default';

  if (!conversations.has(convId)) {
    conversations.set(convId, { messages: [], lastAccess: Date.now() });
  }

  const conv = conversations.get(convId);
  conv.lastAccess = Date.now();
  conv.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

  if (conv.messages.length > 30) {
    conv.messages = conv.messages.slice(-30);
  }

  // Enrich with workspace context
  let workspaceContext = '';
  try {
    const results = await notion.searchNotion(message.split(' ').slice(0, 3).join(' '));
    if (results.length > 0) {
      workspaceContext = `\n\nRelated items found in workspace:\n${results.slice(0, 5).map(r => `- ${r.title} (${r.type}, ID: ${r.id})`).join('\n')}`;
    }
  } catch {}

  return {
    conversation_id: convId,
    message_count: conv.messages.length,
    recent_messages: conv.messages.slice(-5),
    workspace_context: workspaceContext || 'No related items found.',
    hint: 'Use the conversation history and workspace context to respond to the user.',
  };
}

async function summarizePage({ page_id, style }) {
  const [page, content] = await Promise.all([
    notion.getPage(page_id),
    notion.getPageContent(page_id),
  ]);

  const format = style || 'brief';

  // Extract key stats
  const wordCount = content.split(/\s+/).length;
  const lineCount = content.split('\n').filter(l => l.trim()).length;
  const headings = content.split('\n').filter(l => l.startsWith('#'));
  const links = content.match(/https?:\/\/[^\s)]+/g) || [];

  return {
    page_title: page.title,
    page_id: page.id,
    requested_style: format,
    properties: page.properties || {},
    content,
    stats: {
      word_count: wordCount,
      line_count: lineCount,
      headings: headings.length,
      links: links.length,
    },
    sections: headings.map(h => h.replace(/^#+\s*/, '')),
    instruction: `Summarize this content in "${format}" style. Brief = 2-3 sentences. Detailed = full summary with key points. Bullets = concise bullet points.`,
  };
}

async function generateContent({ prompt, type, database_id, tone }) {
  let context = {};

  if (database_id) {
    try {
      const schema = await notion.getDatabaseSchema(database_id);
      const sample = await notion.queryDatabase(database_id, null, null, 3);
      context = {
        database_title: schema.title,
        schema: schema.schema,
        sample_rows: sample.results.slice(0, 3).map(r => r.properties),
        total_rows: sample.total,
      };
    } catch (err) {
      context = { error: err.message };
    }
  }

  return {
    prompt,
    content_type: type || 'general',
    tone: tone || 'professional',
    database_context: Object.keys(context).length > 0 ? context : null,
    instruction: `Generate ${type || 'general'} content with a ${tone || 'professional'} tone based on the prompt. Use the database context if provided for accuracy.`,
  };
}

async function analyzeDatabase({ database_id, question }) {
  const [schema, data] = await Promise.all([
    notion.getDatabaseSchema(database_id),
    notion.queryDatabase(database_id, null, null, 100),
  ]);

  // Pre-compute basic stats
  const stats = {};
  const propTypes = schema.schema || {};

  for (const [propName, propInfo] of Object.entries(propTypes)) {
    const values = data.results.map(r => r.properties?.[propName]).filter(v => v != null && v !== '');

    if (propInfo.type === 'number') {
      const nums = values.map(Number).filter(n => !isNaN(n));
      if (nums.length > 0) {
        stats[propName] = {
          type: 'number',
          count: nums.length,
          sum: nums.reduce((a, b) => a + b, 0),
          avg: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 100) / 100,
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    } else if (propInfo.type === 'select' || propInfo.type === 'status') {
      const counts = {};
      values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
      stats[propName] = { type: propInfo.type, distribution: counts };
    } else if (propInfo.type === 'checkbox') {
      const trueCount = values.filter(v => v === true || v === 'true').length;
      stats[propName] = { type: 'checkbox', checked: trueCount, unchecked: values.length - trueCount };
    }
  }

  return {
    database: schema.title,
    database_id,
    question,
    total_rows: data.total,
    schema: propTypes,
    computed_stats: stats,
    rows: data.results.map(r => r.properties),
    instruction: `Answer the question "${question}" using the data and computed stats provided. Be specific with numbers.`,
  };
}

async function smartSearch({ query, summarize }) {
  const results = await notion.searchNotion(query);

  if (!summarize || results.length === 0) {
    return { query, results, total: results.length };
  }

  // Fetch content of top results
  const enriched = [];
  for (const item of results.slice(0, 5)) {
    if (item.type === 'page') {
      try {
        const content = await notion.getPageContent(item.id);
        enriched.push({
          ...item,
          preview: content.substring(0, 500),
          word_count: content.split(/\s+/).length,
        });
      } catch {
        enriched.push({ ...item, preview: '[could not read]' });
      }
    } else {
      enriched.push(item);
    }
  }

  return {
    query,
    total_found: results.length,
    enriched_results: enriched,
    remaining: results.length > 5 ? results.length - 5 : 0,
    instruction: summarize ? `Summarize the key findings from these search results for "${query}".` : null,
  };
}

async function draftFromTemplate({ template_type, topic, details }) {
  const templates = {
    'meeting-notes': {
      name: 'Meeting Notes',
      sections: ['📋 Attendees', '🎯 Agenda', '💬 Discussion Points', '✅ Decisions Made', '📌 Action Items (Owner + Deadline)'],
    },
    'project-brief': {
      name: 'Project Brief',
      sections: ['📝 Overview', '🎯 Objectives', '📐 Scope', '📅 Timeline', '👥 Team', '⚠️ Risks', '📊 Success Metrics'],
    },
    'blog-post': {
      name: 'Blog Post',
      sections: ['🎣 Hook / Introduction', '📖 Main Section 1', '📖 Main Section 2', '📖 Main Section 3', '🎬 Conclusion', '📢 Call to Action'],
    },
    'weekly-report': {
      name: 'Weekly Report',
      sections: ['🌟 Highlights', '✅ Completed Tasks', '🔄 In Progress', '🚧 Blockers', '📋 Next Week Plan'],
    },
    'sop': {
      name: 'Standard Operating Procedure',
      sections: ['🎯 Purpose', '📐 Scope', '📋 Prerequisites', '📝 Step-by-step Instructions', '🔧 Troubleshooting', '📚 References'],
    },
    'proposal': {
      name: 'Business Proposal',
      sections: ['📄 Executive Summary', '❓ Problem Statement', '💡 Proposed Solution', '📋 Implementation Plan', '💰 Budget', '📅 Timeline'],
    },
    'custom': {
      name: 'Custom Document',
      sections: ['📝 Introduction', '📖 Main Content', '🎬 Conclusion'],
    },
  };

  const template = templates[template_type] || templates['custom'];

  // Try to get related workspace content
  let relatedContent = null;
  try {
    const results = await notion.searchNotion(topic);
    if (results.length > 0) {
      relatedContent = results.slice(0, 3).map(r => ({ title: r.title, type: r.type, id: r.id }));
    }
  } catch {}

  return {
    template_type,
    template_name: template.name,
    topic,
    details: details || null,
    sections: template.sections,
    related_workspace_content: relatedContent,
    instruction: `Generate a complete "${template.name}" document about "${topic}" using the section structure provided. Fill each section with relevant, detailed content.${details ? ` Additional requirements: ${details}` : ''}`,
  };
}

// --- Tool Definitions ---

const aiTools = [
  {
    name: 'chat_with_ai',
    description: 'Start or continue a conversation with workspace context. Automatically searches for related Notion content to enrich the response.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to process' },
        conversation_id: { type: 'string', description: 'Optional conversation ID to continue a previous conversation' },
        context: { type: 'string', description: 'Optional additional context' },
      },
      required: ['message'],
    },
  },
  {
    name: 'summarize_page',
    description: 'Fetch a Notion page with full content, stats, and structure for summarization. Returns the complete page data ready for analysis.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'The Notion page ID to summarize' },
        style: { type: 'string', enum: ['brief', 'detailed', 'bullets'], description: 'Summary style: brief, detailed, or bullets' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'generate_content',
    description: 'Prepare context and structure for content generation. Optionally fetches database schema and sample data for context-aware generation.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What content to generate' },
        type: { type: 'string', description: 'Content type: blog-post, report, email, description, social-post, or general' },
        database_id: { type: 'string', description: 'Optional database ID for context-aware content generation' },
        tone: { type: 'string', description: 'Tone: professional, casual, formal, friendly, or persuasive' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'analyze_database',
    description: 'Fetch and pre-analyze a Notion database. Returns all rows, schema, and computed statistics (sums, averages, distributions) for AI analysis.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'The Notion database ID to analyze' },
        question: { type: 'string', description: 'What to analyze, e.g., "What are the top priorities?" or "Total revenue this month?"' },
      },
      required: ['database_id', 'question'],
    },
  },
  {
    name: 'smart_search',
    description: 'Search Notion with enriched results. Fetches content previews from top results for deeper analysis.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        summarize: { type: 'boolean', description: 'Set true to fetch content previews from top results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'draft_from_template',
    description: 'Get a structured document template with sections and related workspace content. Ready for the AI to fill in with detailed content.',
    input_schema: {
      type: 'object',
      properties: {
        template_type: {
          type: 'string',
          enum: ['meeting-notes', 'project-brief', 'blog-post', 'weekly-report', 'sop', 'proposal', 'custom'],
          description: 'The type of template to generate',
        },
        topic: { type: 'string', description: 'The topic or subject for the content' },
        details: { type: 'string', description: 'Additional details or requirements' },
      },
      required: ['template_type', 'topic'],
    },
  },
];

// Dispatcher
async function executeAiTool(name, input) {
  switch (name) {
    case 'chat_with_ai': return await chatWithAI(input);
    case 'summarize_page': return await summarizePage(input);
    case 'generate_content': return await generateContent(input);
    case 'analyze_database': return await analyzeDatabase(input);
    case 'smart_search': return await smartSearch(input);
    case 'draft_from_template': return await draftFromTemplate(input);
    default: return null;
  }
}

module.exports = { aiTools, executeAiTool };
