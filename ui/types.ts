export type EngineType = 'llama.cpp';

export type SshAuthType = 'password' | 'private_key';

export type FlashAttn = 'auto' | 'on' | 'off';

export type FitMode = 'on' | 'off';

export type CacheType =
  | 'f32'
  | 'f16'
  | 'bf16'
  | 'q8_0'
  | 'q4_0'
  | 'q4_1'
  | 'iq4_nl'
  | 'q5_0'
  | 'q5_1';

export interface ServerParams {
  ctxSize: number;
  gpuLayers: string | number;
  flashAttn: FlashAttn;
  threads?: number | null;
  parallel: number;
  batchSize?: number | null;
  ubatchSize?: number | null;
  kvOffload: boolean;
  fit: FitMode;
  cacheTypeK?: CacheType | null;
  cacheTypeV?: CacheType | null;
  nPredict?: number | null;
  keep?: number | null;
  threadsBatch?: number | null;
  splitMode?: string | null;
  mainGpu?: number | null;
  tensorSplit?: string | null;
  device?: string | null;
  cpuMoe?: boolean | null;
  nCpuMoe?: number | null;
  loadMode?: string | null;
  jinja?: boolean | null;
  chatTemplate?: string | null;
  metrics?: boolean | null;
  alias?: string | null;
  extraFlags: string;
}

export interface Cluster {
  id: string;
  name: string;
  engine: EngineType | string;
  description: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterIn {
  name: string;
  engine?: EngineType;
  description?: string;
}

export interface ClusterUpdate {
  name?: string;
  engine?: EngineType;
  description?: string;
}

export interface LastStart {
  modelFilename: string;
  argv: string[];
  startedAt: string;
}

export interface Node {
  id: string;
  clusterId: string;
  name: string;
  host: string;
  sshPort: number;
  sshUser: string;
  sshAuthType: SshAuthType;
  sshPassword: string;
  sshPrivateKey: string;
  sshPassphrase: string;
  openaiBaseUrl: string;
  openaiApiKey: string;
  hfToken: string;
  listenHost: string;
  listenPort: number;
  modelDir: string;
  serverParams: ServerParams;
  lastStart: LastStart | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeIn {
  name: string;
  host: string;
  sshPort?: number;
  sshUser: string;
  sshAuthType: SshAuthType;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  openaiBaseUrl: string;
  openaiApiKey?: string;
  hfToken?: string;
  listenHost?: string;
  listenPort?: number;
  modelDir?: string;
  serverParams?: ServerParams;
}

export interface NodeUpdate {
  name?: string;
  host?: string;
  sshPort?: number;
  sshUser?: string;
  sshAuthType?: SshAuthType;
  sshPassword?: string;
  sshPrivateKey?: string;
  sshPassphrase?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  hfToken?: string;
  listenHost?: string;
  listenPort?: number;
  modelDir?: string;
  serverParams?: ServerParams;
}

export interface NodeStatus {
  ssh: 'up' | 'down';
  openai: 'up' | 'down';
  models: string[];
  detail: string | null;
}

export interface EngineStatus {
  running: boolean;
  pid: string | null;
  lastStart: LastStart | null;
  llamaServer?: string | null;
}

export interface RemoteModel {
  name: string;
  sizeBytes: number;
  mtime: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatIn {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface ChatCompletion {
  id?: string;
  choices?: Array<{
    message?: ChatMessage;
    finish_reason?: string;
  }>;
  [key: string]: unknown;
}

export interface DownloadModelIn {
  source: string;
  repo?: string;
  filename?: string;
  url?: string;
  hfToken?: string;
}

export interface DownloadModelResult {
  name: string;
  url: string;
}

export interface PreviewIn {
  listenHost?: string;
  listenPort?: number;
  modelDir?: string;
  serverParams?: ServerParams;
  modelFilename?: string;
}

export interface PreviewOut {
  argv: string[];
  command: string;
}

export interface TestSshResult {
  ok: boolean;
  uname: string;
  llamaServer: string;
}

export interface OpenAIModelsResponse {
  data: Array<{ id?: string; [key: string]: unknown }>;
}
