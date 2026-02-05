'use client';

import { useEffect, useState } from 'react';
import { useDownloads } from '@/context/DownloadsContext';
import { getApiBaseUrl } from '@/lib/utils';
import { Globe, Shield, Video } from 'lucide-react';

export default function Footer() {
  const { ytdlOptionsUpdateTime } = useDownloads();
  const [ytDlpVersion, setYtDlpVersion] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/version`);
        const data = await response.json();
        setYtDlpVersion(data['yt-dlp']);
        setAppVersion(data.version);
      } catch {
        // Ignore errors
      }
    };

    fetchVersion();
  }, []);

  return (
    <footer className="bg-gray-800 dark:bg-gray-900 text-gray-400 py-6 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4">
          {/* Version info */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            {appVersion && (
              <>
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-500">svidown</span>
                  <span className="text-white font-medium">{appVersion}</span>
                </div>
                <span className="text-gray-600">|</span>
              </>
            )}
            {ytDlpVersion && (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">yt-dlp</span>
                  <span className="text-white font-medium">{ytDlpVersion}</span>
                </div>
              </>
            )}
            {ytdlOptionsUpdateTime && (
              <>
                <span className="text-gray-600">|</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Config updated</span>
                  <span className="text-white font-medium">{ytdlOptionsUpdateTime}</span>
                </div>
              </>
            )}
          </div>

          {/* Platform support notice */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>1000+ websites supported</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Public videos only</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
