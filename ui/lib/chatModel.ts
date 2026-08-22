export function modelBasename(id: string): string {
  const trimmed = (id || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const slash = trimmed.lastIndexOf('/');
  const name = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return name.toLowerCase().endsWith('.gguf') ? name.slice(0, -5) : name;
}

export function modelsMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const a = modelBasename(left);
  const b = modelBasename(right);
  return Boolean(a) && a === b;
}

export function localServedModels(served: string[], diskNames: string[]): string[] {
  return served.filter((id) => diskNames.some((name) => modelsMatch(id, name)));
}

export function pickChatModel(served: string[], current: string, preferred?: string): string {
  if (preferred) {
    const match = served.find((id) => modelsMatch(id, preferred));
    return match ?? preferred;
  }
  if (current && served.includes(current)) return current;
  return served[0] ?? '';
}

export function chatModelOptions(served: string[], selected?: string): string[] {
  const options = [...served];
  if (selected && !options.some((id) => modelsMatch(id, selected))) {
    options.unshift(selected);
  }
  return options;
}

export function isModelServed(served: string[], name: string): boolean {
  return served.some((id) => modelsMatch(id, name));
}
