import { useState } from 'react';
import type { DryRunResult } from '@/types';

export default function DryRunModal({
  result,
  onClose,
}: {
  result: DryRunResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(result.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <span>Dry run {result.ok ? 'passed' : 'failed'}</span>
          <button type="button" onClick={onClose} className="modal-x">
            ✕
          </button>
        </div>
        <p className="muted">
          No process started. {result.ok ? 'Start is clear to run.' : 'Fix the failed checks before Start.'}
        </p>
        <ul className="check-list">
          {result.checks.map((check) => (
            <li key={check.id} className="check-row">
              <span className={check.ok ? 'ok' : 'fail'}>{check.ok ? 'ok' : 'fail'}</span>
              <span>
                <strong>{check.id}</strong>
                <span className="muted"> — {check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {result.command ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="field-label">Command</span>
              <button type="button" className="toggle" onClick={() => void copyCommand()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="setup-pre">{result.command}</pre>
          </div>
        ) : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="toggle accent">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
