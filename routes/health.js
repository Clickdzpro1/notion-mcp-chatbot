const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const status = { status: 'ok', notion: false, claude: false };

  try {
    const { Client } = require('@notionhq/client');
    const config = require('../config');
    const notion = new Client({ auth: config.notionApiKey });
    await notion.users.me();
    status.notion = true;
  } catch {}

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const config = require('../config');
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    // A minimal call to verify the key works
    await client.messages.create({
      model: config.claudeModel,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }],
    });
    status.claude = true;
  } catch {}

  status.status = status.notion && status.claude ? 'ok' : 'degraded';
  res.json(status);
});

module.exports = router;
