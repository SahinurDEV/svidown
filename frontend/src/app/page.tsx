'use client';

import { useDownloads } from '@/context/DownloadsContext';
import {
  Navbar,
  AddDownloadForm,
  DownloadQueue,
  CompletedDownloads,
  Footer,
  YtDlpBanner,
} from '@/components';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { loading } = useDownloads();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Connecting to server...</span>
            </div>
          </div>
        ) : (
          <>
            <YtDlpBanner />
            <AddDownloadForm />
            <DownloadQueue />
            <CompletedDownloads />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
