'use client';

import { useState, useEffect, useMemo } from 'react';
import { useDownloads } from '@/context/DownloadsContext';
import { Formats, isAudioFormat } from '@/data/formats';
import { SpeedLimits } from '@/data/speedLimits';
import { detectPlatform, FeaturedPlatforms } from '@/data/platforms';
import { getCookie, setCookie } from '@/lib/utils';
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

export default function AddDownloadForm() {
  const { addDownload, loading, configuration, customDirs, queue, done } = useDownloads();

  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('any');
  const [quality, setQuality] = useState('best');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    if (splitByChapters && !chapterTemplate.includes('%(section_number)')) {
      alert('Chapter template must include %(section_number)');
      return;
    }

    setAddInProgress(true);
    const result = await addDownload(
      url,
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
      alert(`Error adding URL: ${result.msg}`);
    } else {
      setUrl('');
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

          {/* Main URL Input */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste video or playlist URL here..."
                disabled={addInProgress || loading}
                className="w-full px-4 py-3 text-lg border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-all pr-24"
              />
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
              type="submit"
              disabled={addInProgress || loading || !url.trim()}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-400 disabled:to-blue-500 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 min-w-[140px]"
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
    </>
  );
}
