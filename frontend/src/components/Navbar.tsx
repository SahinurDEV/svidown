'use client';

import { useDownloads } from '@/context/DownloadsContext';
import { formatSpeed } from '@/lib/utils';
import { Download, Clock, CheckCircle, XCircle, Gauge, Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getCookie, setCookie } from '@/lib/utils';

type ThemeMode = 'light' | 'dark' | 'auto';

export default function Navbar() {
  const { queue, done } = useDownloads();
  const [theme, setTheme] = useState<ThemeMode>('auto');

  const queueArray = Array.from(queue.values());
  const doneArray = Array.from(done.values());

  const activeDownloads = queueArray.filter(
    (d) => d.status === 'downloading' || d.status === 'preparing'
  ).length;
  const queuedDownloads = queueArray.filter((d) => d.status === 'pending').length;
  const completedDownloads = doneArray.filter((d) => d.status === 'finished').length;
  const failedDownloads = doneArray.filter((d) => d.status === 'error').length;
  const totalSpeed = queueArray
    .filter((d) => d.status === 'downloading')
    .reduce((sum, d) => sum + (d.speed || 0), 0);

  useEffect(() => {
    const savedTheme = getCookie('svidown_theme') as ThemeMode | null;
    if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      if (theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      } else {
        document.documentElement.classList.toggle('dark', theme === 'dark');
      }
    };

    applyTheme();
    setCookie('svidown_theme', theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') applyTheme();
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const cycleTheme = () => {
    const themes: ThemeMode[] = ['light', 'dark', 'auto'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-gray-800 dark:to-gray-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-tight">svidown</span>
              <span className="text-xs text-blue-200 hidden sm:block">1000+ sites supported</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-sm">
            {activeDownloads > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                <Download className="w-4 h-4 text-blue-300" />
                <span>{activeDownloads} downloading</span>
              </div>
            )}
            {queuedDownloads > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                <Clock className="w-4 h-4 text-yellow-300" />
                <span>{queuedDownloads} queued</span>
              </div>
            )}
            {completedDownloads > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                <CheckCircle className="w-4 h-4 text-green-300" />
                <span>{completedDownloads} completed</span>
              </div>
            )}
            {failedDownloads > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                <XCircle className="w-4 h-4 text-red-300" />
                <span>{failedDownloads} failed</span>
              </div>
            )}
            {totalSpeed > 0 && (
              <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
                <Gauge className="w-4 h-4 text-cyan-300" />
                <span>{formatSpeed(totalSpeed)}</span>
              </div>
            )}
          </div>

          <button
            onClick={cycleTheme}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
