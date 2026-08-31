// The job engine. Turns a universal /api/generate request into one or more
// normalized jobs, runs each through its adapter, downloads outputs locally,
// and persists progress. The UI and Claude only ever see the job abstraction —
// they never poll providers directly.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAdapter } from './adapters/index.js';
import { getKey, putJob, getJob, downloadToFiles, makeVideoPoster, setOpenrouterOpenaiVerified, localFileToDataUrl, isProviderEnabled } from './storage/store.js';
import { makeError, codeFromMessage } from './errors/map.js';
import { normalizeOptions, applyCustomOptions } from './options.js';

const here = dirname(fileURLToPath(import.meta.url));
const MODELS = JSON.parse(readFileSync(join(here, '..', 'config', 'models.json'), 'utf8'));

export const BATCH_CAP = 20;
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 120; // ~6 minutes

function findModel(key) {
  return MODELS.models.find((m) => m.key === key) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isoNow() {
  return new Date().toISOString();
}

/**
 * Validate a universal request and create the job records (one per output).
 * Returns { jobs } or throws { httpStatus, error } for a bad request.
 */
export function createJobs(req) {
  const model = findModel(req.model);
  if (!model) throw badRequest(`unknown model "${req.model}"`);
  if (model.type !== req.task) throw badRequest(`model "${req.model}" is a ${model.type}, not a ${req.task}`);

  const providerId = req.provider;
  const adapter = getAdapter(providerId);
  if (!adapter) throw badRequest(`unknown provider "${providerId}"`);
  if (!isProviderEnabled(providerId)) throw badRequest(`provider "${providerId}" is disabled — enable it in the Keys tab, or use another provider`);

  const providerSlug = model.providers?.[providerId];
  if (!providerSlug) throw badRequest(`model "${req.model}" is not available on ${providerId}`);

  // Normalize the generic options bag (and mirror built-ins onto req so the
  // adapters' existing field reads keep working).
  const options = normalizeOptions(req);

  const n = Math.max(1, Math.min(Number(req.num_outputs) || 1, BATCH_CAP));

  const jobs = [];
  for (let i = 0; i < n; i++) {
    const job = {
      job_id: `job_${randomUUID()}`,
      status: 'queued',
      task: req.task,
      mode: req.mode || 'text_to_x',
      provider: providerId,
      model: req.model,
      model_label: model.label,
      prompt: req.prompt,
      outputs: [],
      cost: model.priceUsd ?? null,
      error: null,
      project_id: req.project_id || 'default',
      created_at: isoNow(),
      // Public params so a failed job can be retried with the full setup.
      params: {
        aspect_ratio: req.aspect_ratio ?? null,
        resolution: req.resolution ?? null,
        num_outputs: n,
        duration_seconds: req.duration_seconds ?? null,
        generate_audio: req.generate_audio ?? null,
        input_images: req.input_images || [],
        options, // full generic bag (built-ins + custom) for retry + display
      },
      _req: req, // kept internally for processing; stripped from API responses
    };
    putJob(job);
    jobs.push(job);
  }
  return { jobs, model, adapter, providerSlug };
}

/**
 * Process a single job to completion in the background. Never throws — every
 * failure lands as job.status = 'error' with a normalized, decorated error.
 */
export async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  const req = job._req;
  // Inline any local reference images as base64 data URLs — external providers
  // (OpenRouter/Google, Kie, Oxen) can't fetch our localhost file URLs.
  if (req.input_images?.length) {
    req.input_images = req.input_images.map((i) => (i?.url ? { ...i, url: localFileToDataUrl(i.url) } : i));
  }
  const model = findModel(job.model);
  const adapter = getAdapter(job.provider);
  const key = getKey(job.provider);

  const providerLabel = adapter.label || job.provider;
  const ctx = {
    key,
    providerSlug: model.providers[job.provider],
    model,
    makeError: (code, extra = {}) => makeError(code, { provider: providerLabel, model: model.label, ...extra }),
    sniff: codeFromMessage,
    // Apply this model's custom options to a provider payload (config-driven,
    // per-provider `map`). Built-ins are still handled by the adapter itself.
    applyOptions: (payload) => applyCustomOptions(payload, model, job.provider, req.options || {}),
  };

  if (!key) return fail(job, ctx.makeError('AUTH_MISSING'));

  mark(job, 'running');

  let result;
  try {
    result = await adapter.submit(req, ctx);
  } catch (e) {
    return fail(job, ctx.makeError('UNKNOWN', { raw: String(e) }));
  }
  if (result.error) { noteOpenrouterEligibility(job, ctx.providerSlug, false, result.error); return fail(job, result.error); }

  // Async provider: poll until done.
  if (!result.done) {
    let tries = 0;
    while (tries < POLL_MAX_TRIES) {
      await sleep(POLL_INTERVAL_MS);
      tries++;
      let poll;
      try {
        poll = await adapter.poll(result.jobRef, ctx);
      } catch (e) {
        return fail(job, ctx.makeError('UNKNOWN', { raw: String(e) }));
      }
      if (poll.error) return fail(job, poll.error);
      if (poll.done) {
        result = poll;
        break;
      }
    }
    if (!result.done) return fail(job, ctx.makeError('TIMEOUT'));
  }

  // Download outputs locally before provider URLs expire.
  const outputs = [];
  for (const out of result.outputs || []) {
    try {
      const fileName = await downloadToFiles(out.url, out.type, out.headers);
      const entry = {
        type: out.type,
        file_name: fileName,
        local_url: `/api/files/${fileName}`,
        provider_url: out.url,
        width: out.width || null,
        height: out.height || null,
      };
      // Videos get a lightweight poster frame so galleries render images, not
      // hundreds of live <video> elements.
      if (out.type === 'video') {
        const poster = await makeVideoPoster(fileName);
        if (poster) { entry.poster_name = poster; entry.poster_url = `/api/files/${poster}`; }
      }
      outputs.push(entry);
    } catch {
      // If the download fails, still surface the provider URL so nothing is lost.
      outputs.push({ type: out.type, local_url: out.url, provider_url: out.url });
    }
  }

  const fresh = getJob(job.job_id) || job;
  fresh.outputs = outputs;
  fresh.status = 'done';
  putJob(fresh);
  noteOpenrouterEligibility(job, ctx.providerSlug, true);
}

// Keep the "OpenAI-on-OpenRouter actually works" flag honest based on real
// outcomes: a success confirms it; a data-policy rejection marks it unusable.
// Only touches OpenAI-family OpenRouter slugs — nothing else is affected.
function noteOpenrouterEligibility(job, slug, ok, err) {
  if (job.provider !== 'openrouter' || !/^openai\//.test(slug || '')) return;
  if (ok) setOpenrouterOpenaiVerified(true);
  else if (err?.openrouterDataPolicy) setOpenrouterOpenaiVerified(false);
}

function mark(job, status) {
  const fresh = getJob(job.job_id) || job;
  fresh.status = status;
  putJob(fresh);
}

function fail(job, error) {
  const fresh = getJob(job.job_id) || job;
  fresh.status = 'error';
  fresh.error = error;
  putJob(fresh);
}

function badRequest(message) {
  return { httpStatus: 400, error: makeError('BAD_REQUEST', { raw: { message } }), message };
}

// Estimate cost for a batch, using models.json unit prices.
export function estimateCost(modelKey, numOutputs) {
  const model = findModel(modelKey);
  const unit = model?.priceUsd ?? null;
  if (unit == null) return null;
  return Math.round(unit * Math.max(1, numOutputs) * 100) / 100;
}

// Strip internal fields before sending a job over the API.
export function publicJob(job) {
  if (!job) return job;
  const { _req, ...rest } = job;
  return rest;
}
