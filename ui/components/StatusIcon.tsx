type StatusKind = 'up' | 'down' | 'running' | 'stopped';

const LABELS: Record<StatusKind, string> = {
  up: 'Up',
  down: 'Down',
  running: 'Running',
  stopped: 'Stopped',
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.3A6.7 6.7 0 1 0 8 14.7 6.7 6.7 0 0 0 8 1.3Zm3.1 4.7-3.6 4.2a.7.7 0 0 1-1 0L4.9 8.6a.7.7 0 0 1 1-1l1.1 1.1 3.1-3.6a.7.7 0 1 1 1 1Z"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.3A6.7 6.7 0 1 0 8 14.7 6.7 6.7 0 0 0 8 1.3Zm-1.4 3.6v6.2c0 .4.5.7.8.4l4.2-3.1a.5.5 0 0 0 0-.8L7.4 4.5a.5.5 0 0 0-.8.4Z"
      />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.3A6.7 6.7 0 1 0 8 14.7 6.7 6.7 0 0 0 8 1.3Zm2.4 3.6a.7.7 0 0 1 1 1L9 8l2.4 2.1a.7.7 0 1 1-1 1L8 9 5.6 11.1a.7.7 0 1 1-1-1L7 8 4.6 5.9a.7.7 0 0 1 1-1L8 7l2.4-2.1Z"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.3A6.7 6.7 0 1 0 8 14.7 6.7 6.7 0 0 0 8 1.3ZM6.2 5.5a.7.7 0 0 0-.7.7v3.6c0 .4.3.7.7.7h3.6c.4 0 .7-.3.7-.7V6.2a.7.7 0 0 0-.7-.7H6.2Z"
      />
    </svg>
  );
}

export default function StatusIcon({ kind }: { kind: StatusKind }) {
  const label = LABELS[kind];
  return (
    <span className={`status-icon ${kind}`} title={label} aria-label={label}>
      {kind === 'up' ? <CheckIcon /> : null}
      {kind === 'running' ? <PlayIcon /> : null}
      {kind === 'down' ? <DownIcon /> : null}
      {kind === 'stopped' ? <StopIcon /> : null}
    </span>
  );
}
