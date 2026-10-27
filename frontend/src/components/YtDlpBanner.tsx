'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/auth';
import { AlertTriangle, X } from 'lucide-react';

interface VersionInfo {
  'yt-dlp'?: string;
  yt_dlp_age_days?: number | null;
  yt_dlp_stale?: boolean;
  yt_dlp_stale_after_days?: number;
}

export default function YtDlpBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/version`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setInfo(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || !info?.yt_dlp_stale) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-medium">yt-dlp may be outdated</p>
        <p className="mt-1 opacity-90">
          Installed yt-dlp <span className="font-mono">{info['yt-dlp']}</span>
          {typeof info.yt_dlp_age_days === 'number' && (
            <> is ~{info.yt_dlp_age_days} days old</>
          )}
          {info.yt_dlp_stale_after_days ? (
            <> (warning after {info.yt_dlp_stale_after_days} days)</>
          ) : null}
          . YouTube and other sites break often when yt-dlp is stale. Enable{' '}
          <code className="text-xs">YTDLP_AUTO_UPDATE</code>, restart the container, or rebuild the
          image.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="text-amber-700 dark:text-amber-300 hover:opacity-70"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
