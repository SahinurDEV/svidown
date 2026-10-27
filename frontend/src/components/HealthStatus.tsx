'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/auth';
import { Activity, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';

interface StatusPayload {
  level: 'ok' | 'warn' | 'error' | 'info';
  alert: string | null;
  selftest?: {
    enabled?: boolean;
    last_ok?: boolean | null;
    last_msg?: string;
    last_run_at?: number | null;
    running?: boolean;
  };
  version?: { 'yt-dlp'?: string; yt_dlp_stale?: boolean; yt_dlp_age_days?: number | null };
  cookies_valid?: boolean;
}

const styles: Record<string, string> = {
  ok: 'border-green-300 bg-green-50 dark:bg-green-950/40 dark:border-green-700 text-green-900 dark:text-green-100',
  warn: 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 text-amber-900 dark:text-amber-100',
  error: 'border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-700 text-red-900 dark:text-red-100',
  info: 'border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700 text-blue-900 dark:text-blue-100',
};

export default function HealthStatus() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/status`, { headers: getAuthHeaders() });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const runSelftest = async () => {
    setBusy(true);
    try {
      await fetch(`${getApiBaseUrl()}/selftest`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;
  const level = data.level || 'ok';
  const Icon =
    level === 'ok' ? CheckCircle2 : level === 'error' ? AlertTriangle : level === 'warn' ? AlertTriangle : Info;

  const lastRun = data.selftest?.last_run_at
    ? new Date(data.selftest.last_run_at * 1000).toLocaleString()
    : 'never';

  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 ${styles[level]}`} data-testid="health-status">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" />
            System health
          </p>
          <p className="mt-1 opacity-90 break-words">
            {data.alert || 'All checks look good.'}
          </p>
          <p className="mt-2 text-xs opacity-75">
            Self-test: {data.selftest?.last_ok === true ? 'OK' : data.selftest?.last_ok === false ? 'FAILED' : 'pending'}
            {data.selftest?.last_msg ? ` — ${data.selftest.last_msg}` : ''} · last run {lastRun}
            {data.version?.['yt-dlp'] ? ` · yt-dlp ${data.version['yt-dlp']}` : ''}
            {` · cookies ${data.cookies_valid ? 'loaded' : 'missing'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={runSelftest}
          disabled={busy || data.selftest?.running}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/70 dark:bg-black/30 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          data-testid="run-selftest"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          Run self-test
        </button>
      </div>
    </div>
  );
}
