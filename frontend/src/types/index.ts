export interface Download {
  id: string;
  title: string;
  url: string;
  quality: string;
  format: string;
  folder: string;
  custom_name_prefix: string;
  playlist_item_limit: number;
  split_by_chapters?: boolean;
  chapter_template?: string;
  speed_limit?: number;
  status: 'pending' | 'preparing' | 'downloading' | 'finished' | 'error';
  msg: string;
  percent: number;
  speed: number;
  eta: number;
  filename: string;
  checked?: boolean;
  size?: number;
  error?: string;
  failure_reason?: string;
  retry_count?: number;
  max_retries?: number;
  deleting?: boolean;
  chapter_files?: Array<{ filename: string; size: number }>;
}

export interface SpeedLimitOption {
  id: string;
  label: string;
  value: number | null; // null = unlimited, number = bytes per second
}

export interface Quality {
  id: string;
  text: string;
}

export interface Format {
  id: string;
  text: string;
  qualities: Quality[];
}

export interface Theme {
  id: 'light' | 'dark' | 'auto';
  displayName: string;
}

export interface Status {
  status: 'ok' | 'error';
  msg?: string;
}

export interface Configuration {
  CUSTOM_DIRS: boolean;
  CREATE_CUSTOM_DIRS: boolean;
  PUBLIC_HOST_URL: string;
  PUBLIC_HOST_AUDIO_URL: string;
  OUTPUT_TEMPLATE_CHAPTER: string;
  DEFAULT_OPTION_PLAYLIST_ITEM_LIMIT: number;
  [key: string]: unknown;
}

export interface CustomDirs {
  download_dir: string[];
  audio_download_dir: string[];
}

export interface YtdlOptionsUpdate {
  success: boolean;
  msg?: string;
  update_time?: number;
}

export interface ChannelEntry {
  id: string;
  title: string;
  url: string;
  duration?: number;
  thumbnail?: string;
}

export interface ChannelResult {
  status: 'ok' | 'error';
  title?: string;
  channel?: string;
  entries?: ChannelEntry[];
  msg?: string;
}

export type State = 'queue' | 'done';
