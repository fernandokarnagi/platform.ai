import type { InheritLayer } from '@/lib/inherit';
import { inheritBadge } from '@/lib/inherit';

export default function InheritPill({ layer }: { layer: InheritLayer | 'cluster' | 'none' }) {
  const label = layer === 'cluster' || layer === 'none' ? layer : inheritBadge(layer);
  const kind = layer === 'set' ? 'set' : layer === 'none' ? 'none' : 'inherit';
  return <span className={`inherit-pill inherit-pill-${kind}`}>{label}</span>;
}
