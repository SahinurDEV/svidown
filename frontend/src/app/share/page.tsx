'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function firstUrl(...parts: (string | null)[]): string {
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(/https?:\/\/[^\s]+/i);
    if (m) return m[0];
    if (/^https?:\/\//i.test(p.trim())) return p.trim();
  }
  return '';
}

export default function ShareTargetPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = firstUrl(params.get('url'), params.get('text'), params.get('title'));
    if (shared) {
      router.replace('/?url=' + encodeURIComponent(shared));
    } else {
      router.replace('/');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-200">
      Opening shared link in svidown…
    </div>
  );
}
