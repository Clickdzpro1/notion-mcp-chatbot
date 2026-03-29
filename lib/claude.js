/**
 * Chat Orchestrator — Thin layer connecting intent engine → tools → formatter.
 * Zero AI dependencies. Fast. Intelligent routing via keyword scoring.
 */

const config = require('../config');
const { executeTool } = require('./tools');
const intentEngine = require('./intent-engine');
const resultFormatter = require('./result-formatter');
const contextMemory = require('./context-memory');
const dbCache = require('./database-cache');

// Greeting detection
const GREETING_PATTERNS = [
  /^(hi|hey|hello|yo|sup|hola|salut|bonjour|ciao)\b/i,
  /^(مرحبا|سلام|أهلا|صباح|مساء|وش|كيفك|لاباس|salam|wesh|sahit)/i,
  /^(good\s*(morning|afternoon|evening|day))/i,
  /^(how are you|what's up|what can you do|help me|help)\s*[?!.]?\s*$/i,
  /^(can u|can you).*(help|find something|do)\s*[?.]?\s*$/i,
];

function isGreeting(msg) {
  return GREETING_PATTERNS.some(p => p.test(msg.trim()));
}

/**
 * Main chat function — processes a user message and returns a response.
 */
async function chat(conversationHistory, userMessage, sessionId) {
  const msg = userMessage.trim();

  // Ensure database cache is fresh
  await dbCache.ensureFresh();

  // 1. Check if it's a greeting
  if (isGreeting(msg)) {
    const help = resultFormatter.getHelp(config.botName, dbCache.getAll());
    conversationHistory.push({ role: 'user', content: msg });
    conversationHistory.push({ role: 'assistant', content: help.markdown });
    return { response: help.markdown, structured: help.structured, suggestions: help.suggestions, conversationHistory };
  }

  // 2. Run intent engine
  const intent = intentEngine.resolve(msg, sessionId);

  if (intent) {
    try {
      const result = await executeTool(intent.tool, intent.args);
      const formatted = resultFormatter.format(intent.tool, result, intent.resolvedDb);

      // Update context memory
      if (sessionId) {
        contextMemory.update(sessionId, intent.tool, result);
      }

      conversationHistory.push({ role: 'user', content: msg });
      conversationHistory.push({ role: 'assistant', content: formatted.markdown });

      return {
        response: formatted.markdown,
        structured: formatted.structured,
        suggestions: formatted.suggestions,
        tool: intent.tool,
        confidence: intent.confidence,
        conversationHistory,
      };
    } catch (err) {
      const errorMsg = `❌ Error: ${err.message}`;
      conversationHistory.push({ role: 'user', content: msg });
      conversationHistory.push({ role: 'assistant', content: errorMsg });
      return { response: errorMsg, structured: null, suggestions: [], conversationHistory };
    }
  }

  // 3. No intent matched — try search as fallback
  if (msg.length > 3) {
    try {
      const results = await executeTool('search_notion', { query: msg });
      if (Array.isArray(results) && results.length > 0) {
        const formatted = resultFormatter.format('search_notion', results);

        if (sessionId) {
          contextMemory.update(sessionId, 'search_notion', results);
        }

        formatted.markdown = `🔍 I searched your workspace for _"${msg}"_:\n\n${formatted.markdown}`;

        conversationHistory.push({ role: 'user', content: msg });
        conversationHistory.push({ role: 'assistant', content: formatted.markdown });
        return {
          response: formatted.markdown,
          structured: formatted.structured,
          suggestions: formatted.suggestions,
          tool: 'search_notion',
          confidence: 0.3,
          conversationHistory,
        };
      }
    } catch {}
  }

  // 4. Nothing found — show help
  const help = resultFormatter.getHelp(config.botName, dbCache.getAll());
  help.markdown = `🤔 I'm not sure what you mean by _"${msg}"_.\n\n${help.markdown}`;

  conversationHistory.push({ role: 'user', content: msg });
  conversationHistory.push({ role: 'assistant', content: help.markdown });
  return { response: help.markdown, structured: help.structured, suggestions: help.suggestions, conversationHistory };
}

module.exports = { chat, provider: 'intent-engine' };
