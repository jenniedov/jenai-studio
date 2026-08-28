// Smoke test: with a real key in the environment, do one cheap image
// generation end-to-end and assert a file lands locally. Also the workshop
// "is my key working?" check.
//
// Usage:
//   KIE_API_KEY=... npm run smoke
//   OXEN_API_KEY=... npm run smoke -- --provider oxen --model nano-banana-2

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const PORT = Number(process.env.PORT) || 4319; // separate port so it doesn't clash
const provider = arg('provider', process.env.KIE_API_KEY ? 'kie' : 'oxen');
const model = arg('model', 'nano-banana-2');
const prompt = arg('prompt', 'a small red panda barista, golden hour, simple');

const key = provider === 'kie' ? process.env.KIE_API_KEY : process.env.OXEN_API_KEY;
if (!key) {
  console.error(`\n  ✗ No API key found. Set ${provider === 'kie' ? 'KIE_API_KEY' : 'OXEN_API_KEY'} and try again.\n`);
  process.exit(1);
}

console.log(`\n  Smoke test → provider=${provider} model=${model}`);

// Boot the server on a throwaway port.
const server = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit',
});

const base = `http://localhost:${PORT}/api`;

async function main() {
  // Wait for health.
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) break;
    } catch { /* not up yet */ }
    await sleep(300);
  }

  // Make sure the key is stored.
  await fetch(`${base}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key }),
  });

  // Generate.
  const gen = await fetch(`${base}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task: 'image', provider, model, prompt, num_outputs: 1 }),
  }).then((r) => r.json());

  const jobId = gen.jobs?.[0]?.job_id;
  if (!jobId) throw new Error(`no job created: ${JSON.stringify(gen)}`);
  console.log(`  job ${jobId} created, waiting…`);

  // Poll until done or error.
  let job;
  for (let i = 0; i < 120; i++) {
    job = await fetch(`${base}/jobs/${jobId}`).then((r) => r.json());
    if (job.status === 'done' || job.status === 'error') break;
    await sleep(2000);
  }

  if (job.status === 'done' && job.outputs?.[0]?.local_url) {
    // Verify the file is actually served.
    const f = await fetch(`http://localhost:${PORT}${job.outputs[0].local_url}`);
    if (!f.ok) throw new Error('output file not served');
    console.log(`\n  ✓ SUCCESS — image saved and served at ${job.outputs[0].local_url}\n`);
    return 0;
  }

  console.error(`\n  ✗ FAILED — status=${job.status} code=${job.error?.code}`);
  console.error(`    ${job.error?.friendly?.en?.body || ''}\n`);
  return 1;
}

main()
  .then((code) => { server.kill(); process.exit(code); })
  .catch((e) => { console.error('\n  ✗ ERROR:', e.message, '\n'); server.kill(); process.exit(1); });
