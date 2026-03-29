/**
 * AI-Powered Tools for MCP
 * These tools give the Notion agent conversational AI capabilities.
 * Supports both Anthropic (Claude) and OpenRouter (free models).
 */

const config = require('../config');
const notion = require('./notion');

// ============================================================
// Unified AI call — works with Anthropic OR OpenRouter
// ============================================================
let anthropicClient = null;

if (config.anthropicApiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
}

async function aiComplete(systemPrompt, messages, maxTokens = 2048) {
  if (anthropicClient) {
    // Use Anthropic
    const response = await anthropicClient.messages.create({
      model: config.claudeModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });
    return response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  if (config.openRouterApiKey) {
    // Use OpenRouter
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Try multiple models in case of rate limits
    const models = [
      config.openRouterModel,
      'nvidia/nemotron-3-nano-30b-a3b:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ];

    for (const model of models) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openRouterApiKey}`,
            'HTTP-Referer': config.openRouterSiteUrl || 'https://notion-mcp-chatbot.up.railway.app',
            'X-Title': config.botName,
          },
          body: JSON.stringify({
            model,
            messages: openaiMessages,
            max_tokens: maxTokens,
          }),
        });

        if (response.status === 429 || response.status === 503) continue;
        if (!response.ok) continue;

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      } catch {
        continue;
      }
    }

    throw new Error('All AI models are currently unavailable. Please try again.');
  }

  throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
}

// In-memory conversation store for MCP sessions
const conversations = new Map();

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, conv] of conversations) {
    if (conv.lastAccess < cutoff) conversations.delete(id);
  }
}, 60 * 60 * 1000);

// --- AI Tool Implementations ---

async function chatWithAI({ message, conversation_id, context }) {
  const convId = conversation_id || 'default';

  if (!conversations.has(convId)) {
    conversations.set(convId, { messages: [], lastAccess: Date.now() });
  }

  const conv = conversations.get(convId);
  conv.lastAccess = Date.now();
  conv.messages.push({ role: 'user', content: message });

  if (conv.messages.length > 30) {
    conv.messages = conv.messages.slice(-30);
  }

  const systemPrompt = `You are a helpful AI assistant integrated into a Notion workspace agent. You have access to the user's Notion data and can help with analysis, writing, planning, and answering questions.

${context ? `Context provided:\n${context}` : ''}

Be concise, helpful, and actionable. Use markdown formatting when appropriate.`;

  const reply = await aiComplete(systemPrompt, conv.messages);
  conv.messages.push({ role: 'assistant', content: reply });

  return {
    reply,
    conversation_id: convId,
    message_count: conv.messages.length,
  };
}

async function summarizePage({ page_id, style }) {
  const [page, content] = await Promise.all([
    notion.getPage(page_id),
    notion.getPageContent(page_id),
  ]);

  const format = style || 'brief';
  const prompt = format === 'detailed'
    ? 'Provide a detailed summary of this Notion page, including all key points, decisions, and action items.'
    : format === 'bullets'
    ? 'Summarize this Notion page as concise bullet points.'
    : 'Provide a brief 2-3 sentence summary of this Notion page.';

  const summary = await aiComplete(
    'You are a professional summarizer. Be concise and accurate.',
    [{ role: 'user', content: `${prompt}\n\nPage title: ${page.title}\n\nPage content:\n${content}` }],
    1024
  );

  return { page_title: page.title, page_id: page.id, summary, style: format };
}

async function generateContent({ prompt, type, database_id, tone }) {
  let contextInfo = '';

  if (database_id) {
    try {
      const schema = await notion.getDatabaseSchema(database_id);
      contextInfo = `\nThis content is for a Notion database called "${schema.title}" with these fields: ${Object.keys(schema.schema).join(', ')}.`;
    } catch {}
  }

  const contentType = type || 'general';
  const contentTone = tone || 'professional';

  const content = await aiComplete(
    `You are a content creator. Generate ${contentType} content with a ${contentTone} tone.${contextInfo}\n\nOutput clean, well-formatted markdown. Be creative but accurate.`,
    [{ role: 'user', content: prompt }]
  );

  return { content, type: contentType, tone: contentTone };
}

async function analyzeDatabase({ database_id, question }) {
  const [schema, data] = await Promise.all([
    notion.getDatabaseSchema(database_id),
    notion.queryDatabase(database_id, null, null, 100),
  ]);

  const analysis = await aiComplete(
    'You are a data analyst. Provide clear, data-driven answers with specific numbers and insights. Use markdown tables if helpful.',
    [{
      role: 'user',
      content: `Analyze this Notion database and answer the question.

Database: "${schema.title}"
Schema: ${JSON.stringify(schema.schema, null, 2)}

Data (${data.total} rows):
${JSON.stringify(data.results.map(r => r.properties), null, 2)}

Question: ${question}`,
    }]
  );

  return { database: schema.title, total_rows: data.total, analysis };
}

async function smartSearch({ query, summarize }) {
  const results = await notion.searchNotion(query);

  if (!summarize || results.length === 0) {
    return { query, results, total: results.length };
  }

  const topResults = results.slice(0, 3);
  const details = [];

  for (const item of topResults) {
    if (item.type === 'page') {
      try {
        const content = await notion.getPageContent(item.id);
        details.push({ title: item.title, content: content.substring(0, 1000) });
      } catch {
        details.push({ title: item.title, content: '[could not read]' });
      }
    }
  }

  const summary = await aiComplete(
    'You are a research assistant. Summarize search results concisely.',
    [{
      role: 'user',
      content: `The user searched for "${query}" in their Notion workspace. Summarize what was found:\n\n${details.map(d => `## ${d.title}\n${d.content}`).join('\n\n')}\n\nProvide a concise overview of the relevant information found.`,
    }],
    1024
  );

  return { query, total_found: results.length, summary, top_results: topResults };
}

async function draftFromTemplate({ template_type, topic, details }) {
  const templates = {
    'meeting-notes': 'Generate structured meeting notes with: Attendees, Agenda, Discussion Points, Decisions Made, Action Items (with owners and deadlines).',
    'project-brief': 'Generate a project brief with: Overview, Objectives, Scope, Timeline, Team, Risks, Success Metrics.',
    'blog-post': 'Generate a blog post outline with: Title, Hook, Main Sections (3-5), Key Points per section, Conclusion, CTA.',
    'weekly-report': 'Generate a weekly status report with: Highlights, Completed Tasks, In Progress, Blockers, Next Week Plan.',
    'sop': 'Generate a Standard Operating Procedure with: Purpose, Scope, Prerequisites, Step-by-step Instructions, Troubleshooting.',
    'proposal': 'Generate a business proposal with: Executive Summary, Problem Statement, Proposed Solution, Implementation Plan, Budget, Timeline.',
    'custom': "Generate content based on the user's description.",
  };

  const templatePrompt = templates[template_type] || templates['custom'];

  const content = await aiComplete(
    'You are a professional content writer. Generate well-structured, ready-to-use Notion page content in markdown format.',
    [{ role: 'user', content: `${templatePrompt}\n\nTopic: ${topic}\n${details ? `Additional details: ${details}` : ''}` }]
  );

  return { template_type, topic, content };
}

// --- Tool Definitions ---

const aiTools = [
  {
    name: 'chat_with_ai',
    description: 'Have a conversation with AI. Supports multi-turn conversations with memory. Use this for questions, brainstorming, analysis, or any conversational interaction.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The message to send to the AI' },
        conversation_id: { type: 'string', description: 'Optional conversation ID to continue a previous conversation. Omit to start a new one.' },
        context: { type: 'string', description: 'Optional context to provide (e.g., page content, database info)' },
      },
      required: ['message'],
    },
  },
  {
    name: 'summarize_page',
    description: 'Summarize the content of a Notion page using AI. Returns a concise summary.',
    input_schema: {
      type: 'object',
      properties: {
        page_id: { type: 'string', description: 'The Notion page ID to summarize' },
        style: { type: 'string', enum: ['brief', 'detailed', 'bullets'], description: 'Summary style: brief (2-3 sentences), detailed (full summary), or bullets (bullet points)' },
      },
      required: ['page_id'],
    },
  },
  {
    name: 'generate_content',
    description: 'Generate content using AI. Can create blog posts, reports, descriptions, emails, and more. Optionally provide a database_id for context-aware generation.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What content to generate' },
        type: { type: 'string', description: 'Content type: blog-post, report, email, description, social-post, or general' },
        database_id: { type: 'string', description: 'Optional database ID for context-aware content generation' },
        tone: { type: 'string', description: 'Tone of voice: professional, casual, formal, friendly, or persuasive' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'analyze_database',
    description: 'Analyze a Notion database using AI. Ask questions about your data and get insights, trends, and summaries.',
    input_schema: {
      type: 'object',
      properties: {
        database_id: { type: 'string', description: 'The Notion database ID to analyze' },
        question: { type: 'string', description: 'What do you want to know about the data? e.g., "What are the top priorities?" or "How many tasks are overdue?"' },
      },
      required: ['database_id', 'question'],
    },
  },
  {
    name: 'smart_search',
    description: 'Search Notion with AI-powered summarization. Finds relevant pages and optionally summarizes the results.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        summarize: { type: 'boolean', description: 'Set to true to get an AI summary of the top results (default: false)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'draft_from_template',
    description: 'Generate a ready-to-use document from a template type. Creates structured content that can be pasted directly into Notion.',
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
  // Check if ANY AI provider is available
  if (!config.hasAI) return null;

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
