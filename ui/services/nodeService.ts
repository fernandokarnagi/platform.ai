import type {
  ChatCompletion,
  ChatIn,
  DownloadModelIn,
  DownloadJob,
  DryRunResult,
  EngineLogs,
  HfRepoFiles,
  EngineStatus,
  Node,
  NodeMetrics,
  NodeIn,
  NodeStatus,
  NodeUpdate,
  OpenAIModelsResponse,
  PreviewIn,
  PreviewOut,
  RemoteModel,
  RequestLogEntry,
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

  metrics(id: string): Promise<NodeMetrics> {
    return api<NodeMetrics>(`/nodes/${id}/metrics`);
  },

  status(id: string, refresh = false, check?: 'ssh' | 'engine' | 'openai'): Promise<NodeStatus> {
    const query = new URLSearchParams();
    if (refresh) query.set('refresh', 'true');
    if (check) query.set('check', check);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return api<NodeStatus>(`/nodes/${id}/status${suffix}`);
  },

  engine(id: string, refresh = false): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine${refresh ? '?refresh=true' : ''}`);
  },

  start(id: string, modelFilename?: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/start`, {
      method: 'POST',
      body: JSON.stringify(modelFilename ? { modelFilename } : {}),
    });
  },

  dryRun(id: string, modelFilename?: string): Promise<DryRunResult> {
    return api<DryRunResult>(`/nodes/${id}/engine/dry-run`, {
      method: 'POST',
      body: JSON.stringify(modelFilename ? { modelFilename } : {}),
    });
  },

  requests(id: string): Promise<RequestLogEntry[]> {
    return api<RequestLogEntry[]>(`/nodes/${id}/requests`);
  },

  stop(id: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/stop`, { method: 'POST' });
  },

  restart(id: string): Promise<EngineStatus> {
    return api<EngineStatus>(`/nodes/${id}/engine/restart`, { method: 'POST' });
  },

  logs(id: string, lines = 200): Promise<EngineLogs> {
    return api<EngineLogs>(`/nodes/${id}/engine/logs?lines=${lines}`);
  },

  listModels(id: string, refresh = false): Promise<RemoteModel[]> {
    return api<RemoteModel[]>(`/nodes/${id}/models${refresh ? '?refresh=true' : ''}`);
  },

  listHfFiles(id: string, repo: string): Promise<HfRepoFiles> {
    return api<HfRepoFiles>(`/nodes/${id}/models/huggingface?repo=${encodeURIComponent(repo)}`);
  },

  downloadModel(id: string, payload: DownloadModelIn): Promise<DownloadJob> {
    return api<DownloadJob>(`/nodes/${id}/models/download`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  copyFromLibrary(id: string, kind: string, filename: string): Promise<DownloadJob> {
    return api<DownloadJob>(`/nodes/${id}/models/copy`, {
      method: 'POST',
      body: JSON.stringify({ kind, filename }),
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

  previewCommand(payload: PreviewIn, engine: string = 'llama.cpp'): Promise<PreviewOut> {
    return api<PreviewOut>(`/engines/${engine}/preview`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
