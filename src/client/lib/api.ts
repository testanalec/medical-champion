import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Please check your connection.', 'offline');
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  return data as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body: any = {}) => api<T>(p, { method: 'POST', body });
export const patch = <T = any>(p: string, body: any = {}) => api<T>(p, { method: 'PATCH', body });
export const put = <T = any>(p: string, body: any = {}) => api<T>(p, { method: 'PUT', body });

/** Data loader with optional polling (near-real-time boards, FRD §45). */
export function useApi<T = any>(path: string | null, opts: { poll?: number; deps?: any[] } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;
  const load = useCallback(async (silent = false) => {
    const p = pathRef.current;
    if (!p) return;
    if (!silent) setLoading(true);
    try {
      const d = await get<T>(p);
      if (pathRef.current === p) { setData(d); setError(null); }
    } catch (e: any) {
      if (pathRef.current === p) setError(e);
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
    if (!opts.poll) return;
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, opts.poll);
    return () => clearInterval(id);
  }, [path, opts.poll, ...(opts.deps || [])]);
  return { data, error, loading, reload: () => load(true), setData };
}

export function uid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function fileToPayload(file: File): Promise<{ name: string; mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', data: String(r.result) });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Compress camera photos before upload (variable mobile networks). */
export async function compressImage(file: File, maxDim = 1600): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/heic' || file.size < 400_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.8));
    return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
