from enum import Enum
from typing import Any, List, Optional, Union
from pydantic import BaseModel, Field


class EngineType(str, Enum):
    LLAMA_CPP = "llama.cpp"
    VLLM = "vllm"
    VLLM_METAL = "vllm-metal"


class SshAuthType(str, Enum):
    PASSWORD = "password"
    PRIVATE_KEY = "private_key"
    NONE = "none"


class NodeType(str, Enum):
    LOCAL = "local"
    REMOTE = "remote"


class FlashAttn(str, Enum):
    AUTO = "auto"
    ON = "on"
    OFF = "off"


class FitMode(str, Enum):
    ON = "on"
    OFF = "off"


class CacheType(str, Enum):
    F32 = "f32"
    F16 = "f16"
    BF16 = "bf16"
    Q8_0 = "q8_0"
    Q4_0 = "q4_0"
    Q4_1 = "q4_1"
    IQ4_NL = "iq4_nl"
    Q5_0 = "q5_0"
    Q5_1 = "q5_1"


class ServerParams(BaseModel):
    """llama-server launch parameters. Unset optional fields inherit Settings, then engine defaults."""
    ctxSize: Optional[int] = None
    gpuLayers: Optional[Union[str, int]] = None
    flashAttn: Optional[FlashAttn] = None
    threads: Optional[int] = None
    parallel: Optional[int] = None
    batchSize: Optional[int] = None
    ubatchSize: Optional[int] = None
    kvOffload: Optional[bool] = None
    fit: Optional[FitMode] = None
    cacheTypeK: Optional[CacheType] = None
    cacheTypeV: Optional[CacheType] = None
    nPredict: Optional[int] = None
    keep: Optional[int] = None
    threadsBatch: Optional[int] = None
    splitMode: Optional[str] = None
    mainGpu: Optional[int] = None
    tensorSplit: Optional[str] = None
    device: Optional[str] = None
    cpuMoe: Optional[bool] = None
    nCpuMoe: Optional[int] = None
    loadMode: Optional[str] = None
    jinja: Optional[bool] = None
    chatTemplate: Optional[str] = None
    metrics: Optional[bool] = None
    alias: Optional[str] = None
    extraFlags: str = ""
    tensorParallelSize: Optional[int] = None
    gpuMemoryUtilization: Optional[float] = None
    maxModelLen: Optional[int] = None
    dtype: Optional[str] = None
    quantization: Optional[str] = None
    maxNumSeqs: Optional[int] = None
    swapSpace: Optional[int] = None
    kvCacheDtype: Optional[str] = None
    servedModelName: Optional[str] = None
    trustRemoteCode: Optional[bool] = None
    enforceEager: Optional[bool] = None
    enablePrefixCaching: Optional[bool] = None


class ClusterIn(BaseModel):
    """Payload to create a cluster."""
    name: str
    engine: EngineType = EngineType.LLAMA_CPP
    description: str = ""
    hfToken: str = ""


class ClusterUpdate(BaseModel):
    """Payload to update a cluster."""
    name: Optional[str] = None
    engine: Optional[EngineType] = None
    description: Optional[str] = None
    hfToken: Optional[str] = None


class LlamaCppSettings(BaseModel):
    """Global llama.cpp launch params. Unset fields fall through to engine defaults."""
    ctxSize: Optional[int] = None
    gpuLayers: Optional[Union[str, int]] = None
    flashAttn: Optional[FlashAttn] = None
    threads: Optional[int] = None
    parallel: Optional[int] = None
    batchSize: Optional[int] = None
    ubatchSize: Optional[int] = None
    kvOffload: Optional[bool] = None
    fit: Optional[FitMode] = None
    cacheTypeK: Optional[CacheType] = None
    cacheTypeV: Optional[CacheType] = None
    nPredict: Optional[int] = None
    keep: Optional[int] = None
    threadsBatch: Optional[int] = None
    splitMode: Optional[str] = None
    mainGpu: Optional[int] = None
    tensorSplit: Optional[str] = None
    device: Optional[str] = None
    cpuMoe: Optional[bool] = None
    nCpuMoe: Optional[int] = None
    loadMode: Optional[str] = None
    jinja: Optional[bool] = None
    chatTemplate: Optional[str] = None
    metrics: Optional[bool] = None
    alias: Optional[str] = None
    extraFlags: Optional[str] = None


class VllmSettings(BaseModel):
    """Global vLLM launch params (ROCm Docker and Mac Metal). Unset fields fall through to engine defaults."""
    tensorParallelSize: Optional[int] = None
    gpuMemoryUtilization: Optional[float] = None
    maxModelLen: Optional[int] = None
    dtype: Optional[str] = None
    quantization: Optional[str] = None
    maxNumSeqs: Optional[int] = None
    swapSpace: Optional[int] = None
    kvCacheDtype: Optional[str] = None
    servedModelName: Optional[str] = None
    trustRemoteCode: Optional[bool] = None
    enforceEager: Optional[bool] = None
    enablePrefixCaching: Optional[bool] = None
    extraFlags: Optional[str] = None


class SettingsUpdate(BaseModel):
    """Payload to update the singleton Settings document."""
    hfToken: Optional[str] = None
    libraryDir: Optional[str] = None
    llamaCpp: Optional[LlamaCppSettings] = None
    vllm: Optional[VllmSettings] = None


class NodeIn(BaseModel):
    """Payload to register a node."""
    name: str
    nodeType: Optional[NodeType] = None
    host: str = ""
    sshPort: int = 22
    sshUser: str = ""
    sshAuthType: SshAuthType = SshAuthType.PASSWORD
    sshPassword: str = ""
    sshPrivateKey: str = ""
    sshPassphrase: str = ""
    openaiBaseUrl: str
    openaiApiKey: str = ""
    hfToken: str = ""
    listenHost: str = "0.0.0.0"
    listenPort: int = 8080
    modelDir: str = "~/models"
    llamaServerPath: str = ""
    vllmImage: str = ""
    selectedModel: str = ""
    serverParams: ServerParams = Field(default_factory=ServerParams)


class NodeUpdate(BaseModel):
    """Payload to update a node."""
    name: Optional[str] = None
    nodeType: Optional[NodeType] = None
    host: Optional[str] = None
    sshPort: Optional[int] = None
    sshUser: Optional[str] = None
    sshAuthType: Optional[SshAuthType] = None
    sshPassword: Optional[str] = None
    sshPrivateKey: Optional[str] = None
    sshPassphrase: Optional[str] = None
    openaiBaseUrl: Optional[str] = None
    openaiApiKey: Optional[str] = None
    hfToken: Optional[str] = None
    listenHost: Optional[str] = None
    listenPort: Optional[int] = None
    modelDir: Optional[str] = None
    llamaServerPath: Optional[str] = None
    vllmImage: Optional[str] = None
    selectedModel: Optional[str] = None
    serverParams: Optional[ServerParams] = None


class StartEngineIn(BaseModel):
    modelFilename: Optional[str] = None


class DownloadModelIn(BaseModel):
    source: str
    repo: Optional[str] = None
    filename: Optional[str] = None
    url: Optional[str] = None
    hfToken: Optional[str] = None


class LibraryDownloadIn(DownloadModelIn):
    kind: str


class CopyLibraryIn(BaseModel):
    kind: str
    filename: str


class DeleteModelIn(BaseModel):
    filename: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = 1.0
    topP: Optional[float] = 0.95
    topK: Optional[int] = 20
    minP: Optional[float] = 0.0
    presencePenalty: Optional[float] = 0.0
    repetitionPenalty: Optional[float] = 1.0
    maxTokens: Optional[int] = None


class PreviewIn(BaseModel):
    listenHost: str = "0.0.0.0"
    listenPort: int = 8080
    modelDir: str = "~/models"
    serverParams: ServerParams = Field(default_factory=ServerParams)
    modelFilename: str = "$MODEL"
    vllmImage: str = ""
    llamaServerPath: str = ""
    applySettings: bool = True
