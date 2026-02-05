import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { DownloadsProvider } from '@/context/DownloadsContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'svidown - Download Videos from 1000+ Sites',
  description: 'Download public videos from YouTube, Facebook, Instagram, TikTok, Twitter and 1000+ more websites',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-gray-100 dark:bg-gray-900 min-h-screen`}>
        <DownloadsProvider>{children}</DownloadsProvider>
      </body>
    </html>
  );
}
