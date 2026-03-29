/**
 * Lightweight Markdown to HTML renderer
 * Handles: headings, bold, italic, code, links, lists, tables, blockquotes, hr
 */
function renderMarkdown(text) {
  if (!text) return '';

  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Tables
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return tableBlock;

    let table = '<table>';
    rows.forEach((row, i) => {
      // Skip separator row (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(row)) return;

      const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const tag = i === 0 ? 'th' : 'td';
      const wrapper = i === 0 ? 'thead' : (i === 1 ? 'tbody' : '');

      if (wrapper === 'thead') table += '<thead>';
      if (wrapper === 'tbody') table += '</thead><tbody>';

      table += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  // Process line by line for block elements
  const lines = html.split('\n');
  let result = [];
  let inList = false;
  let listType = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip if inside a pre block (already handled)
    if (line.includes('<pre>') || line.includes('</pre>')) {
      result.push(line);
      continue;
    }

    // Headings
    if (/^### (.+)/.test(line)) {
      closeList();
      result.push(`<h3>${line.slice(4)}</h3>`);
      continue;
    }
    if (/^## (.+)/.test(line)) {
      closeList();
      result.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }
    if (/^# (.+)/.test(line)) {
      closeList();
      result.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList();
      result.push('<hr>');
      continue;
    }

    // Blockquote
    if (/^&gt; (.+)/.test(line)) {
      closeList();
      result.push(`<blockquote>${line.slice(5)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*] (.+)/.test(line)) {
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        result.push('<ul>');
      }
      result.push(`<li>${line.replace(/^[-*] /, '')}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. (.+)/.test(line)) {
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        result.push('<ol>');
      }
      result.push(`<li>${line.replace(/^\d+\. /, '')}</li>`);
      continue;
    }

    // Regular line
    closeList();
    if (line.trim() === '') {
      result.push('');
    } else {
      result.push(`<p>${line}</p>`);
    }
  }
  closeList();

  html = result.join('\n');

  // Inline formatting
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;

  function closeList() {
    if (inList) {
      result.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
      listType = '';
    }
  }
}

window.renderMarkdown = renderMarkdown;
