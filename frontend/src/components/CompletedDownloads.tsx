'use client';

import { useState, useMemo } from 'react';
import { useDownloads } from '@/context/DownloadsContext';
import { formatFileSize, cn, getApiBaseUrl } from '@/lib/utils';
import {
  CheckCircle,
  XCircle,
  Trash2,
  ExternalLink,
  Download,
  RotateCcw,
  FileCheck,
  ChevronDown,
  Search,
  Filter,
  Play,
  X,
} from 'lucide-react';
import type { Download as DownloadType } from '@/types';

const PAGE_SIZE = 50;

type FilterMode = 'all' | 'finished' | 'error';

export default function CompletedDownloads() {
  const { done, configuration, deleteDownloads, addDownload, retryDownloads, toggleChecked, setAllChecked } =
    useDownloads();

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [playing, setPlaying] = useState<DownloadType | null>(null);

  const allDownloads = useMemo(() => Array.from(done.values()), [done]);

  // Filter and search
  const filteredDownloads = useMemo(() => {
    let result = allDownloads;

    if (filterMode === 'finished') {
      result = result.filter((d) => d.status === 'finished');
    } else if (filterMode === 'error') {
      result = result.filter((d) => d.status === 'error');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.title?.toLowerCase().includes(q) ||
          d.url?.toLowerCase().includes(q) ||
          d.filename?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [allDownloads, filterMode, searchQuery]);

  // Only render visible items
  const visibleDownloads = useMemo(
    () => filteredDownloads.slice(0, visibleCount),
    [filteredDownloads, visibleCount]
  );

  const remaining = filteredDownloads.length - visibleCount;
  const totalCount = allDownloads.length;
  const completedCount = allDownloads.filter((d) => d.status === 'finished').length;
  const failedCount = allDownloads.filter((d) => d.status === 'error').length;
  const checkedCount = allDownloads.filter((d) => d.checked).length;
  const allChecked = allDownloads.length > 0 && checkedCount === allDownloads.length;
  const someChecked = checkedCount > 0 && !allChecked;

  const handleClearSelected = async () => {
    const ids = allDownloads.filter((d) => d.checked).map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleClearCompleted = async () => {
    const ids = allDownloads.filter((d) => d.status === 'finished').map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleClearFailed = async () => {
    const ids = allDownloads.filter((d) => d.status === 'error').map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleRetryFailed = async () => {
    const ids = allDownloads.filter((d) => d.status === 'error').map((d) => d.url);
    if (ids.length > 0) {
      await retryDownloads(ids);
    }
  };

  const handleRetryOne = async (dl: typeof allDownloads[0]) => {
    await retryDownloads([dl.url]);
  };

  const handleDeleteOne = async (id: string) => {
    await deleteDownloads('done', [id]);
  };

  const handleDownloadSelected = () => {
    const selectedDownloads = allDownloads.filter((d) => d.status === 'finished' && d.checked);
    selectedDownloads.forEach((dl) => {
      const link = document.createElement('a');
      link.href = buildDownloadLink(dl);
      link.setAttribute('download', dl.filename);
      link.setAttribute('target', '_self');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  };

  const buildDownloadLink = (download: typeof allDownloads[0]) => {
    const baseUrl = getApiBaseUrl();
    let baseDir = configuration.PUBLIC_HOST_URL;
    if (download.quality === 'audio' || download.filename?.endsWith('.mp3')) {
      baseDir = configuration.PUBLIC_HOST_AUDIO_URL;
    }
    if (download.folder) {
      baseDir += download.folder + '/';
    }
    return `${baseUrl}/${baseDir}${encodeURIComponent(download.filename)}`;
  };

  const buildChapterDownloadLink = (download: typeof allDownloads[0], chapterFilename: string) => {
    const baseUrl = getApiBaseUrl();
    let baseDir = configuration.PUBLIC_HOST_URL;
    if (download.quality === 'audio' || chapterFilename?.endsWith('.mp3')) {
      baseDir = configuration.PUBLIC_HOST_AUDIO_URL;
    }
    if (download.folder) {
      baseDir += download.folder + '/';
    }
    return `${baseUrl}/${baseDir}${encodeURIComponent(chapterFilename)}`;
  };

  const getChapterFileName = (filepath: string) => {
    const parts = filepath.split('/');
    return parts[parts.length - 1];
  };

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  };

  const handleLoadAll = () => {
    setVisibleCount(filteredDownloads.length);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCheck className="w-5 h-5" />
          Completed
          {totalCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
              {totalCount}
            </span>
          )}
          {completedCount > 0 && (
            <span className="px-2 py-0.5 bg-green-400/30 rounded-full text-sm">
              {completedCount} done
            </span>
          )}
          {failedCount > 0 && (
            <span className="px-2 py-0.5 bg-red-400/30 rounded-full text-sm">
              {failedCount} failed
            </span>
          )}
        </h2>
      </div>

      {/* Search & Filter Bar */}
      {totalCount > 0 && (
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder={`Search ${totalCount} downloads...`}
              data-testid="history-search"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-400" />
            {(['all', 'finished', 'error'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setFilterMode(mode);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                  filterMode === mode
                    ? mode === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : mode === 'finished'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                )}
              >
                {mode === 'all' ? `All (${totalCount})` : mode === 'finished' ? `Done (${completedCount})` : `Failed (${failedCount})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-4">
        <button
          onClick={handleClearSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          Clear selected ({checkedCount})
        </button>
        <button
          onClick={handleClearCompleted}
          disabled={completedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <CheckCircle className="w-4 h-4" />
          Clear completed
        </button>
        <button
          onClick={handleClearFailed}
          disabled={failedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <XCircle className="w-4 h-4" />
          Clear failed
        </button>
        <button
          onClick={handleRetryFailed}
          disabled={failedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <RotateCcw className="w-4 h-4" />
          Retry failed
        </button>
        <button
          onClick={handleDownloadSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Download className="w-4 h-4" />
          Download selected
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => setAllChecked('done', e.target.checked)}
                  className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  disabled={allDownloads.length === 0}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Video
                {searchQuery && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({filteredDownloads.length} results)
                  </span>
                )}
              </th>
              <th className="w-28 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Size
              </th>
              <th className="w-32 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredDownloads.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  {searchQuery ? 'No matching downloads' : 'No completed downloads'}
                </td>
              </tr>
            ) : (
              visibleDownloads.map((download) => (
                <>
                  <tr
                    key={download.url}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors',
                      download.deleting && 'opacity-50'
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={download.checked || false}
                        onChange={() => toggleChecked('done', download.url)}
                        className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {download.status === 'finished' ? (
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          {download.filename ? (
                            <a
                              href={buildDownloadLink(download)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium truncate block max-w-md"
                              title={download.title}
                            >
                              {download.title}
                            </a>
                          ) : (
                            <span
                              className="text-gray-900 dark:text-white font-medium truncate block max-w-md"
                              title={download.title}
                            >
                              {download.title}
                            </span>
                          )}
                          {(download.failure_reason || download.msg) && (
                            <p className="text-xs text-red-500 dark:text-red-400 mt-1 break-words" data-testid="failure-reason">
                              {download.failure_reason || download.msg}
                            </p>
                          )}
                          {download.error && !download.failure_reason && (
                            <p className="text-xs text-red-500 mt-1">Error: {download.error}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {formatFileSize(download.size)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {download.status === 'error' && (
                          <button
                            onClick={() => handleRetryOne(download)}
                            className="p-1.5 text-gray-500 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Retry"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {download.status === 'finished' && download.filename && (
                          <button
                            onClick={() => setPlaying(download)}
                            className="p-1.5 text-gray-500 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Play in app"
                            data-testid="play-in-app"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {download.filename && (
                          <a
                            href={buildDownloadLink(download)}
                            download
                            className="p-1.5 text-gray-500 hover:text-green-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Download file"
                            data-testid="save-to-device"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <a
                          href={download.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-500 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Open source"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteOne(download.url)}
                          className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* Chapter files */}
                  {download.chapter_files && download.chapter_files.length > 0 && (
                    download.chapter_files.map((chapter) => (
                      <tr
                        key={`${download.url}-${chapter.filename}`}
                        className={cn(
                          'bg-gray-50/50 dark:bg-gray-900/20',
                          download.deleting && 'opacity-50'
                        )}
                      >
                        <td></td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2 pl-6">
                            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <a
                              href={buildChapterDownloadLink(download, chapter.filename)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 truncate"
                            >
                              {getChapterFileName(chapter.filename)}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                          {formatFileSize(chapter.size)}
                        </td>
                        <td className="px-4 py-2">
                          <a
                            href={buildChapterDownloadLink(download, chapter.filename)}
                            download
                            className="p-1.5 text-gray-500 hover:text-green-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors inline-block"
                            title="Download file"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      {remaining > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center gap-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing {visibleCount} of {filteredDownloads.length}
          </span>
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <ChevronDown className="w-4 h-4" />
            Load {Math.min(PAGE_SIZE, remaining)} More
          </button>
          {remaining > PAGE_SIZE && (
            <button
              onClick={handleLoadAll}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Load All ({remaining})
            </button>
          )}
        </div>
      )}

      {playing && playing.filename && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          data-testid="video-player-modal"
          onClick={() => setPlaying(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate pr-4">
                {playing.title}
              </h3>
              <button
                onClick={() => setPlaying(null)}
                className="p-1 text-gray-500 hover:text-red-500"
                data-testid="close-player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <video
              key={playing.url}
              src={buildDownloadLink(playing)}
              controls
              autoPlay
              className="w-full max-h-[70vh] bg-black"
              data-testid="in-app-video"
            />
          </div>
        </div>
      )}
    </div>
  );
}
