'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDownloads } from '@/context/DownloadsContext';
import { Formats, isAudioFormat } from '@/data/formats';
import { SpeedLimits } from '@/data/speedLimits';
import { detectPlatform, FeaturedPlatforms } from '@/data/platforms';
import { getCookie, setCookie } from '@/lib/utils';
import { ChannelEntry, PreviewResult } from '@/types';
import { formatFileSize } from '@/lib/utils';
import {
  Download,
  ChevronDown,
  ChevronUp,
  FileUp,
  FileDown,
  Copy,
  Loader2,
  Gauge,
  HelpCircle,
  Globe,
  CheckCircle,
  AlertCircle,
  Users,
  CheckSquare,
  Square,
  Eye,
  Clapperboard,
  Subtitles,
  ClipboardPaste,
} from 'lucide-react';

interface BatchImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (urls: string[]) => void;
  status: string;
  inProgress: boolean;
  onCancel: () => void;
}

function BatchImportModal({
  isOpen,
  onClose,
  onImport,
  status,
  inProgress,
  onCancel,
}: BatchImportModalProps) {
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const handleImport = () => {
    const urls = text
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) {
      alert('No valid URLs found.');
      return;
    }
    onImport(urls);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Batch Import URLs
          </h2>
        </div>
        <div className="p-6">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-40 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Paste one video URL per line"
            disabled={inProgress}
          />
          {status && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{status}</p>
          )}
        </div>
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          {inProgress && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Cancel Import
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleImport}
              disabled={inProgress}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Import URLs
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ChannelDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (urls: string[]) => void;
  extractChannel: (url: string, limit?: number) => Promise<any>;
  downloadInProgress: boolean;
  downloadStatus: string;
  onCancelDownload: () => void;
}

function ChannelDownloadModal({
  isOpen,
  onClose,
  onDownload,
  extractChannel,
  downloadInProgress,
  downloadStatus,
  onCancelDownload,
}: ChannelDownloadModalProps) {
  const [channelUrl, setChannelUrl] = useState('');
  const [entries, setEntries] = useState<ChannelEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channelTitle, setChannelTitle] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number | ''>('');

  if (!isOpen) return null;

  const handleExtract = async () => {
    if (!channelUrl.trim()) return;
    setExtracting(true);
    setError('');
    setEntries([]);
    setSelected(new Set());
    setChannelTitle('');

    const result = await extractChannel(channelUrl.trim(), typeof limit === 'number' ? limit : 0);

    if (result.status === 'error') {
      setError(result.msg || 'Failed to extract channel');
    } else {
      const videoEntries = result.entries || [];
      setEntries(videoEntries);
      setChannelTitle(result.channel || result.title || '');
      setSelected(new Set(videoEntries.map((e: ChannelEntry) => e.url)));
    }
    setExtracting(false);
  };

  const toggleSelect = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.url)));
    }
  };

  const handleDownload = () => {
    const urls = entries.filter((e) => selected.has(e.url)).map((e) => e.url);
    if (urls.length === 0) return;
    onDownload(urls);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Channel/Playlist Download
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Paste a YouTube channel, playlist, or profile URL to download all videos
          </p>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* URL Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://youtube.com/@channel or playlist URL..."
              disabled={extracting || downloadInProgress}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
            />
            <input
              type="number"
              min="0"
              value={limit}
              onChange={(e) => setLimit(e.target.value ? parseInt(e.target.value) : '')}
              placeholder="Limit"
              disabled={extracting || downloadInProgress}
              className="w-20 px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
              title="Max videos (0 = all)"
            />
            <button
              onClick={handleExtract}
              disabled={extracting || !channelUrl.trim() || downloadInProgress}
              className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                'Fetch Videos'
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Channel Info & Video List */}
          {entries.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {channelTitle && <span className="font-semibold">{channelTitle}</span>}
                    {' — '}{entries.length} video{entries.length !== 1 ? 's' : ''} found
                  </span>
                </div>
                <button
                  onClick={toggleAll}
                  className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
                >
                  {selected.size === entries.length ? (
                    <><CheckSquare className="w-4 h-4" /> Deselect All</>
                  ) : (
                    <><Square className="w-4 h-4" /> Select All ({entries.length})</>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map((entry, idx) => (
                  <label
                    key={entry.url || idx}
                    className={`flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors ${
                      selected.has(entry.url) ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(entry.url)}
                      onChange={() => toggleSelect(entry.url)}
                      disabled={downloadInProgress}
                      className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500 w-8 text-right flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">
                        {entry.title || entry.id || 'Untitled'}
                      </p>
                    </div>
                    {entry.duration != null && entry.duration > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {formatDuration(entry.duration)}
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {downloadStatus && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{downloadStatus}</p>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          {downloadInProgress && (
            <button
              onClick={onCancelDownload}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              Cancel
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            {entries.length > 0 && (
              <button
                onClick={handleDownload}
                disabled={selected.size === 0 || downloadInProgress}
                className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {downloadInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download {selected.size} Video{selected.size !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AddDownloadForm() {
  const { addDownload, previewUrl, extractChannel, loading, configuration, customDirs, queue, done, autoSaveToDevice, setAutoSaveToDevice } = useDownloads();

  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp4');
  const [quality, setQuality] = useState('2160');
  const [speedLimit, setSpeedLimit] = useState<string>('unlimited');
  const [folder, setFolder] = useState('');
  const [customNamePrefix, setCustomNamePrefix] = useState('');
  const [playlistItemLimit, setPlaylistItemLimit] = useState<number | ''>('');
  const [autoStart, setAutoStart] = useState(true);
  const [splitByChapters, setSplitByChapters] = useState(false);
  const [chapterTemplate, setChapterTemplate] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [addInProgress, setAddInProgress] = useState(false);

  // Batch import state
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState('');
  const [batchInProgress, setBatchInProgress] = useState(false);
  const [cancelBatchFlag, setCancelBatchFlag] = useState(false);

  // Channel/bulk download state
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [channelDownloadStatus, setChannelDownloadStatus] = useState('');
  const [channelDownloadInProgress, setChannelDownloadInProgress] = useState(false);
  const [cancelChannelFlag, setCancelChannelFlag] = useState(false);

  // UX: clipboard, preview, subs, clip
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [subtitleLangs, setSubtitleLangs] = useState('');
  const [clipStart, setClipStart] = useState('');
  const [clipEnd, setClipEnd] = useState('');
  const [selectedPlaylistUrls, setSelectedPlaylistUrls] = useState<Set<string>>(new Set());

  const selectedFormat = Formats.find((f) => f.id === format) || Formats[0];
  const qualities = selectedFormat.qualities;
  const availableDirs = isAudioFormat(quality, format)
    ? customDirs.audio_download_dir
    : customDirs.download_dir;

  // Detect platform from URL
  const detectedPlatform = useMemo(() => detectPlatform(url), [url]);

  // Get the actual speed limit value in bytes per second
  const getSpeedLimitValue = (): number | null => {
    const option = SpeedLimits.find((s) => s.id === speedLimit);
    return option?.value ?? null;
  };

  // Prefill from ?url= (PWA share target / deep link)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const shared = params.get('url');
      if (shared) {
        setUrl(shared);
        // clean query without reload
        const clean = window.location.pathname;
        window.history.replaceState({}, '', clean);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Clipboard link detection on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.clipboard?.readText) return;
        const text = (await navigator.clipboard.readText()).trim();
        if (cancelled || !text) return;
        const m = text.match(/https?:\/\/[^\s]+/i);
        if (!m) return;
        const link = m[0];
        // Ignore if already in the input or looks like our own origin
        if (url.trim()) return;
        if (link.includes(window.location.host)) return;
        setClipboardUrl(link);
      } catch {
        /* permission denied — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load preferences from cookies
  useEffect(() => {
    const savedFormat = getCookie('svidown_format');
    const savedQuality = getCookie('svidown_quality');
    const savedSpeedLimit = getCookie('svidown_speed_limit');
    const savedAutoStart = getCookie('svidown_auto_start');
    const savedSplitChapters = getCookie('svidown_split_chapters');
    const savedChapterTemplate = getCookie('svidown_chapter_template');

    if (savedFormat) setFormat(savedFormat);
    if (savedQuality) setQuality(savedQuality);
    if (savedSpeedLimit) setSpeedLimit(savedSpeedLimit);
    if (savedAutoStart !== null) setAutoStart(savedAutoStart !== 'false');
    if (savedSplitChapters) setSplitByChapters(savedSplitChapters === 'true');
    if (savedChapterTemplate) setChapterTemplate(savedChapterTemplate);
  }, []);

  // Set chapter template from config if not set
  useEffect(() => {
    if (!chapterTemplate && configuration.OUTPUT_TEMPLATE_CHAPTER) {
      setChapterTemplate(configuration.OUTPUT_TEMPLATE_CHAPTER);
    }
  }, [configuration.OUTPUT_TEMPLATE_CHAPTER, chapterTemplate]);

  // Ensure quality is valid when format changes
  useEffect(() => {
    const validQuality = qualities.find((q) => q.id === quality);
    if (!validQuality) {
      setQuality('best');
    }
  }, [format, qualities, quality]);

  const handleFormatChange = (newFormat: string) => {
    setFormat(newFormat);
    setCookie('svidown_format', newFormat);
  };

  const handleQualityChange = (newQuality: string) => {
    setQuality(newQuality);
    setCookie('svidown_quality', newQuality);
  };

  const handleSpeedLimitChange = (newSpeedLimit: string) => {
    setSpeedLimit(newSpeedLimit);
    setCookie('svidown_speed_limit', newSpeedLimit);
  };

  const handleAutoStartChange = (value: boolean) => {
    setAutoStart(value);
    setCookie('svidown_auto_start', value ? 'true' : 'false');
  };

  const handleSplitByChaptersChange = (value: boolean) => {
    setSplitByChapters(value);
    setCookie('svidown_split_chapters', value ? 'true' : 'false');
  };

  const handleChapterTemplateChange = (value: string) => {
    setChapterTemplate(value || configuration.OUTPUT_TEMPLATE_CHAPTER);
    setCookie('svidown_chapter_template', value);
  };


  const buildClipSection = (): string | undefined => {
    const s = clipStart.trim();
    const e = clipEnd.trim();
    if (!s && !e) return undefined;
    if (s && e) return `*${s}-${e}`;
    if (s) return `*${s}-inf`;
    return `*0:00-${e}`;
  };

  const downloadOptions = () => ({
    subtitleLangs: subtitleLangs.trim() || undefined,
    downloadSections: buildClipSection(),
    selectedPlaylistUrls:
      selectedPlaylistUrls.size > 0 ? Array.from(selectedPlaylistUrls) : undefined,
  });

  const handlePreview = async () => {
    if (!url.trim()) return;
    setPreviewLoading(true);
    setPreview(null);
    const result = await previewUrl(url.trim());
    setPreview(result);
    if (result.status === 'ok' && result.type === 'playlist' && result.entries) {
      setSelectedPlaylistUrls(new Set(result.entries.map((e) => e.url).filter(Boolean)));
    }
    setPreviewLoading(false);
  };

  const handleClipboardDownload = async () => {
    if (!clipboardUrl) return;
    setUrl(clipboardUrl);
    setClipboardUrl(null);
    setAddInProgress(true);
    const result = await addDownload(
      clipboardUrl,
      quality,
      format,
      folder || undefined,
      customNamePrefix,
      typeof playlistItemLimit === 'number' ? playlistItemLimit : undefined,
      autoStart,
      splitByChapters,
      chapterTemplate,
      getSpeedLimitValue(),
      downloadOptions()
    );
    if (result.status === 'error') {
      alert(`Error: ${result.msg}`);
    } else {
      setUrl('');
    }
    setAddInProgress(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (splitByChapters && !chapterTemplate.includes('%(section_number)')) {
      alert('Chapter template must include %(section_number)');
      return;
    }

    // Multiple links pasted at once (one per line)
    const lines = url
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));
    if (lines.length > 1) {
      setAddInProgress(true);
      for (const line of lines) {
        const result = await addDownload(
          line,
          quality,
          format,
          folder || undefined,
          customNamePrefix,
          typeof playlistItemLimit === 'number' ? playlistItemLimit : undefined,
          autoStart,
          splitByChapters,
          chapterTemplate,
          getSpeedLimitValue(),
          downloadOptions()
        );
        if (result.status === 'error') {
          console.error(result.msg);
        }
      }
      setUrl('');
      setPreview(null);
      setAddInProgress(false);
      return;
    }

    setAddInProgress(true);
    const result = await addDownload(
      url.trim(),
      quality,
      format,
      folder || undefined,
      customNamePrefix,
      typeof playlistItemLimit === 'number' ? playlistItemLimit : undefined,
      autoStart,
      splitByChapters,
      chapterTemplate,
      getSpeedLimitValue(),
      downloadOptions()
    );

    if (result.status === 'error') {
      alert(`Error adding URL: ${result.msg}`);
    } else {
      setUrl('');
      setPreview(null);
      setSelectedPlaylistUrls(new Set());
    }
    setAddInProgress(false);
  };

  const handleBatchImport = async (urls: string[]) => {
    setBatchInProgress(true);
    setCancelBatchFlag(false);
    setBatchStatus(`Starting to import ${urls.length} URLs...`);

    for (let i = 0; i < urls.length; i++) {
      if (cancelBatchFlag) {
        setBatchStatus(`Import cancelled after ${i} of ${urls.length} URLs.`);
        setBatchInProgress(false);
        return;
      }

      const currentUrl = urls[i];
      setBatchStatus(`Importing URL ${i + 1} of ${urls.length}: ${currentUrl}`);

      const result = await addDownload(
        currentUrl,
        quality,
        format,
        folder || undefined,
        customNamePrefix,
        typeof playlistItemLimit === 'number' ? playlistItemLimit : undefined,
        autoStart,
        splitByChapters,
        chapterTemplate,
        getSpeedLimitValue()
      );

      if (result.status === 'error') {
        console.error(`Error importing ${currentUrl}: ${result.msg}`);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setBatchStatus(`Finished importing ${urls.length} URLs.`);
    setBatchInProgress(false);
  };

  const handleChannelDownload = async (urls: string[]) => {
    setChannelDownloadInProgress(true);
    setCancelChannelFlag(false);
    setChannelDownloadStatus(`Starting to download ${urls.length} videos...`);

    for (let i = 0; i < urls.length; i++) {
      if (cancelChannelFlag) {
        setChannelDownloadStatus(`Cancelled after ${i} of ${urls.length} videos.`);
        setChannelDownloadInProgress(false);
        return;
      }

      setChannelDownloadStatus(`Adding video ${i + 1} of ${urls.length}...`);

      const result = await addDownload(
        urls[i],
        quality,
        format,
        folder || undefined,
        customNamePrefix,
        typeof playlistItemLimit === 'number' ? playlistItemLimit : undefined,
        autoStart,
        splitByChapters,
        chapterTemplate,
        getSpeedLimitValue()
      );

      if (result.status === 'error') {
        console.error(`Error adding ${urls[i]}: ${result.msg}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setChannelDownloadStatus(`All ${urls.length} videos added to queue!`);
    setChannelDownloadInProgress(false);
  };

  const exportUrls = () => {
    const urls = [
      ...Array.from(queue.values()).map((dl) => dl.url),
      ...Array.from(done.values()).map((dl) => dl.url),
    ];
    if (urls.length === 0) {
      alert('No URLs to export.');
      return;
    }
    const blob = new Blob([urls.join('\n')], { type: 'text/plain' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'download_urls.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  };

  const copyUrls = async () => {
    const urls = [
      ...Array.from(queue.values()).map((dl) => dl.url),
      ...Array.from(done.values()).map((dl) => dl.url),
    ];
    if (urls.length === 0) {
      alert('No URLs to copy.');
      return;
    }
    try {
      await navigator.clipboard.writeText(urls.join('\n'));
      alert('URLs copied to clipboard.');
    } catch {
      alert('Failed to copy URLs.');
    }
  };

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-8">
        <form onSubmit={handleSubmit}>
          {/* Supported Platforms Banner */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Supports:</span>
            {FeaturedPlatforms.map((platform) => (
              <span
                key={platform.name}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                <span>{platform.icon}</span>
                <span>{platform.name}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full text-xs font-medium text-blue-700 dark:text-blue-300">
              <Globe className="w-3 h-3" />
              <span>1000+ more</span>
            </span>
          </div>

          {/* Clipboard suggestion */}
          {clipboardUrl && (
            <div
              className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
              data-testid="clipboard-suggest"
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <ClipboardPaste className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Link found on clipboard</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 truncate" title={clipboardUrl}>{clipboardUrl}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { setUrl(clipboardUrl); setClipboardUrl(null); }}
                  className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100"
                >
                  Use
                </button>
                <button
                  type="button"
                  onClick={handleClipboardDownload}
                  disabled={addInProgress}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                  data-testid="clipboard-download"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setClipboardUrl(null)}
                  className="px-3 py-1.5 text-sm text-gray-500"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Main URL Input */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <textarea
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste video, playlist or channel URL here (one per line for multiple)..."
                rows={2}
                data-testid="url-input"
                disabled={addInProgress || loading}
                className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-all pr-24 resize-y"
              ></textarea>
              {url && detectedPlatform && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  <span className={`text-lg ${detectedPlatform.color}`}>
                    {detectedPlatform.icon}
                  </span>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {detectedPlatform.name}
                  </span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading || addInProgress || loading || !url.trim()}
              className="px-5 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              data-testid="preview-btn"
            >
              {previewLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
              Preview
            </button>
            <button
              type="submit"
              disabled={addInProgress || loading || !url.trim()}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-400 disabled:to-blue-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-w-[140px]"
              data-testid="download-btn"
            >
              {addInProgress ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setChannelModalOpen(true)}
              disabled={loading}
              className="px-5 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              title="Download all videos from a channel or playlist"
            >
              <Users className="w-5 h-5" />
              Bulk
            </button>
          </div>

          {/* Platform Detection Status */}
          {url && (
            <div className="mb-4">
              {detectedPlatform ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {detectedPlatform.id === 'other'
                      ? 'URL detected - attempting download'
                      : `${detectedPlatform.name} video detected`}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Enter a valid video URL to continue</span>
                </div>
              )}
            </div>
          )}


          {/* Preview card */}
          {preview && (
            <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid="preview-panel">
              {preview.status === 'error' ? (
                <div className="p-4 text-sm text-red-600" data-testid="preview-error">{preview.msg}</div>
              ) : (
                <div className="p-4 flex flex-col sm:flex-row gap-4">
                  {preview.thumbnail && (
                    <img
                      src={preview.thumbnail}
                      alt=""
                      className="w-full sm:w-48 h-28 object-cover rounded-lg bg-gray-100"
                      data-testid="preview-thumb"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate" data-testid="preview-title">
                      {preview.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {preview.type === 'playlist'
                        ? `Playlist · ${preview.entry_count ?? preview.entries?.length ?? 0} items`
                        : (
                          <>
                            {preview.duration != null && (
                              <span data-testid="preview-duration">
                                {Math.floor(preview.duration / 60)}:{String(Math.floor(preview.duration % 60)).padStart(2, '0')}
                              </span>
                            )}
                            {preview.uploader && <span> · {preview.uploader}</span>}
                          </>
                        )}
                    </p>
                    {preview.qualities && preview.qualities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2" data-testid="preview-qualities">
                        {preview.qualities.map((q) => (
                          <button
                            key={q.quality}
                            type="button"
                            onClick={() => {
                              if (q.quality === 'mp3') {
                                handleFormatChange('mp3');
                                handleQualityChange('best');
                              } else {
                                handleFormatChange('mp4');
                                const h = q.quality.replace('p', '');
                                handleQualityChange(h === 'best' ? 'best' : h);
                              }
                            }}
                            className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-blue-100"
                          >
                            {q.quality}
                            {q.filesize ? ` · ${formatFileSize(q.filesize)}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    {preview.type === 'playlist' && preview.entries && (
                      <div className="mt-3 max-h-48 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg" data-testid="playlist-picker">
                        {preview.entries.map((e) => (
                          <label key={e.url || e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedPlaylistUrls.has(e.url)}
                              onChange={() => {
                                setSelectedPlaylistUrls((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(e.url)) next.delete(e.url);
                                  else next.add(e.url);
                                  return next;
                                });
                              }}
                            />
                            <span className="truncate">{e.title}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {preview.subtitles && preview.subtitles.length > 0 && (
                      <p className="mt-2 text-xs text-gray-500">
                        Subs available: {preview.subtitles.slice(0, 8).map((s) => s.lang).join(', ')}
                        {preview.subtitles.length > 8 ? '…' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Subtitles + clip + auto-save */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Subtitles className="w-4 h-4" /> Subtitles (langs)
              </span>
              <input
                type="text"
                value={subtitleLangs}
                onChange={(e) => setSubtitleLangs(e.target.value)}
                placeholder="e.g. en,es or all"
                data-testid="subtitle-langs"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                <Clapperboard className="w-4 h-4" /> Clip start
              </span>
              <input
                type="text"
                value={clipStart}
                onChange={(e) => setClipStart(e.target.value)}
                placeholder="0:00"
                data-testid="clip-start"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-600 dark:text-gray-300">Clip end</span>
              <input
                type="text"
                value={clipEnd}
                onChange={(e) => setClipEnd(e.target.value)}
                placeholder="1:00"
                data-testid="clip-end"
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoSaveToDevice}
              onChange={(e) => setAutoSaveToDevice(e.target.checked)}
              data-testid="auto-save-toggle"
              className="w-4 h-4 text-blue-500 rounded"
            />
            Auto-save finished files to this device
          </label>

          {/* Quick quality / format presets */}
          <div className="flex flex-wrap gap-2 mb-4" data-testid="quality-presets">
            {[
              { label: 'Best MP4', f: 'mp4', q: 'best' },
              { label: '1080p', f: 'mp4', q: '1080' },
              { label: '720p', f: 'mp4', q: '720' },
              { label: '480p', f: 'mp4', q: '480' },
              { label: 'MP3 audio', f: 'mp3', q: '192' },
            ].map((p) => {
              const active = format === p.f && quality === p.q;
              return (
                <button
                  key={p.label}
                  type="button"
                  disabled={addInProgress || loading}
                  onClick={() => {
                    handleFormatChange(p.f);
                    handleQualityChange(p.q);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-blue-400'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Quality
              </label>
              <select
                value={quality}
                onChange={(e) => handleQualityChange(e.target.value)}
                disabled={addInProgress || loading}
                data-testid="quality-select"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {qualities.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.text}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Format
              </label>
              <select
                value={format}
                onChange={(e) => handleFormatChange(e.target.value)}
                disabled={addInProgress || loading}
                data-testid="format-select"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {Formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.text}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                <Gauge className="w-4 h-4" />
                Speed Limit
                <span className="relative group">
                  <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Limit download bandwidth
                  </span>
                </span>
              </label>
              <select
                value={speedLimit}
                onChange={(e) => handleSpeedLimitChange(e.target.value)}
                disabled={addInProgress || loading}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                {SpeedLimits.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
              >
                More Options
                {isAdvancedOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Advanced Options */}
          {isAdvancedOpen && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 mt-4 space-y-4 bg-gray-50 dark:bg-gray-900/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Auto Start
                  </label>
                  <select
                    value={autoStart ? 'true' : 'false'}
                    onChange={(e) => handleAutoStartChange(e.target.value === 'true')}
                    disabled={addInProgress || loading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                {configuration.CUSTOM_DIRS && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Download Folder
                    </label>
                    <select
                      value={folder}
                      onChange={(e) => setFolder(e.target.value)}
                      disabled={addInProgress || loading}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">Default</option>
                      {availableDirs.map((dir) => (
                        <option key={dir} value={dir}>
                          {dir}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Custom Name Prefix
                  </label>
                  <input
                    type="text"
                    value={customNamePrefix}
                    onChange={(e) => setCustomNamePrefix(e.target.value)}
                    placeholder="Optional prefix"
                    disabled={addInProgress || loading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Playlist Item Limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={playlistItemLimit}
                    onChange={(e) =>
                      setPlaylistItemLimit(e.target.value ? parseInt(e.target.value) : '')
                    }
                    placeholder="0 = no limit"
                    disabled={addInProgress || loading}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={splitByChapters}
                    onChange={(e) => handleSplitByChaptersChange(e.target.checked)}
                    disabled={addInProgress || loading}
                    className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Split by chapters
                  </span>
                </label>

                {splitByChapters && (
                  <div className="flex-1">
                    <input
                      type="text"
                      value={chapterTemplate}
                      onChange={(e) => handleChapterTemplateChange(e.target.value)}
                      placeholder="Chapter template"
                      disabled={addInProgress || loading}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 text-sm"
                    />
                  </div>
                )}
              </div>

              <hr className="border-gray-200 dark:border-gray-700" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setBatchModalOpen(true)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileUp className="w-4 h-4" />
                  Import URLs
                </button>
                <button
                  type="button"
                  onClick={exportUrls}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileDown className="w-4 h-4" />
                  Export URLs
                </button>
                <button
                  type="button"
                  onClick={copyUrls}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Copy URLs
                </button>
              </div>

              {/* Public Content Notice */}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>Note:</strong> This tool only supports publicly accessible videos. Private content, login-protected videos, and paywalled media cannot be downloaded.
                </p>
              </div>
            </div>
          )}
        </form>
      </div>

      <BatchImportModal
        isOpen={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        onImport={handleBatchImport}
        status={batchStatus}
        inProgress={batchInProgress}
        onCancel={() => setCancelBatchFlag(true)}
      />

      <ChannelDownloadModal
        isOpen={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
        onDownload={handleChannelDownload}
        extractChannel={extractChannel}
        downloadInProgress={channelDownloadInProgress}
        downloadStatus={channelDownloadStatus}
        onCancelDownload={() => setCancelChannelFlag(true)}
      />
    </>
  );
}
