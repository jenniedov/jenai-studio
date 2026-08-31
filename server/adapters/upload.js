// Re-host a base64 data: URL on a public temp host so providers that FETCH
// reference URLs server-side (Oxen, Kie) can reach a file that lives only on the
// user's machine. We use Kie's file API (public tempfile URLs, kept ~3 days) —
// it needs a Kie key, which most users have. One uploader, used by both adapters.

const KIE_UPLOAD = 'https://kieai.redpandaai.co/api/file-base64-upload';
const EXT_BY_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// dataUrl -> public https URL. Throws on failure (caller maps to a clean error).
export async function uploadDataUrlToKie(dataUrl, kieKey, i = 0) {
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const fileName = `ref-${Date.now()}-${i}.${EXT_BY_MIME[mime] || 'png'}`;
  const res = await fetch(KIE_UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kieKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'jenai-refs', fileName }),
  });
  let body = null; try { body = await res.json(); } catch { /* non-JSON */ }
  const url = body?.data?.fileUrl || body?.data?.downloadUrl;
  if (!res.ok || !url) {
    const status = body?.code ?? res.status;
    throw Object.assign(new Error(body?.msg || `file host returned ${status}`), { status, body });
  }
  return url;
}

export const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u || '');
export const isDataUrl = (u) => /^data:/i.test(u || '');
