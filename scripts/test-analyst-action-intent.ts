import assert from 'node:assert/strict';
import test from 'node:test';
import { explicitTaskDeadline, isExplicitViewChangeRequest, isExplicitWriteRequest } from '../server/llm/actionIntent.ts';

test('[MOCKED] write intent distinguishes requested changes from analysis and draft-only requests', () => {
  for (const q of [
    'Create a follow-up task for Voltyatra due in 2 days.',
    'Please create a task for the owner of the open proposal.',
    'Can you assign this opportunity to Kavya?',
    'I want you to schedule a meeting with the sponsor.',
    'Create a task without changing the opportunity stage.',
    'Create a task, but do not change the approved scenario.',
  ]) assert.equal(isExplicitWriteRequest(q), true, q);

  for (const q of [
    'Prepare a follow-up task for the owner; show the details and wait for confirmation.',
    'Prepare a task, but do not create it yet.',
    'Which channel has the strongest results, and why?',
    'What should we change about the follow-up process?',
    'Based on the diagnosis, what task should the team do next?',
    'Create a task draft but do not actually create it until I confirm.',
    'Create a task, but do not create it until I confirm.',
  ]) assert.equal(isExplicitWriteRequest(q), false, q);
});

test('[MOCKED] deadlines are extracted only when the user states one', () => {
  assert.equal(explicitTaskDeadline('Prepare a task due in two days.'), 'in two days');
  assert.equal(explicitTaskDeadline('Create it by 2026-12-03.'), '2026-12-03');
  assert.equal(explicitTaskDeadline('Set the task for next Friday.'), 'next Friday');
  for (const q of [
    'Prepare a follow-up task and show me the due date from the record.',
    'Prepare a task, but do not create it yet.',
    'Follow up with the sponsor soon.',
  ]) assert.equal(explicitTaskDeadline(q), null, q);
});

test('[MOCKED] view changes require a clear view request and remain separate from ordinary charts', () => {
  assert.equal(isExplicitViewChangeRequest('Save this as a dashboard view named Cash risk.'), true);
  assert.equal(isExplicitViewChangeRequest('Show me the dashboard view for warm pipeline.'), true);
  assert.equal(isExplicitViewChangeRequest('Show warm and inbound conversion as a chart.'), false);
  assert.equal(isExplicitViewChangeRequest('Analyze the warm channel and its cash results.'), false);
  assert.equal(isExplicitViewChangeRequest('Do not save a dashboard view yet.'), false);
  assert.equal(isExplicitViewChangeRequest('Save this dashboard view, but do not create a follow-up task.'), true);
});
