/**
 * Context Memory — Per-session entity tracking for follow-up resolution.
 *
 * Tracks: last tool called, last entity mentioned (database/page),
 * and all databases/pages referenced in the session.
 * Enables: "query that database", "show me more", "analyze it"
 */

const sessions = new Map();

// Cleanup every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, ctx] of sessions) {
    if (ctx.lastAccess < cutoff) sessions.delete(id);
  }
}, 30 * 60 * 1000);

function get(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      lastTool: null,
      lastEntity: null,        // { type: 'database'|'page', id, name }
      mentionedEntities: [],   // [{ type, id, name, timestamp }]
      lastAccess: Date.now(),
    });
  }
  const ctx = sessions.get(sessionId);
  ctx.lastAccess = Date.now();
  return ctx;
}

function update(sessionId, tool, result) {
  const ctx = get(sessionId);
  ctx.lastTool = tool;

  // Extract entity from result
  let entity = null;

  if (tool === 'list_databases' && Array.isArray(result)) {
    // Don't set a single entity for list operations
  } else if (tool === 'get_database_schema' && result?.id) {
    entity = { type: 'database', id: result.id, name: result.title };
  } else if (tool === 'query_database' && result?.database_id) {
    entity = { type: 'database', id: result.database_id, name: result.database_title || 'Database' };
  } else if (tool === 'analyze_database' && result?.database_id) {
    entity = { type: 'database', id: result.database_id, name: result.database };
  } else if (tool === 'get_page' && result?.id) {
    entity = { type: 'page', id: result.id, name: result.title };
  } else if (tool === 'get_page_content' && result) {
    // Content returns a string, no entity to track
  } else if (tool === 'summarize_page' && result?.page_id) {
    entity = { type: 'page', id: result.page_id, name: result.page_title };
  } else if (tool === 'create_page' && result?.id) {
    entity = { type: 'page', id: result.id, name: result.title || 'New page' };
  } else if (tool === 'search_notion' && Array.isArray(result) && result.length > 0) {
    // Set first result as entity
    const first = result[0];
    entity = { type: first.type === 'database' ? 'database' : 'page', id: first.id, name: first.title };
  } else if (tool === 'smart_search' && result?.enriched_results?.length > 0) {
    const first = result.enriched_results[0];
    entity = { type: first.type === 'database' ? 'database' : 'page', id: first.id, name: first.title };
  }

  if (entity) {
    ctx.lastEntity = entity;
    // Add to mentioned list (avoid duplicates)
    if (!ctx.mentionedEntities.find(e => e.id === entity.id)) {
      ctx.mentionedEntities.push({ ...entity, timestamp: Date.now() });
      // Keep only last 10
      if (ctx.mentionedEntities.length > 10) {
        ctx.mentionedEntities = ctx.mentionedEntities.slice(-10);
      }
    }
  }
}

/**
 * Resolve pronoun/reference to an entity
 * "that database", "it", "the CRM", "this page"
 */
function resolveReference(sessionId, text) {
  const ctx = get(sessionId);
  const lower = text.toLowerCase();

  // Pronoun patterns
  const pronouns = ['it', 'that', 'this', 'the same', 'هذا', 'هذه', 'ذلك', 'نفس'];
  const hasPronoun = pronouns.some(p => lower.includes(p));

  // Type hints
  const wantsDatabase = /database|db|داتا|قاعد/i.test(lower);
  const wantsPage = /page|صفحة/i.test(lower);

  if (hasPronoun || (!wantsDatabase && !wantsPage && ctx.lastEntity)) {
    if (wantsDatabase && ctx.lastEntity?.type === 'database') {
      return ctx.lastEntity;
    }
    if (wantsPage && ctx.lastEntity?.type === 'page') {
      return ctx.lastEntity;
    }
    // No type hint — return last entity
    if (hasPronoun && ctx.lastEntity) {
      return ctx.lastEntity;
    }
  }

  // Search mentioned entities by name
  if (ctx.mentionedEntities.length > 0) {
    const tokens = lower.split(/\s+/).filter(t => t.length >= 3);
    for (const entity of [...ctx.mentionedEntities].reverse()) {
      const entityName = entity.name.toLowerCase();
      for (const token of tokens) {
        if (entityName.includes(token)) return entity;
      }
    }
  }

  return null;
}

function clear(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { get, update, resolveReference, clear };
