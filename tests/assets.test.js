// Eval tests for the asset/reference flow — the "character sheet" scenario:
// the agent generates 3 candidate sheets, the person picks #2, the pick becomes
// the active reference (role: tag), and later gets swapped for another sheet.
// Runs against the real store in a throwaway data dir.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the store at a temp dir BEFORE importing it.
process.env.JENAI_DATA_DIR = mkdtempSync(join(tmpdir(), 'jenai-assets-test-'));
const store = await import('../server/storage/store.js');
store.ensureDirs();

after(() => {
  store.flushJobs();
  rmSync(process.env.JENAI_DATA_DIR, { recursive: true, force: true });
});

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const DATA_URL = `data:image/png;base64,${PNG_B64}`;
const PROJECT = 'character-test';

// A finished generation job with a real file on disk — what generate_image
// leaves behind for each candidate.
function fakeDoneJob(id) {
  const file_name = `${id}.png`;
  writeFileSync(join(store.filesDir(), file_name), Buffer.from(PNG_B64, 'base64'));
  const job = {
    job_id: id, project_id: PROJECT, task: 'image', status: 'done',
    prompt: `character sheet candidate ${id}`, created_at: new Date().toISOString(),
    outputs: [{ type: 'image', file_name, local_url: `/api/files/${file_name}` }],
  };
  store.putJob(job);
  return job;
}

// The convention the skills teach: the asset carrying `role:<x>` is the active
// reference for that role. This helper is "what the agent does" to find it.
const activeFor = (role) => store.getAssets(PROJECT).filter((a) => a.tags.includes(`role:${role}`));

// --- Scenario: 3 candidates → the person picks the second one ---------------

test('the person picks candidate #2 → it becomes the active role reference', () => {
  // Agent generated three numbered candidates (1., 2., 3. in the MCP result).
  fakeDoneJob('cand-1'); fakeDoneJob('cand-2'); fakeDoneJob('cand-3');

  // "I like the second one" → the agent maps 2 → job_id cand-2 and promotes it.
  const asset = store.addAssetFromJob({
    project: PROJECT, job_id: 'cand-2',
    name: 'hero character sheet', tags: ['character', 'sheet', 'role:hero'],
  });

  assert.equal(asset.source, 'generated');
  assert.equal(asset.from_job_id, 'cand-2');
  assert.deepEqual(asset.tags, ['character', 'sheet', 'role:hero']);
  // The asset got its OWN copy of the file — independent of the job.
  assert.notEqual(asset.file_name, 'cand-2.png');
  assert.ok(existsSync(join(store.filesDir(), asset.file_name)));

  // Exactly one active reference for the role, and it's the picked one.
  const active = activeFor('hero');
  assert.equal(active.length, 1);
  assert.equal(active[0].from_job_id, 'cand-2');
});

test('the pick survives deleting the source generation', () => {
  // The person cleans up the losing candidates — and even the winning job.
  store.deleteJob('cand-1'); store.deleteJob('cand-2'); store.deleteJob('cand-3');

  const active = activeFor('hero');
  assert.equal(active.length, 1, 'active reference still exists');
  assert.ok(existsSync(join(store.filesDir(), active[0].file_name)), 'asset file still on disk');
});

// --- Scenario: "actually, use a different character sheet" -------------------

test('swapping: the role tag moves to the new sheet, the old one is kept', () => {
  const old = activeFor('hero')[0];

  // New candidate generated and picked.
  fakeDoneJob('cand-4');
  const next = store.addAssetFromJob({
    project: PROJECT, job_id: 'cand-4',
    name: 'hero sheet v2 (red jacket)', tags: ['character', 'sheet'],
  });

  // The agent moves the role tag: re-tag old WITHOUT role:, tag new WITH it.
  store.updateAsset(old.asset_id, { tags: old.tags.filter((t) => t !== 'role:hero') });
  store.updateAsset(next.asset_id, { tags: [...next.tags, 'role:hero'] });

  const active = activeFor('hero');
  assert.equal(active.length, 1, 'still exactly one active reference');
  assert.equal(active[0].from_job_id, 'cand-4', 'the new sheet is active');

  // The old sheet is retired, not gone — the person can bring it back.
  const retired = store.getAssets(PROJECT).find((a) => a.asset_id === old.asset_id);
  assert.ok(retired, 'old sheet still in the library');
  assert.deepEqual(retired.tags, ['character', 'sheet']);
});

// --- The mechanics the flows above depend on --------------------------------

test('uploads: tags normalize (string or array), dedupe, trim', () => {
  const a = store.addAssetFromUpload({ project: PROJECT, dataUrl: DATA_URL, name: 'ref', tags: ' character,  cat , character' });
  assert.deepEqual(a.tags, ['character', 'cat']);
  const b = store.addAssetFromUpload({ project: PROJECT, dataUrl: DATA_URL, tags: ['x', 'x', ' y '] });
  assert.deepEqual(b.tags, ['x', 'y']);
  store.deleteAsset(a.asset_id); store.deleteAsset(b.asset_id);
});

test('replace swaps the file, delete removes record + file', () => {
  const a = store.addAssetFromUpload({ project: PROJECT, dataUrl: DATA_URL, name: 'to-replace' });
  const oldFile = a.file_name;
  const replaced = store.replaceAssetFile(a.asset_id, DATA_URL);
  assert.notEqual(replaced.file_name, oldFile);
  assert.ok(!existsSync(join(store.filesDir(), oldFile)), 'old file removed');
  assert.ok(existsSync(join(store.filesDir(), replaced.file_name)));

  assert.equal(store.deleteAsset(a.asset_id), true);
  assert.ok(!existsSync(join(store.filesDir(), replaced.file_name)), 'file removed with the asset');
  assert.equal(store.getAssets(PROJECT).some((x) => x.asset_id === a.asset_id), false);
});

test('promote by URL copies a local /api/files reference', async () => {
  const j = fakeDoneJob('cand-url');
  const a = await store.addAssetFromUrl({ project: PROJECT, url: j.outputs[0].local_url, name: 'via-url', tags: ['prop'] });
  assert.equal(a.type, 'image');
  assert.notEqual(a.file_name, j.outputs[0].file_name);
  assert.ok(existsSync(join(store.filesDir(), a.file_name)));
  store.deleteAsset(a.asset_id); store.deleteJob('cand-url');
});

test('renaming a project carries its jobs and assets along', () => {
  store.addProject('English Marketing Title');
  fakeDoneJob('cand-rn');
  const j = store.getJob('cand-rn'); j.project_id = 'English Marketing Title'; store.putJob(j);
  const a = store.addAssetFromJob({ project: 'English Marketing Title', job_id: 'cand-rn', tags: ['x'] });

  store.renameProject('English Marketing Title', 'פאודה');

  assert.ok(store.getProjects().includes('פאודה'));
  assert.ok(!store.getProjects().includes('English Marketing Title'));
  assert.equal(store.getJobs('פאודה').jobs.some((x) => x.job_id === 'cand-rn'), true);
  assert.equal(store.getAssets('פאודה').some((x) => x.asset_id === a.asset_id), true);
  assert.equal(store.getAssets('English Marketing Title').length, 0);
  // Name collisions are refused.
  assert.throws(() => store.renameProject('פאודה', 'default'));
  store.deleteProject('פאודה');
});

test('oxen with a local reference and no Kie key fails clearly, not "model busy"', async () => {
  // The temp data dir has no keys, so there's nothing to host the reference on.
  const { oxen } = await import('../server/adapters/oxen.js');
  const { makeError, codeFromMessage } = await import('../server/errors/map.js');
  const ctx = {
    providerSlug: 'google-nano-banana-pro',
    model: { type: 'image', label: 'Nano Banana Pro', resolutions: ['1K'], aspectRatios: ['9:16'] },
    key: 'oxen-key',
    makeError: (c, e = {}) => makeError(c, { provider: 'Oxen.ai', ...e }),
    sniff: codeFromMessage,
  };
  const req = {
    task: 'image', mode: 'reference_to_x', model: 'nano-banana-pro', prompt: 'x',
    aspect_ratio: '9:16', num_outputs: 1,
    input_images: [{ role: 'reference', url: DATA_URL }],
  };
  const r = await oxen.submit(req, ctx);
  assert.ok(r.error, 'returns an error');
  assert.equal(r.error.code, 'BAD_REQUEST'); // NOT PROVIDER_DOWN ("model busy")
  assert.match(JSON.stringify(r.error.raw || ''), /Kie|reference|reachable/i);
});

test('deleting a project purges its assets and their files', () => {
  const doomed = 'doomed-project';
  store.addProject(doomed);
  fakeDoneJob('cand-5');
  // Move the candidate's asset into the doomed project.
  const a = store.addAssetFromJob({ project: doomed, job_id: 'cand-5', tags: ['x'] });
  const file = a.file_name;
  store.deleteProject(doomed);
  assert.equal(store.getAssets(doomed).length, 0);
  assert.ok(!existsSync(join(store.filesDir(), file)), 'asset file purged with project');
  store.deleteJob('cand-5');
});
