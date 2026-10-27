import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { DownloadsProvider } from '@/context/DownloadsContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'svidown - Download Videos from 1000+ Sites',
  description:
    'Download public videos from YouTube, Facebook, Instagram, TikTok, Twitter and 1000+ more websites',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icon-192.png',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'svidown',
    statusBarStyle: 'default',
  },
  applicationName: 'svidown',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-gray-100 dark:bg-gray-900 min-h-screen overflow-x-hidden`}
      >
        <DownloadsProvider>{children}</DownloadsProvider>
      </body>
    </html>
  );
}
