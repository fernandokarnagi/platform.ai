import type { DownloadJob, DownloadModelIn, HfRepoFiles, LibraryList } from '@/types';

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
  return response.json() as Promise<T>;
}

export const libraryService = {
  list(kind?: string): Promise<LibraryList> {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    return api<LibraryList>(`/library/models${query}`);
  },

  listHf(repo: string, kind: string): Promise<HfRepoFiles> {
    return api<HfRepoFiles>(
      `/library/huggingface?repo=${encodeURIComponent(repo)}&kind=${encodeURIComponent(kind)}`,
    );
  },

  download(payload: DownloadModelIn & { kind: string }): Promise<DownloadJob> {
    return api<DownloadJob>('/library/download', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
