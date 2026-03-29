/**
 * Database Cache — Pre-caches all databases for instant name→ID resolution.
 * Refreshes every 5 minutes. Zero external dependencies.
 */

const notion = require('./notion');

let databases = [];       // [{id, title, description, url}]
let nameIndex = {};       // lowercase name fragments → database id
let lastRefresh = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

/**
 * Refresh the database cache from Notion API
 */
async function refresh() {
  try {
    const dbs = await notion.listDatabases();
    databases = dbs;

    // Build name index — maps fragments to database IDs
    nameIndex = {};
    for (const db of dbs) {
      const title = db.title || '';
      const desc = db.description || '';
      const combined = `${title} ${desc}`.toLowerCase();

      // Index full title
      nameIndex[title.toLowerCase()] = db.id;

      // Index each meaningful word (3+ chars)
      const words = combined.split(/[\s—\-_,،.()]+/).filter(w => w.length >= 3);
      for (const word of words) {
        // Skip common words
        if (['the', 'and', 'for', 'with', 'من', 'في', 'على', 'إلى', 'مع'].includes(word)) continue;
        if (!nameIndex[word]) nameIndex[word] = db.id;
      }

      // Index emoji-stripped title
      const stripped = title.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim().toLowerCase();
      if (stripped) nameIndex[stripped] = db.id;
    }

    lastRefresh = Date.now();
    console.log(`  [Cache] Refreshed: ${databases.length} databases, ${Object.keys(nameIndex).length} index entries`);
  } catch (err) {
    console.error('  [Cache] Refresh failed:', err.message);
  }
}

/**
 * Auto-refresh if stale
 */
async function ensureFresh() {
  if (Date.now() - lastRefresh > REFRESH_INTERVAL) {
    await refresh();
  }
}

/**
 * Get all cached databases
 */
function getAll() {
  return databases;
}

/**
 * Fuzzy-match a user string to a database ID
 * Returns { id, title, confidence } or null
 */
function resolveDatabase(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // Exact title match
  const exactMatch = databases.find(db => db.title.toLowerCase() === lower);
  if (exactMatch) return { id: exactMatch.id, title: exactMatch.title, confidence: 1.0 };

  // Exact index match
  if (nameIndex[lower]) {
    const db = databases.find(d => d.id === nameIndex[lower]);
    if (db) return { id: db.id, title: db.title, confidence: 0.9 };
  }

  // Token matching — score each database by how many tokens match
  const tokens = lower.split(/\s+/).filter(t => t.length >= 2);
  let bestMatch = null;
  let bestScore = 0;

  for (const db of databases) {
    const dbText = `${db.title} ${db.description || ''}`.toLowerCase();
    let score = 0;

    for (const token of tokens) {
      if (dbText.includes(token)) score += 2;
      // Check index
      if (nameIndex[token] === db.id) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = db;
    }
  }

  if (bestMatch && bestScore >= 2) {
    return { id: bestMatch.id, title: bestMatch.title, confidence: Math.min(bestScore / 6, 0.95) };
  }

  // Levenshtein fuzzy match on database titles
  for (const db of databases) {
    const dbTitle = db.title.toLowerCase().replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();
    for (const token of tokens) {
      if (token.length >= 4 && levenshtein(token, dbTitle) <= 3) {
        return { id: db.id, title: db.title, confidence: 0.6 };
      }
      // Check if any word in DB title is close
      const dbWords = dbTitle.split(/\s+/);
      for (const dw of dbWords) {
        if (dw.length >= 4 && token.length >= 4 && levenshtein(token, dw) <= 2) {
          return { id: db.id, title: db.title, confidence: 0.5 };
        }
      }
    }
  }

  return null;
}

/**
 * Find databases matching any of the given tokens
 * Returns array of { id, title, matchedToken }
 */
function findDatabases(tokens) {
  const matches = [];
  const seen = new Set();

  for (const token of tokens) {
    if (token.length < 3) continue;
    const lower = token.toLowerCase();

    // Check index
    if (nameIndex[lower] && !seen.has(nameIndex[lower])) {
      const db = databases.find(d => d.id === nameIndex[lower]);
      if (db) {
        matches.push({ id: db.id, title: db.title, matchedToken: token });
        seen.add(db.id);
      }
    }

    // Check title contains
    for (const db of databases) {
      if (seen.has(db.id)) continue;
      if (db.title.toLowerCase().includes(lower)) {
        matches.push({ id: db.id, title: db.title, matchedToken: token });
        seen.add(db.id);
      }
    }
  }

  return matches;
}

/**
 * Simple Levenshtein distance
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }

  return matrix[b.length][a.length];
}

module.exports = { refresh, ensureFresh, getAll, resolveDatabase, findDatabases };
