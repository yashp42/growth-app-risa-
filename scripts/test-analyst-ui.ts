import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownAnswer } from '../src/components/analyst/MarkdownAnswer.tsx';

function md(text: string): string {
  return renderToStaticMarkup(createElement(MarkdownAnswer, null, text));
}

test('[MOCKED] Chat answers render GitHub Markdown: tables, bold and lists, with no raw | or **', () => {
  const html = md(
    [
      '**Outstanding cash** by sponsor [M-07]:',
      '',
      '| Sponsor | Outstanding |',
      '|---|---:|',
      '| Bramble Active | ₹60,000 |',
      '',
      '- Total: **₹5,92,500**',
      '1. first',
    ].join('\n')
  );
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>Sponsor<\/th>/);
  assert.match(html, /<td[^>]*>Bramble Active<\/td>/);
  assert.match(html, /<strong[^>]*>Outstanding cash<\/strong>/);
  assert.match(html, /<ul/);
  assert.match(html, /<ol/);
  const visibleText = html.replace(/<[^>]+>/g, '');
  assert.ok(!visibleText.includes('|'), 'no raw table pipes');
  assert.ok(!visibleText.includes('**'), 'no raw bold markers');
});

test('[MOCKED] Markdown rendering is sanitized: raw HTML is dropped and javascript: links are neutralised', () => {
  const html = md(
    'Hi <script>alert(1)</script><img src=x onerror=alert(1)> [click](javascript:alert(1)) [ok](https://example.com)'
  );
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(!/onerror/i.test(html));
  assert.ok(!/javascript:/i.test(html));
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});
