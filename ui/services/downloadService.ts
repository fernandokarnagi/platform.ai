import type { DownloadJob } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8091';

async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    // ignore
  }
  return response.statusText || `Request failed (${response.status})`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await readDetail(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const downloadService = {
  list(): Promise<DownloadJob[]> {
    return api<DownloadJob[]>('/downloads');
  },

  get(id: string): Promise<DownloadJob> {
    return api<DownloadJob>(`/downloads/${id}`);
  },

  cancel(id: string): Promise<DownloadJob> {
    return api<DownloadJob>(`/downloads/${id}/cancel`, { method: 'POST' });
  },

  retry(id: string): Promise<DownloadJob> {
    return api<DownloadJob>(`/downloads/${id}/retry`, { method: 'POST' });
  },

  remove(id: string): Promise<void> {
    return api<void>(`/downloads/${id}`, { method: 'DELETE' });
  },
};
