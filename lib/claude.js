/**
 * Chat Orchestrator — Routes messages through:
 *   1. Active workflow (multi-step flows)
 *   2. Greeting detection
 *   3. Intent engine (keyword scoring)
 *   4. Fallback search
 *   5. Help
 *
 * Zero AI dependencies. Fast. Intelligent routing.
 */

const config = require('../config');
const { executeTool } = require('./tools');
const intentEngine = require('./intent-engine');
const resultFormatter = require('./result-formatter');
const contextMemory = require('./context-memory');
const dbCache = require('./database-cache');
const workflowEngine = require('./workflow-engine');
const onboarding = require('./onboarding');

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
 * Main chat function
 */
async function chat(conversationHistory, userMessage, sessionId) {
  const msg = userMessage.trim();

  await dbCache.ensureFresh();

  const ctx = sessionId ? contextMemory.get(sessionId) : {};

  // -------------------------------------------------------
  // 1. ACTIVE WORKFLOW — handle input for current step
  // -------------------------------------------------------
  if (ctx.workflow?.active) {
    const stepResult = await workflowEngine.processStep(ctx.workflow, msg);

    if (stepResult.action === 'cancelled') {
      ctx.workflow = null;
      return respond(conversationHistory, msg, stepResult.message, null, [
        { label: '📊 List databases', action: 'list databases' },
      ]);
    }

    if (stepResult.action === 'retry') {
      return respond(conversationHistory, msg, stepResult.message,
        stepResult.prompt?.structured || null,
        [{ label: '⏭️ Skip', action: 'skip' }, { label: '❌ Cancel', action: 'cancel' }]
      );
    }

    if (stepResult.action === 'next') {
      const prompt = stepResult.prompt;
      const suggestions = [];
      if (prompt.structured?.options) {
        prompt.structured.options.slice(0, 4).forEach(o => suggestions.push({ label: o, action: o }));
      }
      if (prompt.structured?.canSkip) suggestions.push({ label: '⏭️ Skip', action: 'skip' });
      suggestions.push({ label: '❌ Cancel', action: 'cancel' });

      return respond(conversationHistory, msg, prompt.text, prompt.structured, suggestions);
    }

    if (stepResult.action === 'completed') {
      ctx.workflow = null;
      const result = stepResult.result;
      const md = `${stepResult.message}\n\n📋 **Created entry:**\n${Object.entries(stepResult.collected).map(([k, v]) => `• **${k}:** ${v}`).join('\n')}\n\n🔗 [Open in Notion](${result?.url || '#'})`;

      if (sessionId && result) {
        contextMemory.update(sessionId, 'create_page', result);
      }

      return respond(conversationHistory, msg, md,
        { type: 'created', id: result?.id, url: result?.url, properties: stepResult.collected },
        [
          { label: '➕ Add another', action: `add entry to ${ctx.workflow?.databaseTitle || 'database'}` },
          { label: '📊 List databases', action: 'list databases' },
        ]
      );
    }

    if (stepResult.action === 'error') {
      ctx.workflow = null;
      return respond(conversationHistory, msg, stepResult.message, null, []);
    }
  }

  // -------------------------------------------------------
  // 2. ONBOARDING — first-time user experience
  // -------------------------------------------------------
  if (sessionId && onboarding.needsOnboarding(sessionId)) {
    const obResult = await onboarding.processStep(sessionId, msg);

    if (obResult.action === 'completed') {
      // Onboarding done — return the final message
      return respond(conversationHistory, msg, obResult.message, obResult.structured, obResult.suggestions);
    }

    if (obResult.autoAdvance) {
      // Auto-advance: run the next step immediately
      const next = await onboarding.processStep(sessionId, 'next');
      return respond(conversationHistory, msg, `${obResult.message}\n\n${next.message}`, next.structured, next.suggestions);
    }

    return respond(conversationHistory, msg, obResult.message, obResult.structured, obResult.suggestions);
  }

  // -------------------------------------------------------
  // 3. GREETING
  // -------------------------------------------------------
  if (isGreeting(msg)) {
    const help = resultFormatter.getHelp(config.botName, dbCache.getAll());
    return respond(conversationHistory, msg, help.markdown, help.structured, help.suggestions);
  }

  // -------------------------------------------------------
  // 3. INTENT ENGINE
  // -------------------------------------------------------
  const intent = intentEngine.resolve(msg, sessionId);

  if (intent) {
    // Special case: workflow trigger
    if (intent.tool === '__start_workflow__') {
      return await startWorkflowFromIntent(conversationHistory, msg, sessionId, intent, ctx);
    }

    try {
      const result = await executeTool(intent.tool, intent.args);
      const formatted = resultFormatter.format(intent.tool, result, intent.resolvedDb);

      if (sessionId) {
        contextMemory.update(sessionId, intent.tool, result);
      }

      return respond(conversationHistory, msg, formatted.markdown, formatted.structured, formatted.suggestions, intent.tool, intent.confidence);
    } catch (err) {
      return respond(conversationHistory, msg, `❌ Error: ${err.message}`, null, []);
    }
  }

  // -------------------------------------------------------
  // 4. FALLBACK SEARCH
  // -------------------------------------------------------
  if (msg.length > 3) {
    try {
      const results = await executeTool('search_notion', { query: msg });
      if (Array.isArray(results) && results.length > 0) {
        const formatted = resultFormatter.format('search_notion', results);
        if (sessionId) contextMemory.update(sessionId, 'search_notion', results);

        formatted.markdown = `🔍 I searched your workspace for _"${msg}"_:\n\n${formatted.markdown}`;
        return respond(conversationHistory, msg, formatted.markdown, formatted.structured, formatted.suggestions, 'search_notion', 0.3);
      }
    } catch {}
  }

  // -------------------------------------------------------
  // 5. HELP
  // -------------------------------------------------------
  const help = resultFormatter.getHelp(config.botName, dbCache.getAll());
  help.markdown = `🤔 I'm not sure what you mean by _"${msg}"_.\n\n${help.markdown}`;
  return respond(conversationHistory, msg, help.markdown, help.structured, help.suggestions);
}

/**
 * Start a workflow from an intent match
 */
async function startWorkflowFromIntent(history, msg, sessionId, intent, ctx) {
  let dbId = intent.args.database_id;

  // If no database resolved from cache, try matching workflow template keywords
  if (!dbId) {
    const tokens = msg.toLowerCase().split(/\s+/);
    for (const [key, template] of Object.entries(workflowEngine.WORKFLOW_TEMPLATES)) {
      if (template.match.some(m => tokens.some(t => t.includes(m) || m.includes(t)))) {
        // Found a template match — find the database by template keywords
        const allDbs = dbCache.getAll();
        for (const db of allDbs) {
          const dbLower = db.title.toLowerCase();
          if (template.match.some(m => dbLower.includes(m))) {
            dbId = db.id;
            break;
          }
        }
        break;
      }
    }
  }

  if (!dbId) {
    return respond(conversationHistory, msg,
      '❓ Which database do you want to add to? Here are your databases:',
      { type: 'database_list', items: dbCache.getAll() },
      dbCache.getAll().slice(0, 6).map(db => ({ label: `➕ ${db.title.substring(0, 25)}`, action: `add entry to ${db.id}` }))
    );
  }

  // Find the database title
  const db = dbCache.getAll().find(d => d.id === dbId);
  const dbTitle = db?.title || '';

  // Check for a built-in workflow template
  const templateKey = workflowEngine.findWorkflowTemplate(dbTitle);
  const result = await workflowEngine.startWorkflow(dbId, templateKey);

  if (result.error) {
    return respond(conversationHistory, msg, `❌ ${result.error}`, null, []);
  }

  // Save workflow to session
  if (sessionId) {
    ctx.workflow = result.workflow;
  }

  // Extract initial value from the original message (e.g., "add client named Ahmed" → name = Ahmed)
  // Only extract if the name pattern is explicitly used (e.g., "named Ahmed")
  const extractedName = extractExplicitName(msg);
  if (extractedName && result.workflow.steps[0]?.type === 'title') {
    // Auto-fill the first step
    result.workflow.collected[result.workflow.steps[0].field] = extractedName;
    result.workflow.currentStep = 1;

    if (result.workflow.currentStep >= result.workflow.steps.length) {
      const completeResult = await workflowEngine.processStep(result.workflow, 'done');
      return respond(conversationHistory, msg, completeResult.message || '✅ Created!', null, []);
    }

    const nextPrompt = workflowEngine.processStep.__formatForDisplay
      ? workflowEngine.processStep.__formatForDisplay(result.workflow)
      : null;

    // Get the next step prompt
    const step = result.workflow.steps[result.workflow.currentStep];
    const total = result.workflow.steps.length;
    const current = result.workflow.currentStep + 1;
    let promptText = `**${result.workflow.label}** — Step ${current}/${total}\n\n✅ **${result.workflow.steps[0].field}:** ${extractedName}\n\n${step.prompt}`;
    if (step.options) promptText += `\n\nOptions: ${step.options.join(', ')}`;
    if (!step.required) promptText += '\n\n_Type `skip` to skip_';

    const suggestions = [];
    if (step.options) step.options.slice(0, 4).forEach(o => suggestions.push({ label: o, action: o }));
    if (!step.required) suggestions.push({ label: '⏭️ Skip', action: 'skip' });
    suggestions.push({ label: '❌ Cancel', action: 'cancel' });

    return respond(conversationHistory, msg, promptText, {
      type: 'workflow_step', workflowLabel: result.workflow.label,
      currentStep: result.workflow.currentStep, totalSteps: total,
      progress: Math.round((result.workflow.currentStep / total) * 100),
      field: step.field, fieldType: step.schemaType || step.type,
      prompt: step.prompt, options: step.options, required: step.required,
      collected: result.workflow.collected, canSkip: !step.required,
    }, suggestions);
  }

  // Show first step
  const prompt = result.prompt;
  const suggestions = [];
  if (prompt.structured?.options) {
    prompt.structured.options.slice(0, 4).forEach(o => suggestions.push({ label: o, action: o }));
  }
  suggestions.push({ label: '❌ Cancel', action: 'cancel' });

  return respond(conversationHistory, msg, prompt.text, prompt.structured, suggestions);
}

/**
 * Try to extract a name/value from workflow trigger message
 * "add client Ahmed" → "Ahmed"
 * "ضيف عميل اسمه أحمد" → "أحمد"
 */
function extractExplicitName(msg) {
  // Only extract names from explicit patterns like "named Ahmed" or "اسمه أحمد"
  const patterns = [
    /(?:named?|called?)\s+(.+)/i,
    /(?:اسم[هة]?)\s+(.+)/i,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m && m[1] && m[1].trim().length > 1 && m[1].trim().length < 50) {
      const val = m[1].trim();
      if (!/^(to|in|from|for|في|إلى|من)\s/i.test(val)) return val;
    }
  }
  return null;
}

/**
 * Build response object
 */
function respond(history, userMsg, markdown, structured, suggestions, tool, confidence) {
  history.push({ role: 'user', content: userMsg });
  history.push({ role: 'assistant', content: markdown });
  return {
    response: markdown,
    structured: structured || null,
    suggestions: suggestions || [],
    tool: tool || null,
    confidence: confidence || null,
    conversationHistory: history,
  };
}

module.exports = { chat, provider: 'intent-engine' };
