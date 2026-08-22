import { useCallback, useEffect, useState } from 'react';
import ErrorBanner from '@components/ErrorBanner';
import { formatBytes, formatPercent } from '@/lib/format';
import { nodeService } from '@services/nodeService';
import type { GpuMetrics, NodeMetrics } from '@/types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function remaining(total: number | null, used: number | null, free: number | null): number | null {
  if (free !== null && Number.isFinite(free)) return Math.max(0, free);
  if (total === null || used === null || !Number.isFinite(total) || !Number.isFinite(used)) return null;
  return Math.max(0, total - used);
}

function ratio(used: number | null, total: number | null): number | null {
  if (used === null || total === null || !Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function meterTone(percent: number | null): string {
  if (percent === null) return '';
  if (percent >= 90) return ' danger';
  if (percent >= 70) return ' warn';
  return '';
}

function Meter({ percent }: { percent: number | null }) {
  const width = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className={`meter${meterTone(percent)}`} title={formatPercent(percent)}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function remainLabel(bytes: number | null): string {
  if (bytes === null) return 'remaining —';
  return `${formatBytes(bytes)} remaining`;
}

function gpuSpec(gpu: GpuMetrics): string {
  const name = gpu.name || 'GPU';
  const labeled =
    gpu.vendor && !name.toLowerCase().includes(gpu.vendor.toLowerCase())
      ? `${gpu.vendor} ${name}`
      : name;
  const bits = [
    labeled,
    gpu.cores !== null ? `${gpu.cores}c` : null,
    gpu.unified ? 'unified' : null,
  ].filter(Boolean);
  return bits.join(' · ') || 'GPU';
}

function Card({
  label,
  spec,
  value,
  percent,
}: {
  label: string;
  spec?: string;
  value: string;
  percent?: number | null;
}) {
  return (
    <div className="metrics-card">
      <div className="k">{label}</div>
      {spec ? <div className="spec">{spec}</div> : null}
      <div className="big">{value}</div>
      {percent !== undefined ? <Meter percent={percent} /> : null}
    </div>
  );
}

export default function ServerMetricsPanel({ nodeId }: { nodeId: string }) {
  const [metrics, setMetrics] = useState<NodeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await nodeService.metrics(nodeId);
      setMetrics(next);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const ramFree = remaining(metrics?.memTotalBytes ?? null, metrics?.memUsedBytes ?? null, metrics?.memFreeBytes ?? null);
  const diskFree = remaining(
    metrics?.diskTotalBytes ?? null,
    metrics?.diskUsedBytes ?? null,
    metrics?.diskFreeBytes ?? null,
  );
  const ramPercent = ratio(metrics?.memUsedBytes ?? null, metrics?.memTotalBytes ?? null);
  const diskPercent = ratio(diskFree, metrics?.diskTotalBytes ?? null);
  const cpuSpec = [metrics?.cpuModel, metrics?.cpuCores != null ? `${metrics.cpuCores}c` : null]
    .filter(Boolean)
    .join(' · ');
  const gpus = metrics?.gpus.length ? metrics.gpus : [null];

  return (
    <div className="metrics-strip">
      {error ? <ErrorBanner message={error} /> : null}
      {!metrics && loading ? <p className="muted">Reading host spec and utilization…</p> : null}
      {metrics ? (
        <div className="metrics-grid">
          <Card label="CPU" spec={cpuSpec || undefined} value={formatPercent(metrics.cpuPercent)} percent={metrics.cpuPercent} />
          {gpus.map((gpu, index) => {
            if (!gpu) {
              return <Card key="gpu-none" label="GPU" value="none reported" />;
            }
            const gpuFree = remaining(gpu.memoryTotalBytes, gpu.memoryUsedBytes, gpu.memoryFreeBytes);
            const memPercent = ratio(gpu.memoryUsedBytes, gpu.memoryTotalBytes);
            return (
              <Card
                key={`${gpu.name}-${index}`}
                label="GPU"
                spec={gpuSpec(gpu)}
                value={`${formatPercent(gpu.percent)} · ${remainLabel(gpuFree)}`}
                percent={gpu.percent ?? memPercent}
              />
            );
          })}
          <Card
            label="Memory"
            spec={`${formatBytes(metrics.memUsedBytes)} / ${formatBytes(metrics.memTotalBytes)}`}
            value={remainLabel(ramFree)}
            percent={ramPercent}
          />
          <Card
            label="Disk"
            spec={`${formatBytes(diskFree)} / ${formatBytes(metrics.diskTotalBytes)}`}
            value={remainLabel(diskFree)}
            percent={diskPercent}
          />
        </div>
      ) : null}
    </div>
  );
}
