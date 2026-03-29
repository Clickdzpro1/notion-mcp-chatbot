/**
 * Rich UI Components — Renders structured API responses into interactive cards.
 * Vanilla JS, zero dependencies.
 */

const Components = {
  /**
   * Main renderer — takes structured data and returns HTML
   */
  render(structured, suggestions) {
    if (!structured) return '';

    let html = '';

    switch (structured.type) {
      case 'database_list':
        html = this.databaseList(structured.items);
        break;
      case 'search_results':
        html = this.searchResults(structured.items);
        break;
      case 'schema':
        html = this.schema(structured);
        break;
      case 'query_results':
        html = this.queryResults(structured);
        break;
      case 'page':
        html = this.pageCard(structured);
        break;
      case 'analysis':
        html = this.analysis(structured);
        break;
      case 'help':
        html = this.helpCard(structured);
        break;
      case 'workflow_step':
        html = this.workflowStep(structured);
        break;
      case 'created':
        html = this.createdCard(structured);
        break;
      default:
        break;
    }

    if (suggestions && suggestions.length > 0) {
      html += this.suggestionChips(suggestions);
    }

    return html;
  },

  // ============================================================
  // Database List
  // ============================================================
  databaseList(items) {
    if (!items || items.length === 0) return '';
    return `<div class="rich-grid">${items.map(db => `
      <div class="rich-card">
        <div class="rich-card-title">${escHtml(db.title)}</div>
        <div class="rich-card-desc">${escHtml(db.description || 'No description')}</div>
        <div class="rich-card-actions">
          <button class="chip-btn" onclick="sendAction('query ${db.id}')">📋 Query</button>
          <button class="chip-btn" onclick="sendAction('schema ${db.id}')">🔧 Schema</button>
          <button class="chip-btn" onclick="sendAction('analyze ${db.id} overview')">📊 Analyze</button>
        </div>
      </div>
    `).join('')}</div>`;
  },

  // ============================================================
  // Search Results
  // ============================================================
  searchResults(items) {
    if (!items || items.length === 0) return '';
    return `<div class="rich-list">${items.map(r => `
      <div class="rich-list-item" onclick="sendAction('${r.type === 'database' ? 'query' : 'content'} ${r.id}')">
        <span class="badge badge-${r.type}">${r.type}</span>
        <span class="rich-list-title">${escHtml(r.title)}</span>
        <span class="rich-list-arrow">→</span>
      </div>
    `).join('')}</div>`;
  },

  // ============================================================
  // Schema
  // ============================================================
  schema(data) {
    if (!data.fields) return '';
    return `<div class="rich-table-wrap"><table class="rich-table">
      <thead><tr><th>Field</th><th>Type</th><th>Options</th></tr></thead>
      <tbody>${data.fields.map(f => `
        <tr>
          <td><strong>${escHtml(f.name)}</strong></td>
          <td><code>${escHtml(f.type)}</code></td>
          <td>${f.options ? f.options.map(o => `<span class="mini-badge">${escHtml(o)}</span>`).join(' ') : '—'}</td>
        </tr>
      `).join('')}</tbody>
    </table></div>`;
  },

  // ============================================================
  // Query Results
  // ============================================================
  queryResults(data) {
    if (!data.rows || data.rows.length === 0) return '';

    // Get all property keys from first few rows
    const keys = new Set();
    data.rows.slice(0, 5).forEach(r => {
      Object.keys(r.properties || {}).forEach(k => keys.add(k));
    });
    const columns = [...keys].slice(0, 6); // Max 6 columns

    return `<div class="rich-table-wrap">
      <div class="rich-table-info">${data.total} total rows</div>
      <table class="rich-table">
        <thead><tr>${columns.map(c => `<th>${escHtml(c)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${data.rows.slice(0, 15).map(r => `
          <tr>
            ${columns.map(c => {
              const v = r.properties?.[c];
              return `<td>${v != null ? escHtml(String(typeof v === 'object' ? JSON.stringify(v) : v)).substring(0, 50) : '—'}</td>`;
            }).join('')}
            <td><button class="chip-btn chip-sm" onclick="sendAction('content ${r.id}')">📖</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>`;
  },

  // ============================================================
  // Page Card
  // ============================================================
  pageCard(data) {
    if (!data.properties) return '';
    return `<div class="rich-card rich-card-wide">
      <div class="rich-card-title">📝 ${escHtml(data.title || 'Page')}</div>
      <div class="rich-props">${data.properties.map(p => `
        <div class="rich-prop">
          <span class="rich-prop-key">${escHtml(p.key)}</span>
          <span class="rich-prop-val">${escHtml(p.value)}</span>
        </div>
      `).join('')}</div>
    </div>`;
  },

  // ============================================================
  // Analysis
  // ============================================================
  analysis(data) {
    if (!data.computed_stats) return '';
    const stats = Object.entries(data.computed_stats);
    if (stats.length === 0) return '';

    return `<div class="rich-stats-grid">${stats.map(([name, stat]) => {
      if (stat.type === 'number') {
        return `<div class="stat-card">
          <div class="stat-label">${escHtml(name)}</div>
          <div class="stat-value">${stat.sum.toLocaleString()}</div>
          <div class="stat-sub">Avg: ${stat.avg} · Min: ${stat.min} · Max: ${stat.max}</div>
        </div>`;
      } else if (stat.distribution) {
        const entries = Object.entries(stat.distribution).sort(([, a], [, b]) => b - a);
        return `<div class="stat-card stat-card-wide">
          <div class="stat-label">${escHtml(name)}</div>
          <div class="stat-bars">${entries.map(([label, count]) => {
            const max = Math.max(...entries.map(([, c]) => c));
            const pct = Math.round((count / max) * 100);
            return `<div class="stat-bar-row">
              <span class="stat-bar-label">${escHtml(label)}</span>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
              <span class="stat-bar-count">${count}</span>
            </div>`;
          }).join('')}</div>
        </div>`;
      } else if (stat.type === 'checkbox') {
        return `<div class="stat-card">
          <div class="stat-label">${escHtml(name)}</div>
          <div class="stat-value">✅ ${stat.checked} / ❌ ${stat.unchecked}</div>
        </div>`;
      }
      return '';
    }).join('')}</div>`;
  },

  // ============================================================
  // Help Card with Database Quick Access
  // ============================================================
  helpCard(data) {
    if (!data.databases || data.databases.length === 0) return '';
    return `<div class="rich-grid">${data.databases.map(db => `
      <div class="rich-card rich-card-compact" onclick="sendAction('query ${db.id}')">
        <div class="rich-card-title">${escHtml(db.title)}</div>
      </div>
    `).join('')}</div>`;
  },

  // ============================================================
  // Suggestion Chips
  // ============================================================
  // ============================================================
  // Workflow Step
  // ============================================================
  workflowStep(data) {
    const pct = data.progress || 0;
    const dots = Array.from({ length: data.totalSteps }, (_, i) => {
      const state = i < data.currentStep ? 'done' : i === data.currentStep ? 'active' : 'pending';
      return `<div class="step-dot ${state}"></div>`;
    }).join('');

    let optionsHtml = '';
    if (data.options && data.options.length > 0) {
      optionsHtml = `<div class="wf-options">${data.options.map(o =>
        `<button class="chip-btn" onclick="sendAction('${escAttr(o)}')">${escHtml(o)}</button>`
      ).join('')}</div>`;
    }

    let collectedHtml = '';
    if (data.collected && Object.keys(data.collected).length > 0) {
      collectedHtml = `<div class="wf-collected">${Object.entries(data.collected).map(([k, v]) =>
        `<span class="wf-tag">✅ ${escHtml(k)}: ${escHtml(String(v))}</span>`
      ).join('')}</div>`;
    }

    return `<div class="wf-card">
      <div class="wf-header">
        <span class="wf-label">${escHtml(data.workflowLabel || 'Workflow')}</span>
        <span class="wf-progress">Step ${data.currentStep + 1}/${data.totalSteps}</span>
      </div>
      <div class="wf-progress-bar"><div class="wf-progress-fill" style="width:${pct}%"></div></div>
      <div class="wf-dots">${dots}</div>
      ${collectedHtml}
      ${optionsHtml}
    </div>`;
  },

  // ============================================================
  // Created Card
  // ============================================================
  createdCard(data) {
    if (!data) return '';
    let propsHtml = '';
    if (data.properties) {
      propsHtml = Object.entries(data.properties).map(([k, v]) =>
        `<div class="rich-prop"><span class="rich-prop-key">${escHtml(k)}</span><span class="rich-prop-val">${escHtml(String(v))}</span></div>`
      ).join('');
    }
    return `<div class="rich-card rich-card-wide">
      ${propsHtml ? `<div class="rich-props">${propsHtml}</div>` : ''}
      ${data.url ? `<a href="${escAttr(data.url)}" target="_blank" class="chip-btn" style="margin-top:8px;display:inline-block;">🔗 Open in Notion</a>` : ''}
    </div>`;
  },

  // ============================================================
  // Dashboard
  // ============================================================
  dashboard(data) {
    let html = '<div class="dashboard">';

    // Quick stats
    if (data.quickStats && Object.keys(data.quickStats).length > 0) {
      html += '<div class="dash-stats">';
      const statLabels = { totalClients: '👥 Clients', openTasks: '📋 Tasks', totalSales: '💰 Sales', pendingLeads: '🎯 Leads' };
      for (const [key, stat] of Object.entries(data.quickStats)) {
        html += `<div class="dash-stat" onclick="sendAction('query ${stat.dbId}')">
          <div class="dash-stat-value">${stat.count}</div>
          <div class="dash-stat-label">${statLabels[key] || key}</div>
        </div>`;
      }
      html += '</div>';
    }

    // Quick actions
    if (data.quickActions && data.quickActions.length > 0) {
      html += '<div class="dash-actions">';
      data.quickActions.forEach(a => {
        html += `<button class="chip-btn" onclick="sendAction('${escAttr(a.action)}')">${escHtml(a.label)}</button>`;
      });
      html += '</div>';
    }

    // Database list
    if (data.databases && data.databases.length > 0) {
      html += '<div class="dash-dbs">';
      data.databases.slice(0, 8).forEach(db => {
        html += `<div class="dash-db" onclick="sendAction('query ${db.id}')">
          <div class="dash-db-title">${escHtml(db.title)}</div>
          <div class="dash-db-desc">${escHtml(db.description || '')}</div>
        </div>`;
      });
      html += '</div>';
    }

    html += '</div>';
    return html;
  },

  suggestionChips(suggestions) {
    if (!suggestions || suggestions.length === 0) return '';
    return `<div class="suggestion-chips">${suggestions.map(s =>
      `<button class="chip-btn" onclick="sendAction('${escAttr(s.action)}')">${escHtml(s.label)}</button>`
    ).join('')}</div>`;
  },
};

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Global action sender — called by onclick handlers
function sendAction(action) {
  const input = document.getElementById('message-input');
  if (input) {
    input.value = action;
    // Trigger send
    document.getElementById('send-btn')?.click();
  }
}
