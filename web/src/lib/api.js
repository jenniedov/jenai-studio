async function jget(path) {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function jsend(path, method, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.status), { data });
  return data;
}

export const api = {
  config: () => jget('/config'),
  models: () => jget('/models'),
  providers: () => jget('/providers'),
  projects: () => jget('/projects'),
  addProject: (name) => jsend('/projects', 'POST', { name }),
  reorderProjects: (projects) => jsend('/projects/order', 'POST', { projects }),
  archiveProject: (name, archived) => jsend('/projects/archive', 'POST', { name, archived }),
  deleteProject: (name) => jsend(`/projects/${encodeURIComponent(name)}`, 'DELETE'),
  setKey: (provider, key) => jsend('/keys', 'POST', { provider, key }),
  saveSettings: (patch) => jsend('/settings', 'POST', patch),
  verifyOpenrouter: () => jsend('/providers/openrouter/verify', 'POST'),
  prices: () => jget('/prices'),
  refreshPrices: () => jsend('/prices/refresh', 'POST'),
  updateCheck: () => jget('/update/check'),
  updateApply: () => jsend('/update/apply', 'POST'),
  skills: () => jget('/skills'),
  skill: (id) => jget(`/skills/${encodeURIComponent(id)}`),
  saveSkill: (body) => jsend('/skills', 'POST', body),
  deleteSkill: (id) => jsend(`/skills/${encodeURIComponent(id)}`, 'DELETE'),
  estimate: (model, num_outputs) => jsend('/estimate', 'POST', { model, num_outputs }),
  generate: (req) => jsend('/generate', 'POST', req),
  upload: (dataUrl) => jsend('/upload', 'POST', { dataUrl }),
  jobs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.project && params.project !== 'all') q.set('project', params.project);
    if (params.type) q.set('type', params.type);
    if (params.limit != null) q.set('limit', params.limit);
    if (params.offset != null) q.set('offset', params.offset);
    const s = q.toString();
    return jget(`/jobs${s ? `?${s}` : ''}`);
  },
  job: (id) => jget(`/jobs/${id}`),
  deleteJob: (id) => jsend(`/jobs/${id}`, 'DELETE'),
  assets: (project) => jget(`/assets${project && project !== 'all' ? `?project=${encodeURIComponent(project)}` : ''}`),
  addAsset: (body) => jsend('/assets', 'POST', body),
  updateAsset: (id, patch) => jsend(`/assets/${id}`, 'PATCH', patch),
  replaceAsset: (id, dataUrl) => jsend(`/assets/${id}/replace`, 'POST', { dataUrl }),
  deleteAsset: (id) => jsend(`/assets/${id}`, 'DELETE'),
};
