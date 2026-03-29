const express = require('express');
const router = express.Router();
const notion = require('../lib/notion');

// List available databases
router.get('/databases', async (req, res) => {
  try {
    const databases = await notion.listDatabases();
    res.json(databases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get database schema
router.get('/databases/:id/schema', async (req, res) => {
  try {
    const schema = await notion.getDatabaseSchema(req.params.id);
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
