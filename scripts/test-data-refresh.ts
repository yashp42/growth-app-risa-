import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changesWorkspaceData } from '../src/services/dataMutation.ts';
import { apiFetch } from '../src/services/authSession.ts';

test('metric POST reads never invalidate workspaces; real edits and confirmed actions do', () => {
  for (const path of ['/api/metrics/query', '/api/metrics/series?edition_id=ED-2026-DEMO', '/api/auth/refresh', '/api/ai/ask', '/api/ai/feedback', '/api/admin/parity']) {
    assert.equal(changesWorkspaceData(path, 'POST'), false, path);
  }
  for (const path of ['/api/campaigns', '/api/opportunities/OP-1/stage', '/api/imports/dataset', '/api/actions/ACT-1/confirm', '/api/ai/actions/batch/B-1/confirm']) {
    assert.equal(changesWorkspaceData(path, 'POST'), true, path);
  }
  assert.equal(changesWorkspaceData('/api/campaigns/C-1', 'PATCH'), true);
  assert.equal(changesWorkspaceData('/api/campaigns', 'GET'), false);
});

test('actual apiFetch: repeated metric responses settle without a refresh loop; successful write emits once', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let events = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    sessionStorage: { getItem: () => null },
    dispatchEvent: (event: Event) => { assert.equal(event.type, 'sgp:data-changed'); events++; return true; },
  } });
  try {
    globalThis.fetch = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    await Promise.all(Array.from({ length: 8 }, () => apiFetch('/api/metrics/query', { method: 'POST' })));
    await apiFetch('/api/metrics/series', { method: 'POST' });
    assert.equal(events, 0);
    await apiFetch('/api/campaigns', { method: 'POST' });
    assert.equal(events, 1);
    globalThis.fetch = async () => new Response('{}', { status: 422 });
    await apiFetch('/api/opportunities', { method: 'POST' });
    assert.equal(events, 1, 'Failed writes must not refresh');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
