import type {
  ChatCompletion,
  ChatIn,
  DownloadModelIn,
  DownloadModelResult,
  EngineStatus,
  Node,
  NodeIn,
  NodeStatus,
  NodeUpdate,
  OpenAIModelsResponse,
  PreviewIn,
  PreviewOut,
  RemoteModel,
  TestSshResult,
} from '@/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8091';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function apiErrorStatus(err: unknown): number | undefined {
  return err instanceof ApiError ? err.status : undefined;
}

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
    throw new ApiError(await readDetail(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const nodeService = {
  listByCluster(clusterId: string): Promise<Node[]> {
    return api<Node[]>(`/clusters/${clusterId}/nodes`);
  },

  get(id: string): Promise<Node> {
    return api<Node>(`/nodes/${id}`);
  },

  create(clusterId: string, payload: NodeIn): Promise<Node> {
    return api<Node>(`/clusters/${clusterId}/nodes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(id: string, payload: NodeUpdate): Promise<Node> {
    return api<Node>(`/nodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  remove(id: string): Promise<void> {
    return api<void>(`/nodes/${id}`, { method: 'DELETE' });
  },

  testSsh(id: string): Promise<TestSshResult> {
    return api<TestSshResult>(`/nodes/${id}/test-ssh`, { method: 'POST' });
  },

  status(id: string): Promise<NodeStatus> {
    return api<NodeStatus>(`/nodes/${id}/status`);
  },

  engine(id: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine`);
  },

  start(id: string, modelFilename: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/start`, {
      method: 'POST',
      body: JSON.stringify({ modelFilename }),
    });
  },

  stop(id: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/stop`, { method: 'POST' });
  },

  restart(id: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/restart`, { method: 'POST' });
  },

  listModels(id: string): Promise<RemoteModel[]> {
    return api<RemoteModel[]>(`/nodes/${id}/models`);
  },

  downloadModel(id: string, payload: DownloadModelIn): Promise<DownloadModelResult> {
    return api<DownloadModelResult>(`/nodes/${id}/models/download`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deleteModel(id: string, filename: string): Promise<void> {
    return api<void>(`/nodes/${id}/models`, {
      method: 'DELETE',
      body: JSON.stringify({ filename }),
    });
  },

  openaiModels(id: string): Promise<OpenAIModelsResponse> {
    return api<OpenAIModelsResponse>(`/nodes/${id}/models/openai`);
  },

  chat(id: string, payload: ChatIn): Promise<ChatCompletion> {
    return api<ChatCompletion>(`/nodes/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  previewCommand(payload: PreviewIn): Promise<PreviewOut> {
    return api<PreviewOut>('/engines/llama.cpp/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
