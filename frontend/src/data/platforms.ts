export interface Platform {
  id: string;
  name: string;
  icon: string;
  color: string;
  patterns: RegExp[];
}

export const Platforms: Platform[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '▶',
    color: 'text-red-500',
    patterns: [
      /(?:youtube\.com|youtu\.be)/i,
      /youtube\.com\/(?:watch|playlist|channel|c|user|shorts)/i,
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: '𝐟',
    color: 'text-blue-600',
    patterns: [
      /(?:facebook\.com|fb\.watch|fb\.com)/i,
    ],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📷',
    color: 'text-pink-500',
    patterns: [
      /instagram\.com/i,
    ],
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: '𝕏',
    color: 'text-gray-800 dark:text-white',
    patterns: [
      /(?:twitter\.com|x\.com)/i,
    ],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '♪',
    color: 'text-black dark:text-white',
    patterns: [
      /tiktok\.com/i,
    ],
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    icon: '▷',
    color: 'text-cyan-500',
    patterns: [
      /vimeo\.com/i,
    ],
  },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    icon: '◐',
    color: 'text-blue-400',
    patterns: [
      /dailymotion\.com/i,
    ],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: '🎮',
    color: 'text-purple-500',
    patterns: [
      /twitch\.tv/i,
    ],
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: '🔴',
    color: 'text-orange-500',
    patterns: [
      /reddit\.com/i,
    ],
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: '☁',
    color: 'text-orange-400',
    patterns: [
      /soundcloud\.com/i,
    ],
  },
];

export function detectPlatform(url: string): Platform | null {
  if (!url) return null;

  for (const platform of Platforms) {
    for (const pattern of platform.patterns) {
      if (pattern.test(url)) {
        return platform;
      }
    }
  }

  // Check if it looks like a valid URL
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
      return {
        id: 'other',
        name: 'Supported Site',
        icon: '🌐',
        color: 'text-green-500',
        patterns: [],
      };
    }
  } catch {
    // Not a valid URL
  }

  return null;
}

export const FeaturedPlatforms = [
  { name: 'YouTube', icon: '▶' },
  { name: 'Facebook', icon: '𝐟' },
  { name: 'Instagram', icon: '📷' },
  { name: 'TikTok', icon: '♪' },
  { name: 'Twitter', icon: '𝕏' },
  { name: 'Vimeo', icon: '▷' },
];
