const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const status = { status: 'ok', notion: false, tools: 14, mode: 'zero-dependency' };

  try {
    const { Client } = require('@notionhq/client');
    const config = require('../config');
    const notion = new Client({ auth: config.notionApiKey });
    await notion.users.me();
    status.notion = true;
  } catch (err) {
    status.notion_error = err.message;
  }

  status.status = status.notion ? 'ok' : 'degraded';
  res.json(status);
});

module.exports = router;
