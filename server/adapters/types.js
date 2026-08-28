// The adapter contract. JavaScript has no interfaces, so this file documents
// the shape every adapter must implement. Copy `_template.js` to add a provider.
//
// An adapter is a plain object:
//
//   {
//     id: 'kie',                     // provider key, matches models.json + keys store
//     label: 'Kie.ai',
//     signupUrl: 'https://kie.ai',
//
//     // Submit a generation. Return one of:
//     //   sync provider  -> { done: true, outputs: Output[] }
//     //   async provider -> { done: false, jobRef: 'task_123' }
//     //   failure        -> { error: NormalizedError }   (use makeError from ../errors/map.js)
//     async submit(req, ctx) { ... },
//
//     // Only for async providers. Given the jobRef, report progress.
//     //   -> { done: false }                         still running
//     //   -> { done: true, outputs: Output[] }       finished
//     //   -> { error: NormalizedError }              failed
//     async poll(jobRef, ctx) { ... },
//   }
//
// `req` is the UniversalRequest (see docs/../ §6.1):
//   { task, mode, provider, model, prompt, negative_prompt, aspect_ratio,
//     resolution, num_outputs, duration_seconds, generate_audio, seed,
//     input_images, project_id, provider_options }
//
// `ctx` is { key, providerSlug, model, makeError, base }:
//   key         - the provider API key (already checked to exist)
//   providerSlug- the provider-specific model id from models.json
//   model       - the universal model object
//   makeError   - (code, extra) => NormalizedError, from ../errors/map.js
//
// An Output is:
//   { type: 'image'|'video', url: 'https://provider/...', width?, height? }
// The server downloads `url` to local storage after the job finishes.

export {};
