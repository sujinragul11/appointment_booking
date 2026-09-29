import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blobErrorMessage, filenameFromDisposition, saveResponse } from './download';

describe('filenameFromDisposition', () => {
  it('reads plain, quoted and RFC 5987 file names', () => {
    expect(filenameFromDisposition('attachment; filename=appointments-2026-09-29.csv', 'x')).toBe('appointments-2026-09-29.csv');
    expect(filenameFromDisposition('attachment; filename="invoice BK-1.pdf"', 'x')).toBe('invoice BK-1.pdf');
    expect(filenameFromDisposition("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf; filename=\"resume.pdf\"", 'x')).toBe('résumé.pdf');
  });

  it('falls back when missing and never returns a path', () => {
    expect(filenameFromDisposition(undefined, 'appointments.csv')).toBe('appointments.csv');
    expect(filenameFromDisposition('inline', 'fallback.pdf')).toBe('fallback.pdf');
    expect(filenameFromDisposition('attachment; filename="../../etc/passwd"', 'x')).toBe('.._.._etc_passwd');
  });
});

describe('saveResponse (export download helper)', () => {
  let clicked;
  beforeEach(() => {
    clicked = [];
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clicked.push({ href: this.getAttribute('href'), download: this.download, attached: document.body.contains(this) });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads the blob under the server-provided name and cleans up', () => {
    const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
    const name = saveResponse({ data: blob, headers: { 'content-disposition': 'attachment; filename=appointments-2026-09-29.csv' } }, 'appointments.csv');
    expect(name).toBe('appointments-2026-09-29.csv');
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ href: 'blob:mock-url', download: 'appointments-2026-09-29.csv', attached: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uses the fallback name and wraps non-blob bodies', () => {
    const name = saveResponse({ data: 'x', headers: {} }, 'appointments.pdf');
    expect(name).toBe('appointments.pdf');
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
  });
});

describe('blobErrorMessage', () => {
  it('reads the JSON error message out of a Blob body', async () => {
    const err = { response: { status: 400, data: new Blob([JSON.stringify({ message: 'Unknown format' })], { type: 'application/json' }) } };
    expect(await blobErrorMessage(err, 'fallback')).toBe('Unknown format');
  });

  it('falls back for unreadable bodies and uses normal errors as is', async () => {
    expect(await blobErrorMessage({ response: { data: new Blob(['<html>']) } }, 'fallback')).toBe('fallback');
    expect(await blobErrorMessage({ response: { data: { message: 'Plain' } } }, 'fallback')).toBe('Plain');
  });
});
