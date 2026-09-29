import { getErrorMessage } from '../../../api/client';

/** File name from a Content-Disposition header (RFC 6266 filename* or filename), else `fallback`. */
export function filenameFromDisposition(header, fallback = 'download') {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:[\w-]+)?'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // malformed encoding: fall through to the plain parameter
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = plain ? (plain[2] ?? plain[1]).trim() : '';
  // never let a server-provided name escape into a path
  return name ? name.replace(/[\\/]/g, '_') : fallback;
}

/** Saves a Blob as a file through a temporary <a download>. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Saves an axios response made with responseType 'blob'; returns the file name used. */
export function saveResponse(res, fallback) {
  const header = res?.headers?.['content-disposition'] ?? res?.headers?.get?.('content-disposition');
  const name = filenameFromDisposition(header, fallback);
  const type = res?.headers?.['content-type'] || 'application/octet-stream';
  const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data ?? ''], { type });
  saveBlob(blob, name);
  return name;
}

/**
 * Error message for a request made with responseType 'blob': the JSON error body arrives as a
 * Blob, so getErrorMessage alone would only see the generic axios message.
 */
export async function blobErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const json = JSON.parse(await readBlobText(data));
      return json.message || json.error || fallback;
    } catch {
      return fallback;
    }
  }
  return getErrorMessage(err, fallback);
}

function readBlobText(blob) {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
