'use client';

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
} from 'lucide-react';

export default function CompletedDownloads() {
  const { done, configuration, deleteDownloads, addDownload, toggleChecked, setAllChecked } =
    useDownloads();

  const downloads = Array.from(done.values());
  const checkedCount = downloads.filter((d) => d.checked).length;
  const allChecked = downloads.length > 0 && checkedCount === downloads.length;
  const someChecked = checkedCount > 0 && !allChecked;

  const completedCount = downloads.filter((d) => d.status === 'finished').length;
  const failedCount = downloads.filter((d) => d.status === 'error').length;

  const handleClearSelected = async () => {
    const ids = downloads.filter((d) => d.checked).map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleClearCompleted = async () => {
    const ids = downloads.filter((d) => d.status === 'finished').map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleClearFailed = async () => {
    const ids = downloads.filter((d) => d.status === 'error').map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('done', ids);
    }
  };

  const handleRetryFailed = async () => {
    const failedDownloads = downloads.filter((d) => d.status === 'error');
    for (const dl of failedDownloads) {
      await addDownload(
        dl.url,
        dl.quality,
        dl.format,
        dl.folder,
        dl.custom_name_prefix,
        dl.playlist_item_limit,
        true,
        dl.split_by_chapters,
        dl.chapter_template
      );
      await deleteDownloads('done', [dl.url]);
    }
  };

  const handleRetryOne = async (dl: typeof downloads[0]) => {
    await addDownload(
      dl.url,
      dl.quality,
      dl.format,
      dl.folder,
      dl.custom_name_prefix,
      dl.playlist_item_limit,
      true,
      dl.split_by_chapters,
      dl.chapter_template
    );
    await deleteDownloads('done', [dl.url]);
  };

  const handleDeleteOne = async (id: string) => {
    await deleteDownloads('done', [id]);
  };

  const handleDownloadSelected = () => {
    const selectedDownloads = downloads.filter((d) => d.status === 'finished' && d.checked);
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

  const buildDownloadLink = (download: typeof downloads[0]) => {
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

  const buildChapterDownloadLink = (download: typeof downloads[0], chapterFilename: string) => {
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <FileCheck className="w-5 h-5" />
          Completed
          {downloads.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
              {downloads.length}
            </span>
          )}
        </h2>
      </div>

      {/* Action buttons */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-4">
        <button
          onClick={handleClearSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          Clear selected
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
                  disabled={downloads.length === 0}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Video
              </th>
              <th className="w-28 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Size
              </th>
              <th className="w-32 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {downloads.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No completed downloads
                </td>
              </tr>
            ) : (
              downloads.map((download) => (
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
                          {download.msg && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {download.msg}
                            </p>
                          )}
                          {download.error && (
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
                        {download.filename && (
                          <a
                            href={buildDownloadLink(download)}
                            download
                            className="p-1.5 text-gray-500 hover:text-green-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Download file"
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
    </div>
  );
}
