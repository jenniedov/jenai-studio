import { kie } from './kie.js';
import { oxen } from './oxen.js';
import { openrouter } from './openrouter.js';

// Register every adapter here. To add one: copy _template.js, then add it here.
const ADAPTERS = [kie, oxen, openrouter];

const byId = new Map(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id) {
  return byId.get(id) || null;
}

export function listAdapters() {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label, signupUrl: a.signupUrl }));
}
