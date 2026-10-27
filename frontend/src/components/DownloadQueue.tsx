'use client';

import { useDownloads } from '@/context/DownloadsContext';
import { formatSpeed, formatEta, cn } from '@/lib/utils';
import { Download, Trash2, ExternalLink, Play, Pause } from 'lucide-react';

export default function DownloadQueue() {
  const { queue, deleteDownloads, startDownloads, pauseDownloads, toggleChecked, setAllChecked } =
    useDownloads();

  const downloads = Array.from(queue.values());
  const checkedCount = downloads.filter((d) => d.checked).length;
  const allChecked = downloads.length > 0 && checkedCount === downloads.length;
  const someChecked = checkedCount > 0 && !allChecked;

  const handleCancelSelected = async () => {
    const ids = downloads.filter((d) => d.checked).map((d) => d.url);
    if (ids.length > 0) {
      await deleteDownloads('queue', ids);
    }
  };

  const handleStartSelected = async () => {
    const ids = downloads
      .filter((d) => d.checked && (d.status === 'pending' || d.status === 'paused'))
      .map((d) => d.url);
    if (ids.length > 0) {
      await startDownloads(ids);
    }
  };

  const handlePauseSelected = async () => {
    const ids = downloads
      .filter((d) => d.checked && (d.status === 'downloading' || d.status === 'preparing'))
      .map((d) => d.url);
    if (ids.length > 0) {
      await pauseDownloads(ids);
    }
  };

  const handleDeleteOne = async (id: string) => {
    await deleteDownloads('queue', [id]);
  };

  const handleStartOne = async (id: string) => {
    await startDownloads([id]);
  };

  const handlePauseOne = async (id: string) => {
    await pauseDownloads([id]);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden mb-8" data-testid="download-queue">
      <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Download className="w-5 h-5" />
          Downloading
          {downloads.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
              {downloads.length}
            </span>
          )}
        </h2>
      </div>

      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-4">
        <button
          onClick={handleCancelSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          Cancel selected
        </button>
        <button
          onClick={handlePauseSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-amber-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          data-testid="pause-selected"
        >
          <Pause className="w-4 h-4" />
          Pause selected
        </button>
        <button
          onClick={handleStartSelected}
          disabled={checkedCount === 0}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <Play className="w-4 h-4" />
          Resume / start selected
        </button>
      </div>

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
                  onChange={(e) => setAllChecked('queue', e.target.checked)}
                  className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  disabled={downloads.length === 0}
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Video
              </th>
              <th className="w-28 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Speed
              </th>
              <th className="w-24 px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                ETA
              </th>
              <th className="w-32 px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {downloads.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  No downloads in progress
                </td>
              </tr>
            ) : (
              downloads.map((download) => (
                <tr
                  key={download.url}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors',
                    download.deleting && 'opacity-50'
                  )}
                  data-testid={`queue-item-${download.status}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={download.checked || false}
                      onChange={() => toggleChecked('queue', download.url)}
                      className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <span
                        className="text-gray-900 dark:text-white font-medium truncate max-w-md"
                        title={download.title}
                      >
                        {download.title}
                      </span>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            download.status === 'preparing'
                              ? 'bg-gradient-to-r from-blue-400 to-blue-500 animate-pulse w-full'
                              : download.status === 'paused'
                                ? 'bg-amber-400'
                                : 'bg-gradient-to-r from-green-400 to-green-500'
                          )}
                          style={{
                            width:
                              download.status === 'preparing'
                                ? '100%'
                                : `${download.percent || 0}%`,
                          }}
                          data-testid="progress-bar"
                        />
                      </div>
                      {download.status === 'paused' && (
                        <span className="text-xs text-amber-600" data-testid="paused-label">
                          Paused {download.percent != null ? `· ${Math.round(download.percent)}%` : ''}
                        </span>
                      )}
                      {download.status !== 'preparing' && download.status !== 'paused' && (
                        <span className="text-xs text-gray-500 dark:text-gray-400" data-testid="progress-percent">
                          {Math.round(download.percent || 0)}%
                        </span>
                      )}
                      {download.status === 'preparing' && (
                        <span className="text-xs text-blue-500">Preparing...</span>
                      )}
                      {(download.msg || download.failure_reason) && (
                        <p
                          className="text-xs text-amber-600 dark:text-amber-400 break-words"
                          data-testid="queue-failure-reason"
                        >
                          {download.msg || download.failure_reason}
                          {typeof download.retry_count === 'number' && download.retry_count > 0
                            ? ` (retry ${download.retry_count}/${download.max_retries ?? 2})`
                            : ''}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-gray-400">
                        <span>{download.format}</span>
                        <span>·</span>
                        <span>{download.quality}</span>
                        {download.download_sections && (
                          <>
                            <span>·</span>
                            <span>clip {download.download_sections}</span>
                          </>
                        )}
                        {download.subtitle_langs && (
                          <>
                            <span>·</span>
                            <span>subs {download.subtitle_langs}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400" data-testid="progress-speed">
                    {download.status === 'paused' ? '—' : formatSpeed(download.speed)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400" data-testid="progress-eta">
                    {download.status === 'paused' ? '—' : formatEta(download.eta)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(download.status === 'pending' || download.status === 'paused') && (
                        <button
                          onClick={() => handleStartOne(download.url)}
                          className="p-1.5 text-gray-500 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Resume / start"
                          data-testid="resume-btn"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      {(download.status === 'downloading' || download.status === 'preparing') && (
                        <button
                          onClick={() => handlePauseOne(download.url)}
                          className="p-1.5 text-gray-500 hover:text-amber-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Pause"
                          data-testid="pause-btn"
                        >
                          <Pause className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteOne(download.url)}
                        className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Cancel"
                        data-testid="cancel-btn"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <a
                        href={download.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-500 hover:text-blue-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Open source"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
