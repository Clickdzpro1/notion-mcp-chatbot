/**
 * Onboarding System — First-time setup for AGENT ZERO template buyers.
 *
 * Detects workspace state, guides users through their databases,
 * demonstrates features, and creates sample entries.
 *
 * Flow:
 *   1. Welcome → detect databases → show what's available
 *   2. Tour each database → explain its purpose
 *   3. Demo: create a sample entry in CRM
 *   4. Show MCP connection status + AGENT ZERO tips
 *   5. Mark onboarding complete
 */

const dbCache = require('./database-cache');
const notion = require('./notion');

// Expected databases for AGENT ZERO template
const EXPECTED_DATABASES = [
  { keywords: ['عملاء', 'crm'], emoji: '👥', name: 'CRM / العملاء', purpose: 'Manage clients from first contact to last receipt' },
  { keywords: ['مشاريع', 'مهام'], emoji: '📋', name: 'Tasks / المشاريع والمهام', purpose: 'Track projects from idea to delivery' },
  { keywords: ['متجر', 'منتجات'], emoji: '📦', name: 'Store / المتجر والمنتجات', purpose: 'Full inventory with auto profit calculation' },
  { keywords: ['محتوى'], emoji: '📣', name: 'Content / إدارة المحتوى', purpose: 'Content pipeline from idea to publish' },
  { keywords: ['مواعيد', 'حجوزات'], emoji: '📅', name: 'Appointments / المواعيد', purpose: 'Never miss an appointment' },
  { keywords: ['موردين', 'مزودين'], emoji: '🤝', name: 'Suppliers / الموردين', purpose: 'Know who delivers and who disappoints' },
  { keywords: ['مالي', 'ميزانية'], emoji: '📊', name: 'Finance / الماليات', purpose: 'Income, expenses, and taxes in DZD' },
  { keywords: ['leads', 'فرص'], emoji: '🎯', name: 'Leads / تتبع الفرص', purpose: 'From first message to first payment' },
  { keywords: ['وصولات', 'إيصالات'], emoji: '🧾', name: 'Receipts / الوصولات', purpose: 'Every payment documented and ready to send' },
  { keywords: ['مبيعات', 'فواتير'], emoji: '💰', name: 'Sales / المبيعات', purpose: 'Every deal from offer to collection in DZD' },
  { keywords: ['skills', 'skill'], emoji: '🧰', name: 'Skills Library', purpose: '502 skills for building super agents' },
  { keywords: ['معرفة', 'sop'], emoji: '🧠', name: 'Knowledge Base / SOPs', purpose: 'Documented procedures — never reinvent the wheel' },
];

// Onboarding steps
const STEPS = [
  'welcome',
  'workspace_scan',
  'database_tour',
  'demo_create',
  'agent_tips',
  'complete',
];

// Track onboarding state per session
const onboardingState = new Map();

/**
 * Check if session needs onboarding
 */
function needsOnboarding(sessionId) {
  const state = onboardingState.get(sessionId);
  if (!state) return true;
  return !state.completed;
}

/**
 * Get or initialize onboarding state
 */
function getState(sessionId) {
  if (!onboardingState.has(sessionId)) {
    onboardingState.set(sessionId, {
      step: 0,
      completed: false,
      detectedDbs: [],
      missingDbs: [],
      tourIndex: 0,
      started: Date.now(),
    });
  }
  return onboardingState.get(sessionId);
}

/**
 * Skip onboarding for this session
 */
function skip(sessionId) {
  const state = getState(sessionId);
  state.completed = true;
}

/**
 * Process onboarding step
 */
async function processStep(sessionId, userInput) {
  const state = getState(sessionId);
  const input = (userInput || '').trim().toLowerCase();

  // Allow skipping at any point
  if (input === 'skip' || input === 'تخطى' || input === 'skip onboarding') {
    state.completed = true;
    return {
      action: 'completed',
      message: '⏭️ Onboarding skipped! You can always type `help` to see what I can do.',
      structured: { type: 'onboarding_complete' },
      suggestions: [
        { label: '📊 List databases', action: 'list databases' },
        { label: '👥 Add client', action: 'add a new client' },
        { label: '🔍 Search', action: 'search ' },
      ],
    };
  }

  const currentStep = STEPS[state.step];

  switch (currentStep) {
    case 'welcome':
      return await stepWelcome(state);

    case 'workspace_scan':
      return await stepWorkspaceScan(state);

    case 'database_tour':
      return await stepDatabaseTour(state, input);

    case 'demo_create':
      return await stepDemoCreate(state, input);

    case 'agent_tips':
      return stepAgentTips(state);

    case 'complete':
      state.completed = true;
      return {
        action: 'completed',
        message: '🎉 **You\'re all set!** AGENT ZERO is ready to help you manage your business.\n\nJust type naturally — I understand Arabic, French, and English!',
        structured: { type: 'onboarding_complete' },
        suggestions: [
          { label: '📊 List databases', action: 'list databases' },
          { label: '👥 Add client', action: 'add a new client' },
          { label: '📋 New task', action: 'create a new task' },
          { label: '🔍 Search', action: 'search ' },
        ],
      };

    default:
      state.completed = true;
      return { action: 'completed', message: 'Onboarding complete!' };
  }
}

// ============================================================
// Individual Steps
// ============================================================

async function stepWelcome(state) {
  state.step = 1; // Move to workspace_scan

  return {
    action: 'continue',
    message: `🚀 **Welcome to AGENT ZERO!**

أهلاً بيك في نظام الذكاء الاصطناعي الجزائري المتكامل لإدارة الأعمال!

I'm scanning your workspace to set everything up...`,
    structured: {
      type: 'onboarding_step',
      step: 'welcome',
      stepNumber: 1,
      totalSteps: 5,
      progress: 0,
    },
    suggestions: [],
    autoAdvance: true, // Frontend should auto-advance
  };
}

async function stepWorkspaceScan(state) {
  await dbCache.ensureFresh();
  const databases = dbCache.getAll();

  // Match detected databases to expected ones
  const detected = [];
  const missing = [];

  for (const expected of EXPECTED_DATABASES) {
    const found = databases.find(db =>
      expected.keywords.some(k => db.title.toLowerCase().includes(k))
    );
    if (found) {
      detected.push({ ...expected, id: found.id, title: found.title, description: found.description });
    } else {
      missing.push(expected);
    }
  }

  state.detectedDbs = detected;
  state.missingDbs = missing;
  state.step = 2; // Move to tour

  const score = Math.round((detected.length / EXPECTED_DATABASES.length) * 100);

  let statusEmoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';

  return {
    action: 'continue',
    message: `${statusEmoji} **Workspace Scan Complete!**

✅ **${detected.length}/${EXPECTED_DATABASES.length}** databases detected (${score}% setup)

${detected.map(d => `${d.emoji} **${d.title}** — ${d.purpose}`).join('\n')}

${missing.length > 0 ? `\n⚠️ **Missing:** ${missing.map(m => m.name).join(', ')}\n_These databases weren't found. They may use different names._` : '\n🎯 **All databases detected!** Your workspace is fully set up.'}

Ready for a quick tour?`,
    structured: {
      type: 'onboarding_step',
      step: 'workspace_scan',
      stepNumber: 2,
      totalSteps: 5,
      progress: 20,
      detected: detected.length,
      total: EXPECTED_DATABASES.length,
      score,
    },
    suggestions: [
      { label: '📖 Start tour', action: 'next' },
      { label: '⏭️ Skip to demo', action: 'demo' },
      { label: '⏭️ Skip all', action: 'skip' },
    ],
  };
}

async function stepDatabaseTour(state, input) {
  if (input === 'demo' || input === 'skip tour') {
    state.step = 3;
    return await stepDemoCreate(state, '');
  }

  const dbs = state.detectedDbs;
  if (dbs.length === 0 || state.tourIndex >= dbs.length) {
    state.step = 3;
    return await stepDemoCreate(state, '');
  }

  const db = dbs[state.tourIndex];
  state.tourIndex++;

  // Fetch row count
  let rowCount = '?';
  try {
    const data = await notion.queryDatabase(db.id, null, null, 1);
    rowCount = data.total;
  } catch {}

  const isLast = state.tourIndex >= dbs.length;
  if (isLast) state.step = 3;

  return {
    action: 'continue',
    message: `${db.emoji} **${db.title}**

📝 ${db.purpose}
📊 **${rowCount}** entries

${db.description ? `_${db.description}_` : ''}

${isLast ? '\n🎯 Tour complete! Let\'s try creating something...' : `_(${state.tourIndex}/${dbs.length} databases)_`}`,
    structured: {
      type: 'onboarding_step',
      step: 'database_tour',
      stepNumber: 3,
      totalSteps: 5,
      progress: 20 + Math.round((state.tourIndex / dbs.length) * 40),
      dbTitle: db.title,
      dbId: db.id,
      rowCount,
    },
    suggestions: isLast
      ? [{ label: '🚀 Try creating an entry', action: 'next' }, { label: '⏭️ Skip', action: 'skip' }]
      : [{ label: `Next → ${dbs[state.tourIndex]?.emoji || ''} ${dbs[state.tourIndex]?.name || ''}`, action: 'next' }, { label: '⏭️ Skip to demo', action: 'demo' }],
  };
}

async function stepDemoCreate(state, input) {
  // Find CRM database for demo
  const crmDb = state.detectedDbs.find(d => d.keywords?.includes('crm') || d.keywords?.includes('عملاء'));

  if (!crmDb) {
    state.step = 4;
    return stepAgentTips(state);
  }

  state.step = 4;

  return {
    action: 'continue',
    message: `🎯 **Quick Demo: Try Adding a Client!**

Type something like:
- **"add a new client"** — starts a guided workflow
- **"analyze the CRM"** — see your client stats
- **"search for Ahmed"** — find specific entries

Or try any command from the help menu. AGENT ZERO understands Arabic, French, and English!`,
    structured: {
      type: 'onboarding_step',
      step: 'demo_create',
      stepNumber: 4,
      totalSteps: 5,
      progress: 75,
    },
    suggestions: [
      { label: '👥 Add client', action: 'add a new client' },
      { label: '📊 Analyze CRM', action: 'analyze the CRM' },
      { label: '➡️ Continue', action: 'next' },
    ],
  };
}

function stepAgentTips(state) {
  state.step = 5;

  return {
    action: 'continue',
    message: `💡 **AGENT ZERO Tips**

**In Notion (AGENT ZERO agent):**
AGENT ZERO runs on Claude Opus 4.6 with 14 MCP tools connected. It can:
- Search, query, analyze any database
- Create entries with guided workflows
- Summarize pages, draft documents
- Understand Arabic, French, English

**In this Chat UI:**
Same 14 tools, with smart routing that understands natural language.

**Pro Tips:**
- Say "add a client" → guided workflow with all fields
- Say "analyze the CRM" → instant stats
- Say "draft a meeting agenda" → template generator
- Say "search [anything]" → workspace search

Ready to go?`,
    structured: {
      type: 'onboarding_step',
      step: 'agent_tips',
      stepNumber: 5,
      totalSteps: 5,
      progress: 90,
    },
    suggestions: [
      { label: '🎉 Let\'s go!', action: 'done' },
    ],
  };
}

// Cleanup old states
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, state] of onboardingState) {
    if (state.started < cutoff) onboardingState.delete(id);
  }
}, 60 * 60 * 1000);

module.exports = { needsOnboarding, getState, processStep, skip };
