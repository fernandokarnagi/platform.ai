import type { Settings, SettingsUpdate } from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8091';

async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) => {
            if (item && typeof item === 'object' && 'msg' in item) {
              return String((item as { msg: unknown }).msg);
            }
            return JSON.stringify(item);
          })
          .join(', ');
      }
    }
  } catch {
    // ignore non-JSON error bodies
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

export const settingsService = {
  get(): Promise<Settings> {
    return api<Settings>('/settings');
  },

  update(payload: SettingsUpdate): Promise<Settings> {
    return api<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};
