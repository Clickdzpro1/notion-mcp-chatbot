const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { tools, executeTool } = require('./tools');

const client = new Anthropic({ apiKey: config.anthropicApiKey });

function loadSystemPrompt() {
  const promptPath = path.join(__dirname, '..', 'prompts', 'system.md');
  try {
    return fs.readFileSync(promptPath, 'utf-8');
  } catch {
    return `You are ${config.botName}, an AI assistant connected to a Notion workspace. You can search, read, create, and update Notion pages and databases. Be helpful, concise, and always cite which page or database your information comes from.`;
  }
}

async function chat(conversationHistory, userMessage) {
  // Add user message
  conversationHistory.push({ role: 'user', content: userMessage });

  // Trim history if too long
  while (conversationHistory.length > config.maxHistory) {
    conversationHistory.shift();
  }

  const systemPrompt = loadSystemPrompt();
  let iterations = 0;
  const maxIterations = 10; // Safety limit on tool-use loops

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model: config.claudeModel,
      max_tokens: 4096,
      system: systemPrompt,
      tools: tools,
      messages: conversationHistory,
    });

    // Check if Claude wants to use tools
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      // Final text response — extract and return
      const textContent = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      conversationHistory.push({ role: 'assistant', content: response.content });
      return { response: textContent, conversationHistory };
    }

    // Claude wants to use tools — execute them
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

  // If we hit the iteration limit
  return {
    response: 'I reached the maximum number of steps for this request. Please try breaking your question into smaller parts.',
    conversationHistory,
  };
}

module.exports = { chat };
