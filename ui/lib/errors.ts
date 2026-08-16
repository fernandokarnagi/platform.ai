/** Drop probe strings that are only empty "SSH failed:" / "Engine failed:" prefixes. */
export function usefulDetail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const leftover = raw
    .replace(/SSH failed:/gi, '')
    .replace(/Engine failed:/gi, '')
    .replace(/Local failed:/gi, '')
    .replace(/[;·,]/g, ' ')
    .trim();
  if (!leftover) return null;
  return raw.replace(/(?:[;\s])+$/g, '').trim();
}
