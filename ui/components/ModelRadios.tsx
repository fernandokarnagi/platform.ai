export default function ModelRadios({ models }: { models: string[] }) {
  if (models.length === 0) {
    return <span className="muted">—</span>;
  }
  return (
    <ul className="model-lines">
      {models.map((model) => (
        <li key={model} className="model-pick" title={model}>
          <span className="model-dot" aria-hidden="true" />
          <span className="model-line">{model}</span>
          <span className="model-tip" role="tooltip">
            {model}
          </span>
        </li>
      ))}
    </ul>
  );
}
