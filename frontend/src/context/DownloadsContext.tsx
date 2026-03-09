'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Download, Configuration, CustomDirs, Status, State, YtdlOptionsUpdate, ChannelResult } from '@/types';
import { getApiBaseUrl } from '@/lib/utils';

interface DownloadsContextType {
  queue: Map<string, Download>;
  done: Map<string, Download>;
  loading: boolean;
  configuration: Configuration;
  customDirs: CustomDirs;
  ytdlOptionsUpdateTime: string | null;
  addDownload: (
    url: string,
    quality: string,
    format: string,
    folder?: string,
    customNamePrefix?: string,
    playlistItemLimit?: number,
    autoStart?: boolean,
    splitByChapters?: boolean,
    chapterTemplate?: string,
    speedLimit?: number | null
  ) => Promise<Status>;
  deleteDownloads: (where: State, ids: string[]) => Promise<void>;
  startDownloads: (ids: string[]) => Promise<void>;
  extractChannel: (url: string, limit?: number) => Promise<ChannelResult>;
  toggleChecked: (where: State, id: string) => void;
  setAllChecked: (where: State, checked: boolean) => void;
}

const DownloadsContext = createContext<DownloadsContextType | null>(null);

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Map<string, Download>>(new Map());
  const [done, setDone] = useState<Map<string, Download>>(new Map());
  const [loading, setLoading] = useState(true);
  const [configuration, setConfiguration] = useState<Configuration>({
    CUSTOM_DIRS: true,
    CREATE_CUSTOM_DIRS: true,
    PUBLIC_HOST_URL: 'download/',
    PUBLIC_HOST_AUDIO_URL: 'audio_download/',
    OUTPUT_TEMPLATE_CHAPTER: '%(title)s - %(section_number)02d - %(section_title)s.%(ext)s',
    DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT: 0,
  });
  const [customDirs, setCustomDirs] = useState<CustomDirs>({
    download_dir: [],
    audio_download_dir: [],
  });
  const [ytdlOptionsUpdateTime, setYtdlOptionsUpdateTime] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    const socket = io(baseUrl, {
      transports: ['websocket', 'polling'],
      path: '/socket.io',
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('all', (strdata: string) => {
      setLoading(false);
      const data: [[[string, Download]], [[string, Download]]] = JSON.parse(strdata);
      const newQueue = new Map<string, Download>();
      data[0].forEach((entry) => newQueue.set(entry[0], entry[1]));
      const newDone = new Map<string, Download>();
      data[1].forEach((entry) => newDone.set(entry[0], entry[1]));
      setQueue(newQueue);
      setDone(newDone);
    });

    socket.on('added', (strdata: string) => {
      const data: Download = JSON.parse(strdata);
      setQueue((prev) => {
        const newQueue = new Map(prev);
        newQueue.set(data.url, data);
        return newQueue;
      });
    });

    socket.on('updated', (strdata: string) => {
      const data: Download = JSON.parse(strdata);
      setQueue((prev) => {
        const newQueue = new Map(prev);
        const existing = newQueue.get(data.url);
        if (existing) {
          data.checked = existing.checked;
          data.deleting = existing.deleting;
        }
        newQueue.set(data.url, data);
        return newQueue;
      });
    });

    socket.on('completed', (strdata: string) => {
      const data: Download = JSON.parse(strdata);
      setQueue((prev) => {
        const newQueue = new Map(prev);
        newQueue.delete(data.url);
        return newQueue;
      });
      setDone((prev) => {
        const newDone = new Map(prev);
        newDone.set(data.url, data);
        return newDone;
      });
    });

    socket.on('canceled', (strdata: string) => {
      const id: string = JSON.parse(strdata);
      setQueue((prev) => {
        const newQueue = new Map(prev);
        newQueue.delete(id);
        return newQueue;
      });
    });

    socket.on('cleared', (strdata: string) => {
      const id: string = JSON.parse(strdata);
      setDone((prev) => {
        const newDone = new Map(prev);
        newDone.delete(id);
        return newDone;
      });
    });

    socket.on('configuration', (strdata: string) => {
      const data = JSON.parse(strdata);
      setConfiguration(data);
    });

    socket.on('custom_dirs', (strdata: string) => {
      const data = JSON.parse(strdata);
      setCustomDirs(data);
    });

    socket.on('ytdl_options_changed', (strdata: string) => {
      const data: YtdlOptionsUpdate = JSON.parse(strdata);
      if (data.success && data.update_time) {
        const date = new Date(data.update_time * 1000);
        setYtdlOptionsUpdateTime(date.toLocaleString());
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const addDownload = useCallback(
    async (
      url: string,
      quality: string,
      format: string,
      folder?: string,
      customNamePrefix?: string,
      playlistItemLimit?: number,
      autoStart: boolean = true,
      splitByChapters: boolean = false,
      chapterTemplate?: string,
      speedLimit?: number | null
    ): Promise<Status> => {
      const baseUrl = getApiBaseUrl();
      try {
        const response = await fetch(`${baseUrl}/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            quality,
            format,
            folder: folder || undefined,
            custom_name_prefix: customNamePrefix || '',
            playlist_item_limit: playlistItemLimit || 0,
            auto_start: autoStart,
            split_by_chapters: splitByChapters,
            chapter_template: chapterTemplate || configuration.OUTPUT_TEMPLATE_CHAPTER,
            speed_limit: speedLimit || undefined,
          }),
        });
        const data = await response.json();
        return data;
      } catch (error) {
        return { status: 'error', msg: String(error) };
      }
    },
    [configuration.OUTPUT_TEMPLATE_CHAPTER]
  );

  const deleteDownloads = useCallback(async (where: State, ids: string[]): Promise<void> => {
    // Mark as deleting
    if (where === 'queue') {
      setQueue((prev) => {
        const newQueue = new Map(prev);
        ids.forEach((id) => {
          const dl = newQueue.get(id);
          if (dl) {
            newQueue.set(id, { ...dl, deleting: true });
          }
        });
        return newQueue;
      });
    } else {
      setDone((prev) => {
        const newDone = new Map(prev);
        ids.forEach((id) => {
          const dl = newDone.get(id);
          if (dl) {
            newDone.set(id, { ...dl, deleting: true });
          }
        });
        return newDone;
      });
    }

    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ where, ids }),
    });
  }, []);

  const startDownloads = useCallback(async (ids: string[]): Promise<void> => {
    const baseUrl = getApiBaseUrl();
    await fetch(`${baseUrl}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  }, []);

  const extractChannel = useCallback(
    async (url: string, limit?: number): Promise<ChannelResult> => {
      const baseUrl = getApiBaseUrl();
      try {
        const response = await fetch(`${baseUrl}/extract-channel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, limit: limit || 0 }),
        });
        return await response.json();
      } catch (error) {
        return { status: 'error', msg: String(error) };
      }
    },
    []
  );

  const toggleChecked = useCallback((where: State, id: string) => {
    if (where === 'queue') {
      setQueue((prev) => {
        const newQueue = new Map(prev);
        const dl = newQueue.get(id);
        if (dl) {
          newQueue.set(id, { ...dl, checked: !dl.checked });
        }
        return newQueue;
      });
    } else {
      setDone((prev) => {
        const newDone = new Map(prev);
        const dl = newDone.get(id);
        if (dl) {
          newDone.set(id, { ...dl, checked: !dl.checked });
        }
        return newDone;
      });
    }
  }, []);

  const setAllChecked = useCallback((where: State, checked: boolean) => {
    if (where === 'queue') {
      setQueue((prev) => {
        const newQueue = new Map(prev);
        newQueue.forEach((dl, key) => {
          newQueue.set(key, { ...dl, checked });
        });
        return newQueue;
      });
    } else {
      setDone((prev) => {
        const newDone = new Map(prev);
        newDone.forEach((dl, key) => {
          newDone.set(key, { ...dl, checked });
        });
        return newDone;
      });
    }
  }, []);

  return (
    <DownloadsContext.Provider
      value={{
        queue,
        done,
        loading,
        configuration,
        customDirs,
        ytdlOptionsUpdateTime,
        addDownload,
        extractChannel,
        deleteDownloads,
        startDownloads,
        toggleChecked,
        setAllChecked,
      }}
    >
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadsContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadsProvider');
  }
  return context;
}
