const express = require('express');
const router = express.Router();
const dbCache = require('../lib/database-cache');
const notion = require('../lib/notion');

router.get('/', async (req, res) => {
  try {
    await dbCache.ensureFresh();
    const databases = dbCache.getAll();

    // Quick stats from key databases
    const quickStats = {};
    const knownDbs = {
      'عملاء': 'totalClients',
      'crm': 'totalClients',
      'مشاريع': 'openTasks',
      'مهام': 'openTasks',
      'مبيعات': 'totalSales',
      'فواتير': 'totalSales',
      'leads': 'pendingLeads',
      'فرص': 'pendingLeads',
    };

    for (const db of databases) {
      const lower = db.title.toLowerCase();
      for (const [keyword, statKey] of Object.entries(knownDbs)) {
        if (lower.includes(keyword) && !quickStats[statKey]) {
          try {
            const data = await notion.queryDatabase(db.id, null, null, 1);
            quickStats[statKey] = { count: data.total, dbTitle: db.title, dbId: db.id };
          } catch {}
        }
      }
    }

    // Quick actions based on available databases
    const quickActions = [];
    const actionMap = [
      { keywords: ['عملاء', 'crm'], label: '👥 Add Client', action: 'add a new client' },
      { keywords: ['مشاريع', 'مهام', 'task'], label: '📋 New Task', action: 'create a new task' },
      { keywords: ['محتوى', 'content'], label: '📣 New Content', action: 'create new content' },
      { keywords: ['leads', 'فرص'], label: '🎯 Add Lead', action: 'add a new lead' },
    ];

    for (const a of actionMap) {
      if (databases.some(db => a.keywords.some(k => db.title.toLowerCase().includes(k)))) {
        quickActions.push({ label: a.label, action: a.action });
      }
    }
    quickActions.push({ label: '🔍 Search', action: 'search ' });
    quickActions.push({ label: '📊 All Databases', action: 'list databases' });

    res.json({
      databases: databases.map(db => ({ id: db.id, title: db.title, description: db.description })),
      quickStats,
      quickActions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
