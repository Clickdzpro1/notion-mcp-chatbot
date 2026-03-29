const fs = require('fs');
const path = require('path');
const config = require('../config');
const { tools, executeTool } = require('./tools');

// ============================================================
// AI Provider Setup — supports Anthropic, OpenRouter, or none
// ============================================================
let client = null;
let provider = 'none'; // 'anthropic' | 'openrouter' | 'none'

if (config.anthropicApiKey) {
  const Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.anthropicApiKey });
  provider = 'anthropic';
} else if (config.openRouterApiKey) {
  provider = 'openrouter';
}

function loadSystemPrompt() {
  const promptPath = path.join(__dirname, '..', 'prompts', 'system.md');
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    return `You are ${config.botName}, an AI assistant connected to a Notion workspace. You can search, read, create, and update Notion pages and databases. Be helpful, concise, and always cite which page or database your information comes from.`;
  }
}

// ============================================================
// Convert our tool definitions to OpenAI function-calling format
// ============================================================
function toolsToOpenAI() {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ============================================================
// OpenRouter - models to try in order (first with tool support, then without)
// ============================================================
const TOOL_MODELS = [
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'stepfun/step-3.5-flash:free',
];

const CHAT_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-coder:free',
];

async function openRouterRequest(body, retryModels = []) {
  const models = [body.model, ...retryModels];

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
        body: JSON.stringify({ ...body, model }),
      });

      if (response.status === 429 || response.status === 503) {
        console.log(`  [AI] ${model} rate-limited, trying next...`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        // If model not found or doesn't support tools, try next
        if (response.status === 404 || response.status === 400) {
          console.log(`  [AI] ${model} error ${response.status}, trying next...`);
          continue;
        }
        throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) continue;

      return choice.message;
    } catch (err) {
      if (err.message.includes('OpenRouter API error')) throw err;
      console.log(`  [AI] ${model} failed: ${err.message}, trying next...`);
      continue;
    }
  }

  throw new Error('All AI models are currently unavailable. Please try again in a moment.');
}

// ============================================================
// OpenRouter chat (OpenAI-compatible API) with retry logic
// ============================================================
async function chatOpenRouter(conversationHistory, userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });

  while (conversationHistory.length > config.maxHistory) {
    conversationHistory.shift();
  }

  const systemPrompt = loadSystemPrompt();
  let iterations = 0;
  const maxIterations = 10;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
  ];

  const primaryModel = config.openRouterModel;

  while (iterations < maxIterations) {
    iterations++;

    const msg = await openRouterRequest({
      model: primaryModel,
      messages,
      tools: toolsToOpenAI(),
      tool_choice: 'auto',
      max_tokens: 4096,
    }, TOOL_MODELS);

    // Check for tool calls
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Clean the message for history (some providers add reasoning fields that break on retry)
      const cleanMsg = { role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls };
      messages.push(cleanMsg);
      conversationHistory.push(cleanMsg);

      for (const toolCall of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {}

        let result;
        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (err) {
          result = { error: err.message };
        }

        const toolMsg = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result, null, 2),
        };
        messages.push(toolMsg);
        conversationHistory.push(toolMsg);
      }

      continue;
    }

    // Final text response
    const text = msg.content || '';

    if (!text && iterations === 1) {
      // Model returned null content without tool calls — retry without tools
      console.log('  [AI] Empty response with tools, retrying as plain chat...');
      const plainMsg = await openRouterRequest({
        model: primaryModel,
        messages,
        max_tokens: 4096,
      }, CHAT_MODELS);

      const plainText = plainMsg.content || 'Sorry, I could not generate a response. Please try again.';
      conversationHistory.push({ role: 'assistant', content: plainText });
      return { response: plainText, conversationHistory };
    }

    conversationHistory.push({ role: 'assistant', content: text || 'Sorry, I could not generate a response.' });
    return { response: text || 'Sorry, I could not generate a response.', conversationHistory };
  }

  return {
    response: 'I reached the maximum number of steps. Please try a simpler question.',
    conversationHistory,
  };
}

// ============================================================
// Anthropic chat (original implementation)
// ============================================================
async function chatAnthropic(conversationHistory, userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });

  while (conversationHistory.length > config.maxHistory) {
    conversationHistory.shift();
  }

  const systemPrompt = loadSystemPrompt();
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: conversationHistory,
    });

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const textContent = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      conversationHistory.push({ role: 'assistant', content: response.content });
      return { response: textContent, conversationHistory };
    }

    conversationHistory.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolBlock of toolUseBlocks) {
      let result;
      try {
        result = await executeTool(toolBlock.name, toolBlock.input);
      } catch (err) {
        result = { error: err.message };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: JSON.stringify(result, null, 2),
      });
    }

    conversationHistory.push({ role: 'user', content: toolResults });
  }

  return {
    response: 'I reached the maximum number of steps for this request. Please try breaking your question into smaller parts.',
    conversationHistory,
  };
}

// ============================================================
// Main chat dispatcher
// ============================================================
async function chat(conversationHistory, userMessage) {
  if (provider === 'anthropic') {
    return chatAnthropic(conversationHistory, userMessage);
  } else if (provider === 'openrouter') {
    return chatOpenRouter(conversationHistory, userMessage);
  } else {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
  }
}

module.exports = { chat, provider };
