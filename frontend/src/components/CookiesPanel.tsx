'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from '@/lib/utils';
import { getAuthHeaders } from '@/lib/auth';
import { Cookie, Trash2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface CookieStatus {
  path: string;
  valid: boolean;
  active: boolean;
  size: number;
  mtime: number | null;
}

export default function CookiesPanel() {
  const [status, setStatus] = useState<CookieStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/cookies/status`, { headers: getAuthHeaders() });
      if (res.ok) setStatus(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name || 'cookies.txt');
      const res = await fetch(`${getApiBaseUrl()}/cookies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setMsg('Cookies uploaded and activated.');
        await refresh();
      } else {
        setMsg(data.msg || 'Upload failed');
      }
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    if (!confirm('Remove cookies.txt from the server?')) return;
    setBusy(true);
    try {
      await fetch(`${getApiBaseUrl()}/cookies`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setMsg('Cookies cleared.');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden mb-8" data-testid="cookies-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 sm:px-6 py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white flex items-center justify-between"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Cookie className="w-5 h-5" />
          Cookies
          {status?.valid ? (
            <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">loaded</span>
          ) : (
            <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">none</span>
          )}
        </span>
        <span className="text-sm opacity-80">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="p-4 sm:p-6 space-y-4 text-sm text-gray-700 dark:text-gray-200">
          <p>
            Upload a Netscape <code className="text-xs">cookies.txt</code> from your browser
            (extension: <strong>Get cookies.txt LOCALLY</strong>). Needed for Instagram, many
            TikTok/Facebook short links, and some YouTube blocks on datacenter IPs.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <label className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 text-white font-medium cursor-pointer hover:bg-violet-700">
              <Upload className="w-4 h-4" />
              {busy ? 'Uploading…' : 'Upload cookies.txt'}
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                data-testid="cookies-file"
                disabled={busy}
                onChange={(e) => onUpload(e.target.files?.[0] || null)}
              />
            </label>
            <button
              type="button"
              onClick={onClear}
              disabled={busy || !status?.valid}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
          {status && (
            <div className="flex items-start gap-2 text-xs opacity-80">
              {status.valid ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              <span>
                Path: {status.path} · {status.valid ? `valid (${status.size} bytes)` : 'missing/invalid'}
                {status.mtime ? ` · updated ${new Date(status.mtime * 1000).toLocaleString()}` : ''}
                {status.active ? ' · active in yt-dlp' : ''}
              </span>
            </div>
          )}
          {msg && <p className="text-sm">{msg}</p>}
        </div>
      )}
    </div>
  );
}
