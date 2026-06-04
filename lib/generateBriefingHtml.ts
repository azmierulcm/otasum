'use client';

/**
 * generateBriefingHtml.ts
 *
 * Converts all 6 module markdown outputs into a single self-contained
 * HTML file with inline CSS — viewable offline, printable, no internet needed.
 */

import { marked } from 'marked';
import type { Module } from './types';

// ── Module metadata ───────────────────────────────────────────────────────────

const META: Record<string, { color: string; bg: string; emoji: string }> = {
  ofp:       { color: '#1B2B5E', bg: '#EEF1F8', emoji: '✈' },
  weather:   { color: '#0EA5E9', bg: '#EFF9FF', emoji: '🌤' },
  notams:    { color: '#D97706', bg: '#FFFBEB', emoji: '⚠' },
  windshear: { color: '#FC642D', bg: '#FFF4EE', emoji: '💨' },
  edto:      { color: '#00A699', bg: '#EDFAFA', emoji: '🌐' },
  fuel:      { color: '#FF5A5F', bg: '#FFF5F5', emoji: '⛽' },
};

// ── Inline CSS ────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #2d3748;
    background: #f7f7f7;
    padding: 0 0 60px;
  }

  /* ── Header ── */
  .site-header {
    background: #1B2B5E;
    color: white;
    padding: 20px 24px 16px;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
  .site-header h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
  .site-header p  { font-size: 11px; opacity: 0.7; margin-top: 2px; font-family: monospace; }
  .site-header .badge {
    display: inline-block; background: rgba(255,255,255,0.15);
    border-radius: 6px; padding: 2px 8px; font-size: 10px;
    letter-spacing: 0.5px; margin-top: 6px;
  }

  /* ── TOC ── */
  .toc {
    background: white; border-bottom: 1px solid #e2e8f0;
    padding: 12px 24px; display: flex; flex-wrap: wrap; gap: 8px;
  }
  .toc a {
    font-size: 11px; font-weight: 600; text-decoration: none;
    padding: 4px 10px; border-radius: 20px; border: 1.5px solid;
    transition: opacity 0.15s;
  }
  .toc a:hover { opacity: 0.75; }

  /* ── Modules ── */
  .modules { max-width: 900px; margin: 0 auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 20px; }

  .module { background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); }

  .module-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .module-header .emoji { font-size: 18px; }
  .module-header .num  { font-size: 10px; font-weight: 700; opacity: 0.6; letter-spacing: 0.5px; text-transform: uppercase; }
  .module-header .name { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }

  .module-body { padding: 20px; }

  /* ── Markdown elements ── */
  .module-body h2 {
    font-size: 15px; font-weight: 700; color: #1B2B5E;
    margin: 20px 0 10px; padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
  }
  .module-body h2:first-child { margin-top: 0; }
  .module-body h3 {
    font-size: 12px; font-weight: 700; color: #4a5568;
    text-transform: uppercase; letter-spacing: 0.5px;
    margin: 16px 0 8px;
  }
  .module-body h4 {
    font-size: 11px; font-weight: 700; color: #718096;
    text-transform: uppercase; letter-spacing: 0.8px;
    margin: 12px 0 6px;
  }
  .module-body p  { margin-bottom: 10px; font-size: 13px; }
  .module-body hr { border: none; border-top: 1px solid #e2e8f0; margin: 16px 0; }

  .module-body strong { font-weight: 700; color: #1B2B5E; }
  .module-body em     { color: #718096; font-style: italic; }

  .module-body ul { list-style: none; margin: 8px 0; padding: 0; }
  .module-body ul li {
    display: flex; gap: 8px; align-items: flex-start;
    font-size: 13px; margin-bottom: 5px; padding-left: 4px;
  }
  .module-body ul li::before {
    content: ''; display: block; width: 6px; height: 6px;
    border-radius: 50%; background: #FF5A5F;
    flex-shrink: 0; margin-top: 6px;
  }

  .module-body blockquote {
    border-left: 4px solid #FF5A5F; background: #fff5f5;
    padding: 10px 14px; border-radius: 0 8px 8px 0;
    margin: 10px 0; font-size: 13px; color: #4a5568;
  }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; margin: 10px 0; border-radius: 10px; border: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { background: #1B2B5E; color: white; }
  th {
    padding: 10px 12px; text-align: left; font-weight: 600;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px;
    white-space: nowrap;
  }
  td { padding: 8px 12px; border-top: 1px solid #f0f0f0; color: #4a5568; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }

  /* ── Code ── */
  code {
    background: #EEF1F8; color: #1B2B5E;
    padding: 1px 5px; border-radius: 4px;
    font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px;
  }
  pre {
    background: #1B2B5E; color: #a0f0c0;
    padding: 14px 16px; border-radius: 10px; overflow-x: auto;
    font-size: 11px; line-height: 1.5; margin: 10px 0;
  }
  pre code { background: none; color: inherit; padding: 0; }

  /* ── Footer ── */
  .footer {
    text-align: center; padding: 20px;
    font-size: 11px; color: #a0aec0;
  }

  /* ── Print ── */
  @media print {
    .site-header { position: static; }
    .toc { display: none; }
    .module { page-break-inside: avoid; box-shadow: none; border: 1px solid #e2e8f0; }
    body { background: white; }
  }

  @media (max-width: 640px) {
    .modules { padding: 12px 10px; }
    .module-body { padding: 14px; }
    .toc { padding: 10px 12px; }
  }
`;

// ── HTML generator ────────────────────────────────────────────────────────────

function wrapTables(html: string): string {
  return html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
}

export async function generateBriefingHtml(modules: Module[], fileName: string): Promise<string> {
  // Configure marked for GitHub-flavoured Markdown
  marked.setOptions({ gfm: true });

  const now  = new Date();
  const date = now.toUTCString();
  const base = fileName.replace(/\.pdf$/i, '');

  // ── TOC ──
  const tocLinks = modules
    .map(m => {
      const meta = META[m.key] ?? { color: '#1B2B5E', bg: '#EEF1F8' };
      return `<a href="#${m.key}" style="color:${meta.color};border-color:${meta.color};background:${meta.bg}">${META[m.key]?.emoji ?? ''} ${m.shortLabel}</a>`;
    })
    .join('');

  // ── Modules ──
  const moduleSections = await Promise.all(
    modules.map(async m => {
      const meta = META[m.key] ?? { color: '#1B2B5E', bg: '#f7f7f7', emoji: '•' };
      const rawHtml = await marked.parse(m.content);
      const bodyHtml = wrapTables(rawHtml);
      return `
      <div class="module" id="${m.key}">
        <div class="module-header" style="background:${meta.bg};color:${meta.color}">
          <span class="emoji">${meta.emoji}</span>
          <span class="num">Module ${m.number}</span>
          <span class="name">${m.label}</span>
        </div>
        <div class="module-body">${bodyHtml}</div>
      </div>`;
    }),
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Otasum Briefing — ${base}</title>
  <style>${CSS}</style>
</head>
<body>

  <header class="site-header">
    <h1>✈ Otasum AI Briefing</h1>
    <p>${fileName}</p>
    <span class="badge">Generated ${date}</span>
  </header>

  <nav class="toc">${tocLinks}</nav>

  <div class="modules">
    ${moduleSections.join('\n')}
  </div>

  <div class="footer">
    Otasum · AI-Powered Lido OFP Briefing · Generated ${date}
  </div>

</body>
</html>`;
}

// ── Download trigger ──────────────────────────────────────────────────────────

export async function downloadBriefing(modules: Module[], fileName: string): Promise<void> {
  const html     = await generateBriefingHtml(modules, fileName);
  const blob     = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = fileName.replace(/\.pdf$/i, '_briefing.html');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
