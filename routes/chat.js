const express = require('express');
const router = express.Router();
const { chat } = require('../lib/claude');
const { v4: uuidv4 } = require('uuid');

// In-memory session store
const sessions = new Map();

// Cleanup old sessions every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.lastAccess < cutoff) sessions.delete(id);
  }
}, 30 * 60 * 1000);

router.post('/', async (req, res) => {
  try {
    const { message, sessionId: clientSessionId } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const sessionId = clientSessionId || uuidv4();

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { history: [], lastAccess: Date.now() });
    }

    const session = sessions.get(sessionId);
    session.lastAccess = Date.now();

    const result = await chat(session.history, message.trim(), sessionId);
    session.history = result.conversationHistory;

    res.json({
      sessionId,
      response: result.response,
      structured: result.structured || null,
      suggestions: result.suggestions || [],
      tool: result.tool || null,
      confidence: result.confidence || null,
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// Reset a conversation
router.delete('/:sessionId', (req, res) => {
  sessions.delete(req.params.sessionId);
  res.json({ success: true });
});

module.exports = router;
