import { useState, type ReactNode, type SyntheticEvent } from 'react';

type CollapsibleCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  className?: string;
};

export default function CollapsibleCard({
  title,
  description,
  children,
  defaultOpen = true,
  actions,
  className = 'card',
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={className}>
      <details
        open={open}
        onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
          if (event.target !== event.currentTarget) return;
          const next = event.currentTarget.open;
          if (next !== open) setOpen(next);
        }}
      >
        <summary className="collapse-summary">
          <span className="collapse-summary-text">
            <span className="card-title">{title}</span>
            {description ? <p className="inherit-line">{description}</p> : null}
          </span>
          {actions ? (
            <span
              className="collapse-actions"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {actions}
            </span>
          ) : null}
        </summary>
        <div className="collapse-body">{children}</div>
      </details>
    </section>
  );
}

export function MaybeCollapsible({
  collapsible,
  title,
  description,
  children,
  defaultOpen = true,
  actions,
  className = 'card space-y-4',
}: CollapsibleCardProps & { collapsible: boolean }) {
  if (collapsible) {
    return (
      <CollapsibleCard
        title={title}
        description={description}
        defaultOpen={defaultOpen}
        actions={actions}
        className={className}
      >
        {children}
      </CollapsibleCard>
    );
  }
  return (
    <section className={className}>
      {actions ? (
        <div className="preview-head">
          <h2 className="card-title">{title}</h2>
          {actions}
        </div>
      ) : (
        <h2 className="card-title">{title}</h2>
      )}
      {description ? <p className="inherit-line">{description}</p> : null}
      {children}
    </section>
  );
}
