import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clusterService } from '@services/clusterService';
import type { Cluster } from '@/types';

interface ClusterContextValue {
  clusters: Cluster[];
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  refresh: () => Promise<void>;
}

const ClusterContext = createContext<ClusterContextValue | null>(null);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setClusters(await clusterService.list());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ clusters, loading, error, setError, refresh }),
    [clusters, loading, error, refresh],
  );

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>;
}

export function useClusters() {
  const ctx = useContext(ClusterContext);
  if (!ctx) {
    throw new Error('useClusters must be used within ClusterProvider');
  }
  return ctx;
}
