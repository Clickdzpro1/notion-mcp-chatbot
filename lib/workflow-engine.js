/**
 * Workflow Engine — Multi-step guided flows for creating/updating Notion entries.
 *
 * Two modes:
 * 1. Built-in workflows — predefined steps for known databases (CRM, Tasks, etc.)
 * 2. Dynamic workflows — auto-generated from any database schema
 *
 * Zero AI dependencies. Pure state machine.
 */

const notion = require('./notion');
const dbCache = require('./database-cache');
const registry = require('./database-registry');

// ============================================================
// Built-in workflow templates (matched by database name keywords)
// ============================================================
const WORKFLOW_TEMPLATES = {
  create_client: {
    match: ['عملاء', 'crm', 'clients', 'client', 'عميل'],
    label: '👥 Add New Client',
    steps: [
      { field: 'الاسم الكامل', prompt: '👤 What\'s the client\'s name?', type: 'title', required: true },
      { field: 'رقم الهاتف', prompt: '📱 Phone number?', type: 'phone_number', required: false },
      { field: 'الإيميل', prompt: '📧 Email address?', type: 'email', required: false },
      { field: 'المصدر', prompt: '📣 Where did this client come from?', type: 'select', required: false },
      { field: 'الولاية', prompt: '📍 City/Region?', type: 'select', required: false },
      { field: 'الأولوية', prompt: '🔥 Priority level?', type: 'select', required: false },
    ],
  },
  create_task: {
    match: ['مشاريع', 'مهام', 'tasks', 'task', 'مهمة', 'project'],
    label: '📋 Create New Task',
    steps: [
      { field: null, prompt: '📝 What\'s the task title?', type: 'title', required: true, titleField: true },
      { field: 'الحالة', prompt: '📊 Status?', type: 'status', required: false },
      { field: 'الأولوية', prompt: '🔥 Priority?', type: 'select', required: false },
      { field: 'تاريخ التسليم', prompt: '📅 Due date? (YYYY-MM-DD)', type: 'date', required: false },
    ],
  },
  create_content: {
    match: ['محتوى', 'content', 'إدارة المحتوى'],
    label: '📣 Create Content Entry',
    steps: [
      { field: null, prompt: '📝 Content title?', type: 'title', required: true, titleField: true },
      { field: 'النوع', prompt: '📋 Content type?', type: 'select', required: false },
      { field: 'المنصة', prompt: '📱 Platform?', type: 'select', required: false },
      { field: 'الحالة', prompt: '📊 Status?', type: 'status', required: false },
    ],
  },
  create_lead: {
    match: ['leads', 'lead', 'فرص', 'ليد'],
    label: '🎯 Add New Lead',
    steps: [
      { field: null, prompt: '👤 Lead name?', type: 'title', required: true, titleField: true },
      { field: 'المصدر', prompt: '📣 Source?', type: 'select', required: false },
      { field: 'قيمة الصفقة', prompt: '💰 Deal value?', type: 'number', required: false },
      { field: 'مرحلة Pipeline', prompt: '📊 Pipeline stage?', type: 'status', required: false },
    ],
  },
  create_invoice: {
    match: ['مبيعات', 'فواتير', 'invoice', 'sale', 'فاتورة'],
    label: '💰 Create Invoice',
    steps: [
      { field: null, prompt: '📝 Invoice title/description?', type: 'title', required: true, titleField: true },
      { field: 'المبلغ', prompt: '💰 Amount?', type: 'number', required: true },
      { field: 'الحالة', prompt: '📊 Payment status?', type: 'status', required: false },
    ],
  },
  quick_note: {
    match: ['معرفة', 'sop', 'knowledge', 'note', 'ملاحظة'],
    label: '🧠 Quick Note',
    steps: [
      { field: null, prompt: '📝 Note title?', type: 'title', required: true, titleField: true },
    ],
  },
};

// ============================================================
// Start a workflow
// ============================================================
async function startWorkflow(databaseId, workflowType) {
  await dbCache.ensureFresh();

  // Get actual schema from Notion
  let schema;
  try {
    schema = await notion.getDatabaseSchema(databaseId);
  } catch (err) {
    return { error: `Could not get database schema: ${err.message}` };
  }

  let steps;
  let label;

  if (workflowType && WORKFLOW_TEMPLATES[workflowType]) {
    // Use built-in template but map to actual schema fields
    const template = WORKFLOW_TEMPLATES[workflowType];
    label = template.label;

    // Build a lookup of schema fields by type and fuzzy name
    const schemaEntries = Object.entries(schema.schema);
    const titleFieldName = findTitleFieldName(schema.schema);

    steps = [];
    for (const step of template.steps) {
      let matchedField = null;
      let matchedInfo = null;

      if (step.type === 'title') {
        // Always map to the actual title field
        matchedField = titleFieldName;
        matchedInfo = schema.schema[titleFieldName];
      } else {
        // Try exact match first
        if (schema.schema[step.field]) {
          matchedField = step.field;
          matchedInfo = schema.schema[step.field];
        } else {
          // Fuzzy match — find a field with matching type and similar name
          for (const [name, info] of schemaEntries) {
            if (info.type === step.type || info.type === step.schemaType) {
              const nameLower = name.toLowerCase();
              const stepLower = (step.field || '').toLowerCase();
              // Check partial match
              if (nameLower.includes(stepLower) || stepLower.includes(nameLower)) {
                matchedField = name;
                matchedInfo = info;
                break;
              }
            }
          }
          // If still no match, try matching by type alone for common types
          if (!matchedField) {
            for (const [name, info] of schemaEntries) {
              if (info.type === step.type && !steps.find(s => s.field === name)) {
                matchedField = name;
                matchedInfo = info;
                break;
              }
            }
          }
        }
      }

      if (matchedField) {
        steps.push({
          ...step,
          field: matchedField,
          options: matchedInfo?.options?.map(o => o.name || o) || null,
          schemaType: matchedInfo?.type || step.type,
        });
      }
    }
  } else {
    // Dynamic workflow — generate from schema
    label = `➕ Add to ${schema.title}`;
    steps = generateStepsFromSchema(schema.schema);
  }

  if (steps.length === 0) {
    return { error: 'No editable fields found in this database.' };
  }

  const workflow = {
    active: true,
    type: workflowType || 'dynamic',
    databaseId,
    databaseTitle: schema.title,
    label,
    steps,
    currentStep: 0,
    collected: {},
  };

  return {
    workflow,
    prompt: formatStepPrompt(workflow),
  };
}

// ============================================================
// Process user input for the current workflow step
// ============================================================
async function processStep(workflow, userInput) {
  const input = userInput.trim();

  // Cancel
  if (/^(cancel|stop|quit|exit|إلغاء|خلاص|توقف)/i.test(input)) {
    return { action: 'cancelled', message: '❌ Workflow cancelled.' };
  }

  // Skip optional field
  if (/^(skip|pass|next|تخطى|بعدين|ماشي)/i.test(input)) {
    const step = workflow.steps[workflow.currentStep];
    if (step.required) {
      return {
        action: 'retry',
        message: `⚠️ **${step.field || 'This field'}** is required. Please provide a value or type \`cancel\` to exit.`,
        prompt: formatStepPrompt(workflow),
      };
    }
    // Move to next step
    workflow.currentStep++;
    if (workflow.currentStep >= workflow.steps.length) {
      return await completeWorkflow(workflow);
    }
    return {
      action: 'next',
      prompt: formatStepPrompt(workflow),
    };
  }

  // Collect value for current step
  const step = workflow.steps[workflow.currentStep];
  const value = parseValue(input, step);

  if (value.error) {
    return {
      action: 'retry',
      message: `⚠️ ${value.error}`,
      prompt: formatStepPrompt(workflow),
    };
  }

  workflow.collected[step.field] = value.parsed;
  workflow.currentStep++;

  // Check if workflow is complete
  if (workflow.currentStep >= workflow.steps.length) {
    return await completeWorkflow(workflow);
  }

  return {
    action: 'next',
    prompt: formatStepPrompt(workflow),
    collected: { ...workflow.collected },
  };
}

// ============================================================
// Complete workflow — create the Notion page
// ============================================================
async function completeWorkflow(workflow) {
  try {
    const result = await notion.createPage(workflow.databaseId, workflow.collected);
    workflow.active = false;

    return {
      action: 'completed',
      message: `✅ **${workflow.label}** — Done!`,
      result,
      collected: workflow.collected,
    };
  } catch (err) {
    return {
      action: 'error',
      message: `❌ Failed to create entry: ${err.message}`,
      collected: workflow.collected,
    };
  }
}

// ============================================================
// Format the current step prompt
// ============================================================
function formatStepPrompt(workflow) {
  const step = workflow.steps[workflow.currentStep];
  const total = workflow.steps.length;
  const current = workflow.currentStep + 1;
  const progress = Math.round((workflow.currentStep / total) * 100);

  let prompt = `**${workflow.label}** — Step ${current}/${total}\n\n`;
  prompt += `${step.prompt}`;

  if (step.options && step.options.length > 0) {
    prompt += `\n\nOptions: ${step.options.join(', ')}`;
  }

  if (!step.required) {
    prompt += '\n\n_Type `skip` to skip this field_';
  }

  return {
    text: prompt,
    structured: {
      type: 'workflow_step',
      workflowLabel: workflow.label,
      databaseTitle: workflow.databaseTitle,
      currentStep: workflow.currentStep,
      totalSteps: total,
      progress,
      field: step.field,
      fieldType: step.schemaType || step.type,
      prompt: step.prompt,
      options: step.options || null,
      required: step.required,
      collected: workflow.collected,
      canSkip: !step.required,
    },
  };
}

// ============================================================
// Parse user input based on field type
// ============================================================
function parseValue(input, step) {
  const type = step.schemaType || step.type;

  switch (type) {
    case 'number':
      const num = Number(input.replace(/[,،\s]/g, ''));
      if (isNaN(num)) return { error: 'Please enter a valid number.' };
      return { parsed: num };

    case 'date':
      // Accept YYYY-MM-DD or natural dates
      const dateMatch = input.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (dateMatch) return { parsed: dateMatch[0] };
      // Try DD/MM/YYYY
      const altMatch = input.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
      if (altMatch) return { parsed: `${altMatch[3]}-${altMatch[2].padStart(2, '0')}-${altMatch[1].padStart(2, '0')}` };
      return { error: 'Please use YYYY-MM-DD format (e.g., 2026-03-29).' };

    case 'checkbox':
      const yes = /^(yes|true|1|نعم|إيه|oui|صح)/i.test(input);
      const no = /^(no|false|0|لا|non|خطأ)/i.test(input);
      if (!yes && !no) return { error: 'Please answer yes or no.' };
      return { parsed: yes };

    case 'email':
      if (input.includes('@')) return { parsed: input };
      return { error: 'Please enter a valid email address.' };

    case 'url':
      if (input.startsWith('http')) return { parsed: input };
      return { parsed: `https://${input}` };

    case 'select':
    case 'status':
      // Try to match against options
      if (step.options && step.options.length > 0) {
        const exact = step.options.find(o => o.toLowerCase() === input.toLowerCase());
        if (exact) return { parsed: exact };
        const partial = step.options.find(o => o.toLowerCase().includes(input.toLowerCase()));
        if (partial) return { parsed: partial };
        // Accept any input — Notion will create the option if it doesn't exist
      }
      return { parsed: input };

    case 'multi_select':
      const items = input.split(/[,،]+/).map(s => s.trim()).filter(Boolean);
      return { parsed: items };

    default:
      // title, rich_text, phone_number, etc.
      return { parsed: input };
  }
}

// ============================================================
// Generate workflow steps from database schema
// ============================================================
function generateStepsFromSchema(schema) {
  const steps = [];
  const skipTypes = ['formula', 'rollup', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by', 'unique_id'];

  // Title field first
  const titleFieldName = findTitleFieldName(schema);
  if (titleFieldName) {
    steps.push({
      field: titleFieldName,
      prompt: `📝 ${titleFieldName}?`,
      type: 'title',
      required: true,
      options: null,
      schemaType: 'title',
    });
  }

  // Then other fields
  for (const [name, info] of Object.entries(schema)) {
    if (info.type === 'title') continue; // Already added
    if (skipTypes.includes(info.type)) continue;

    steps.push({
      field: name,
      prompt: `${getFieldEmoji(info.type)} ${name}?`,
      type: info.type,
      required: false,
      options: info.options?.map(o => o.name || o) || null,
      schemaType: info.type,
    });
  }

  return steps;
}

function findTitleField(schema) {
  for (const [, info] of Object.entries(schema)) {
    if (info.type === 'title') return info;
  }
  return null;
}

function findTitleFieldName(schema) {
  for (const [name, info] of Object.entries(schema)) {
    if (info.type === 'title') return name;
  }
  return null;
}

function getFieldEmoji(type) {
  const emojis = {
    title: '📝', rich_text: '📝', number: '🔢', select: '📋', multi_select: '🏷️',
    status: '📊', date: '📅', checkbox: '☑️', url: '🔗', email: '📧',
    phone_number: '📱', people: '👥', relation: '🔗', files: '📎',
  };
  return emojis[type] || '📝';
}

// ============================================================
// Match a database to a built-in workflow template
// ============================================================
function findWorkflowTemplate(databaseTitle) {
  const lower = databaseTitle.toLowerCase();

  // First check built-in templates
  for (const [key, template] of Object.entries(WORKFLOW_TEMPLATES)) {
    if (template.match.some(m => lower.includes(m))) {
      return key;
    }
  }

  // Then check registry — any database with a workflowHint can have a dynamic workflow
  const regEntry = registry.findByKeyword(lower);
  if (regEntry && regEntry.workflowHint) {
    return null; // Will use dynamic workflow generation from schema
  }

  return null;
}

/**
 * Find database by natural trigger phrase using the registry
 */
function findDatabaseByTrigger(phrase) {
  return registry.findByTrigger(phrase);
}

module.exports = { startWorkflow, processStep, findWorkflowTemplate, findDatabaseByTrigger, WORKFLOW_TEMPLATES };
