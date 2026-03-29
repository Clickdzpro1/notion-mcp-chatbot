/**
 * Intent Engine — Keyword-scoring intent resolver.
 *
 * Every tool competes for every message. Highest score above threshold wins.
 * Supports: keyword matching, fuzzy matching, context bonuses, database name resolution.
 * Runs in < 1ms. Zero external dependencies.
 */

const dbCache = require('./database-cache');
const contextMemory = require('./context-memory');

// ============================================================
// Tool Intent Definitions
// ============================================================
const INTENTS = [
  {
    tool: 'list_databases',
    keywords: {
      primary: ['databases', 'database', 'داتابيز', 'داتابيزات', 'قواعد', 'داتا'],
      action: ['list', 'show', 'what', 'which', 'have', 'display', 'get', 'all', 'عرض', 'اعرض', 'واش', 'شنو', 'كل'],
      qualifier: ['my', 'available', 'access', 'عندي', 'متاح'],
    },
    minScore: 4,
    args: () => ({}),
  },
  {
    tool: 'search_notion',
    keywords: {
      primary: ['search', 'find', 'look', 'where', 'ابحث', 'بحث', 'دور', 'وين', 'فين', 'لقى'],
      action: [],
      qualifier: [],
    },
    minScore: 2,
    extractQuery: true,
    args: (msg, tokens) => ({ query: extractQueryText(msg, ['search', 'find', 'look', 'for', 'where', 'ابحث', 'عن', 'بحث', 'دور', 'على', 'وين', 'فين']) }),
  },
  {
    tool: 'get_database_schema',
    keywords: {
      primary: ['schema', 'structure', 'columns', 'fields', 'properties', 'هيكل', 'أعمدة', 'حقول'],
      action: ['show', 'get', 'view', 'what', 'عرض'],
      qualifier: ['of', 'for', 'database'],
    },
    minScore: 3,
    needsDatabase: true,
    args: (msg, tokens, ctx) => ({ database_id: ctx.resolvedDbId }),
  },
  {
    tool: 'query_database',
    keywords: {
      primary: ['query', 'rows', 'entries', 'records', 'data', 'items', 'سطور', 'بيانات', 'سجلات'],
      action: ['get', 'fetch', 'show', 'list', 'latest', 'recent', 'all', 'اجلب', 'عرض', 'آخر'],
      qualifier: ['from', 'in', 'of'],
    },
    minScore: 3,
    needsDatabase: true,
    args: (msg, tokens, ctx) => ({ database_id: ctx.resolvedDbId }),
  },
  {
    tool: 'get_page',
    keywords: {
      primary: ['page', 'صفحة'],
      action: ['get', 'show', 'view', 'open', 'عرض'],
      qualifier: ['properties', 'details', 'info'],
    },
    minScore: 3,
    needsPageId: true,
    args: (msg, tokens, ctx) => ({ page_id: ctx.resolvedPageId }),
  },
  {
    tool: 'get_page_content',
    keywords: {
      primary: ['content', 'read', 'text', 'body', 'محتوى', 'اقرأ', 'نص'],
      action: ['get', 'show', 'view', 'read', 'عرض'],
      qualifier: ['page', 'of', 'full'],
    },
    minScore: 3,
    needsPageId: true,
    args: (msg, tokens, ctx) => ({ page_id: ctx.resolvedPageId }),
  },
  {
    tool: 'create_page',
    keywords: {
      primary: ['create', 'add', 'new', 'insert', 'أنشئ', 'ضيف', 'جديد', 'أضف'],
      action: ['page', 'row', 'entry', 'record', 'item', 'client', 'task', 'صفحة', 'سطر', 'عميل', 'مهمة'],
      qualifier: ['to', 'in', 'في', 'إلى'],
    },
    minScore: 4,
    needsDatabase: true,
    args: (msg, tokens, ctx) => ({ database_id: ctx.resolvedDbId, properties: {} }),
  },
  {
    tool: 'update_page',
    keywords: {
      primary: ['update', 'edit', 'change', 'modify', 'set', 'عدّل', 'غيّر', 'حدّث'],
      action: ['page', 'row', 'entry', 'صفحة', 'سطر'],
      qualifier: [],
    },
    minScore: 4,
    needsPageId: true,
    args: (msg, tokens, ctx) => ({ page_id: ctx.resolvedPageId, properties: {} }),
  },
  {
    tool: 'analyze_database',
    keywords: {
      primary: ['analyze', 'analysis', 'stats', 'statistics', 'insights', 'حلل', 'تحليل', 'إحصائيات'],
      action: ['show', 'get', 'give', 'how', 'many', 'much', 'total', 'average', 'كم', 'عدد', 'مجموع'],
      qualifier: ['data', 'numbers', 'overview'],
    },
    minScore: 3,
    needsDatabase: true,
    extractQuestion: true,
    args: (msg, tokens, ctx) => ({ database_id: ctx.resolvedDbId, question: msg }),
  },
  {
    tool: 'summarize_page',
    keywords: {
      primary: ['summarize', 'summary', 'tldr', 'brief', 'لخص', 'ملخص', 'اختصر'],
      action: ['give', 'show', 'get', 'عرض'],
      qualifier: ['page', 'content'],
    },
    minScore: 3,
    needsPageId: true,
    args: (msg, tokens, ctx) => ({ page_id: ctx.resolvedPageId, style: 'brief' }),
  },
  {
    tool: 'smart_search',
    keywords: {
      primary: ['smart', 'deep', 'thorough', 'detailed'],
      action: ['search', 'find', 'look', 'بحث'],
      qualifier: ['with', 'preview', 'content'],
    },
    minScore: 4,
    extractQuery: true,
    args: (msg, tokens) => ({ query: extractQueryText(msg, ['smart', 'deep', 'search', 'find', 'for']), summarize: true }),
  },
  {
    tool: 'generate_content',
    keywords: {
      primary: ['generate', 'write', 'compose', 'draft', 'اكتب', 'أنشئ', 'حرر'],
      action: ['content', 'text', 'post', 'email', 'report', 'محتوى', 'نص', 'مقال'],
      qualifier: ['about', 'for', 'على', 'عن'],
    },
    minScore: 4,
    extractQuery: true,
    args: (msg) => ({ prompt: msg }),
  },
  {
    tool: 'draft_from_template',
    keywords: {
      primary: ['template', 'draft', 'قالب'],
      action: ['meeting', 'project', 'blog', 'weekly', 'sop', 'proposal', 'اجتماع', 'مشروع', 'تقرير'],
      qualifier: ['notes', 'brief', 'report', 'plan'],
    },
    minScore: 4,
    args: (msg, tokens) => {
      const typeMap = {
        meeting: 'meeting-notes', اجتماع: 'meeting-notes',
        project: 'project-brief', مشروع: 'project-brief',
        blog: 'blog-post', مقال: 'blog-post',
        weekly: 'weekly-report', أسبوعي: 'weekly-report',
        sop: 'sop',
        proposal: 'proposal', عرض: 'proposal',
      };
      const found = tokens.find(t => typeMap[t.toLowerCase()]);
      const templateType = found ? typeMap[found.toLowerCase()] : 'custom';
      return { template_type: templateType, topic: extractQueryText(msg, Object.keys(typeMap).concat(['draft', 'template', 'create', 'make', 'قالب'])) || 'General' };
    },
  },
  {
    tool: 'chat_with_ai',
    keywords: {
      primary: ['chat', 'talk', 'conversation', 'discuss', 'محادثة', 'تكلم'],
      action: ['start', 'begin', 'continue', 'ابدأ'],
      qualifier: [],
    },
    minScore: 4,
    args: (msg) => ({ message: msg }),
  },
  // --- Workflow trigger (highest priority when matched) ---
  {
    tool: '__start_workflow__',
    keywords: {
      primary: ['add', 'create', 'new', 'insert', 'أضف', 'ضيف', 'جديد', 'أنشئ', 'سجّل'],
      action: ['client', 'customer', 'task', 'invoice', 'lead', 'note', 'entry', 'record', 'row',
               'عميل', 'مهمة', 'فاتورة', 'ليد', 'ملاحظة', 'سطر', 'عنصر', 'محتوى', 'content',
               'order', 'appointment', 'موعد', 'طلب', 'منتج', 'product'],
      qualifier: ['to', 'in', 'for', 'في', 'إلى', 'named', 'called', 'اسمه', 'اسمها'],
    },
    minScore: 4,
    priorityBonus: 3, // Always beats create_page when both match
    needsDatabase: false, // We handle missing DB in startWorkflowFromIntent
    args: (msg, tokens, ctx) => ({ database_id: ctx.resolvedDbId, message: msg }),
  },
];

// ============================================================
// Scoring Engine
// ============================================================
function resolve(message, sessionId) {
  const lower = message.toLowerCase().trim();
  const tokens = tokenize(lower);

  // Context from memory
  const ctx = sessionId ? contextMemory.get(sessionId) : {};
  const lastEntity = ctx.lastEntity || null;

  // Try to find database references in message
  const dbMatch = dbCache.resolveDatabase(lower);
  const dbMatches = dbCache.findDatabases(tokens);

  // Try to find page IDs in message (UUID pattern)
  const pageIdMatch = lower.match(/[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}/);
  const resolvedPageId = pageIdMatch ? pageIdMatch[0] : (lastEntity?.type === 'page' ? lastEntity.id : null);

  // Resolve database ID
  let resolvedDbId = null;
  if (dbMatch) {
    resolvedDbId = dbMatch.id;
  } else if (dbMatches.length > 0) {
    resolvedDbId = dbMatches[0].id;
  } else if (pageIdMatch) {
    // Might be a database ID disguised
    resolvedDbId = pageIdMatch[0];
  } else if (lastEntity?.type === 'database') {
    resolvedDbId = lastEntity.id;
  }

  // Score each intent
  const scores = INTENTS.map(intent => {
    let score = 0;

    // Keyword scoring
    for (const token of tokens) {
      if (intent.keywords.primary.includes(token)) score += 3;
      if (intent.keywords.action.includes(token)) score += 2;
      if (intent.keywords.qualifier.includes(token)) score += 1;
    }

    // Database name bonus — if user mentions a database by name and intent needs one
    if (intent.needsDatabase && dbMatch) {
      score += 3;
    } else if (intent.needsDatabase && dbMatches.length > 0) {
      score += 2;
    }

    // Context bonus — if this tool naturally follows the last tool
    if (ctx.lastTool && isNaturalFollow(ctx.lastTool, intent.tool)) {
      score += 1;
    }

    // Pronoun/reference bonus
    if (hasPronounReference(lower) && lastEntity) {
      if (intent.needsDatabase && lastEntity.type === 'database') score += 3;
      if (intent.needsPageId && lastEntity.type === 'page') score += 3;
    }

    // Priority bonus — only when primary keywords actually matched
    if (intent.priorityBonus) {
      const hasPrimary = tokens.some(t => intent.keywords.primary.includes(t));
      if (hasPrimary) score += intent.priorityBonus;
    }

    // Penalty: if intent needs database/page ID and we don't have one
    if (intent.needsDatabase && !resolvedDbId) score -= 2;
    if (intent.needsPageId && !resolvedPageId) score -= 2;

    return { intent, score };
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (best.score >= best.intent.minScore) {
    const resolveCtx = { resolvedDbId, resolvedPageId, dbMatch, dbMatches, lastEntity };
    const args = best.intent.args(message, tokens, resolveCtx);

    return {
      tool: best.intent.tool,
      args,
      confidence: Math.min(best.score / 10, 1),
      score: best.score,
      resolvedDb: dbMatch || (dbMatches.length > 0 ? { id: dbMatches[0].id, title: dbMatches[0].title } : null),
    };
  }

  // No intent matched — return null (fallback to search or help)
  return null;
}

// ============================================================
// Helpers
// ============================================================
function tokenize(text) {
  return text
    .replace(/[?.!,;:()[\]{}"""''،؟!]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 1)
    .map(t => t.toLowerCase());
}

function extractQueryText(msg, stopWords) {
  const tokens = msg.split(/\s+/);
  const filtered = tokens.filter(t => !stopWords.includes(t.toLowerCase()));
  return filtered.join(' ').trim() || msg;
}

function hasPronounReference(text) {
  const pronouns = ['it', 'that', 'this', 'them', 'those', 'the same', 'again', 'more',
    'هذا', 'هذه', 'ذلك', 'نفس', 'زيد', 'بالزاف'];
  return pronouns.some(p => text.includes(p));
}

function isNaturalFollow(lastTool, currentTool) {
  const follows = {
    'list_databases': ['query_database', 'get_database_schema', 'analyze_database'],
    'get_database_schema': ['query_database', 'create_page', 'analyze_database'],
    'query_database': ['get_page', 'get_page_content', 'update_page', 'analyze_database'],
    'search_notion': ['get_page', 'get_page_content', 'summarize_page', 'query_database'],
    'get_page': ['get_page_content', 'summarize_page', 'update_page'],
    'get_page_content': ['summarize_page', 'update_page'],
    'analyze_database': ['query_database', 'create_page'],
    'smart_search': ['get_page', 'get_page_content', 'summarize_page'],
  };
  return follows[lastTool]?.includes(currentTool) || false;
}

module.exports = { resolve, INTENTS };
