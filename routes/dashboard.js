const express = require('express');
const router = express.Router();
const dbCache = require('../lib/database-cache');
const registry = require('../lib/database-registry');
const notion = require('../lib/notion');

router.get('/', async (req, res) => {
  try {
    await dbCache.ensureFresh();
    const databases = dbCache.getAll();
    const allCategories = registry.getCategories();
    const regEntries = registry.getAll();

    // Group databases by category using registry
    const categories = {};
    for (const [catKey, catInfo] of Object.entries(allCategories)) {
      categories[catKey] = {
        emoji: catInfo.emoji,
        name: catInfo.nameEn,
        nameAr: catInfo.name,
        databases: [],
      };
    }

    // Match each database to a category
    for (const db of databases) {
      const regEntry = db.registry || regEntries.find(r =>
        r.keywords.some(k => db.title.toLowerCase().includes(k))
      );
      const cat = regEntry?.category || 'tools';
      if (categories[cat]) {
        categories[cat].databases.push({ id: db.id, title: db.title });
      } else {
        if (!categories.other) categories.other = { emoji: '📁', name: 'Other', databases: [] };
        categories.other.databases.push({ id: db.id, title: db.title });
      }
    }

    // Remove empty categories
    for (const key of Object.keys(categories)) {
      if (categories[key].databases.length === 0) delete categories[key];
    }

    // Quick stats
    const quickStats = {};
    const statDbs = {
      totalClients: ['عملاء', 'crm'],
      openTasks: ['مشاريع', 'مهام'],
      pendingLeads: ['leads', 'فرص'],
      totalSales: ['مبيعات', 'فواتير'],
    };

    for (const [statKey, keywords] of Object.entries(statDbs)) {
      const db = databases.find(d => keywords.some(k => d.title.toLowerCase().includes(k)));
      if (db) {
        try {
          const data = await notion.queryDatabase(db.id, null, null, 1);
          quickStats[statKey] = { count: data.total, dbTitle: db.title, dbId: db.id };
        } catch {}
      }
    }

    // Quick actions
    const quickActions = [
      { label: '👥 Add Client', action: 'add a new client' },
      { label: '📋 New Task', action: 'create a new task' },
      { label: '📣 New Content', action: 'create new content' },
      { label: '🎯 Add Lead', action: 'add a new lead' },
      { label: '🔍 Search', action: 'search ' },
      { label: '📊 All Databases', action: 'list databases' },
    ];

    res.json({
      databases: databases.map(db => ({ id: db.id, title: db.title })),
      categories,
      quickStats,
      quickActions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
