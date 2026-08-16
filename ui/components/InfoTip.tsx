import { useEffect, useId, useRef, useState } from 'react';

export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <span className="info-tip" ref={root}>
      <button
        type="button"
        className="info-btn"
        aria-label="Parameter info"
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        i
      </button>
      {open ? (
        <span id={id} className="info-pop" role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}
