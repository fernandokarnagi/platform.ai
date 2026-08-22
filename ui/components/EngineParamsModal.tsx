import { useEffect, useState } from 'react';
import InheritPill from '@components/InheritPill';
import { isVllm } from '@/lib/engine';
import { launchParamRows, type EngineParamsSource } from '@/lib/engineParams';
import { settingsService } from '@services/settingsService';
import type { Settings } from '@/types';

export type { EngineParamsSource };

export default function EngineParamsModal({
  node,
  onClose,
}: {
  node: EngineParamsSource;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Pick<Settings, 'llamaCpp' | 'vllm'> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void settingsService
      .get()
      .then((doc) => {
        if (!cancelled) setSettings({ llamaCpp: doc.llamaCpp, vllm: doc.vllm });
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { summary, rows } = launchParamRows(node, settings);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span>{isVllm(node.engine) ? 'vLLM parameters' : 'llama-server parameters'}</span>
          <button type="button" onClick={onClose} className="modal-x">
            ✕
          </button>
        </div>
        <p className="inherit-line">{loading ? 'Resolving Settings…' : summary}</p>
        <dl className="params-list">
          {rows.map((row) => (
            <div key={row.label} className="params-row">
              <dt>
                {row.label}
                {row.layer ? <InheritPill layer={row.layer} /> : null}
              </dt>
              <dd className={row.value.includes('\n') ? 'params-pre' : undefined}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
