import type { Node, ServerParams } from '@/types';

export type EngineParamsSource = Pick<Node, 'listenHost' | 'listenPort' | 'modelDir' | 'serverParams'> &
  Partial<Pick<Node, 'engine' | 'selectedModel' | 'vllmImage'>>;

type Row = { label: string; value: string };

function display(value: string | number | boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  return String(value);
}

function rowsFor(node: EngineParamsSource): Row[] {
  const params: ServerParams = node.serverParams ?? ({} as ServerParams);
  const vllm = node.engine === 'vllm';
  const always: Array<[string, string | number | boolean | null | undefined]> = vllm
    ? [
        ['Listen host', node.listenHost],
        ['Listen port', node.listenPort],
        ['Model dir', node.modelDir],
        ['Docker image', node.vllmImage],
        ['Model', node.selectedModel],
        ['Tensor parallel', params.tensorParallelSize ?? 1],
        ['GPU memory util', params.gpuMemoryUtilization ?? 0.9],
      ]
    : [
        ['Listen host', node.listenHost],
        ['Listen port', node.listenPort],
        ['Model dir', node.modelDir],
        ['Context length', params.ctxSize],
        ['GPU layers', params.gpuLayers],
        ['Flash attention', params.flashAttn],
        ['Parallel slots', params.parallel],
        ['KV offload', params.kvOffload],
        ['Fit in memory', params.fit],
      ];
  const optional: Array<[string, string | number | boolean | null | undefined]> = vllm
    ? [
        ['Max model length', params.maxModelLen],
        ['Dtype', params.dtype],
        ['Quantization', params.quantization],
        ['Max sequences', params.maxNumSeqs],
        ['Swap space', params.swapSpace],
        ['KV cache dtype', params.kvCacheDtype],
        ['Served model name', params.servedModelName ?? params.alias],
        ['Trust remote code', params.trustRemoteCode],
        ['Enforce eager', params.enforceEager],
        ['Prefix caching', params.enablePrefixCaching],
        ['Extra flags', params.extraFlags],
      ]
    : [
        ['CPU threads', params.threads],
        ['Batch size', params.batchSize],
        ['µbatch size', params.ubatchSize],
        ['Cache type K', params.cacheTypeK],
        ['Cache type V', params.cacheTypeV],
        ['Max predict', params.nPredict],
        ['Keep tokens', params.keep],
        ['Batch threads', params.threadsBatch],
        ['Split mode', params.splitMode],
        ['Main GPU', params.mainGpu],
        ['Tensor split', params.tensorSplit],
        ['Device list', params.device],
        ['CPU MoE', params.cpuMoe],
        ['N CPU MoE layers', params.nCpuMoe],
        ['Load mode', params.loadMode],
        ['Jinja', params.jinja],
        ['Chat template', params.chatTemplate],
        ['Metrics', params.metrics],
        ['Model alias', params.alias],
        ['Extra flags', params.extraFlags],
      ];
  const rows: Row[] = [];
  for (const [label, raw] of always) {
    rows.push({ label, value: display(raw) ?? '—' });
  }
  for (const [label, raw] of optional) {
    const value = display(raw);
    if (value !== null) rows.push({ label, value });
  }
  return rows;
}

export default function EngineParamsModal({
  node,
  onClose,
}: {
  node: EngineParamsSource;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span>{node.engine === 'vllm' ? 'vLLM parameters' : 'llama-server parameters'}</span>
          <button type="button" onClick={onClose} className="modal-x">
            ✕
          </button>
        </div>
        <dl className="params-list">
          {rowsFor(node).map((row) => (
            <div key={row.label} className="params-row">
              <dt>{row.label}</dt>
              <dd className={row.value.includes('\n') ? 'params-pre' : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
