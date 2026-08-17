import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '목표 허브',
  description: '캘린더 · OKR · 습관 · 아침 브리핑을 한 곳에서',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '목표 허브' },
};

export const viewport: Viewport = {
  themeColor: '#fafaf9',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const NAV = [
  { href: '/', label: '오늘', icon: '☀️' },
  { href: '/okr', label: '목표', icon: '🎯' },
  { href: '/habits', label: '습관', icon: '🔥' },
  { href: '/calendar', label: '일정', icon: '📅' },
  { href: '/close', label: '마감', icon: '🌙' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-[var(--surface)] text-[var(--ink)] antialiased">
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</div>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-[var(--surface-raised)]/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-3xl items-stretch justify-around">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] opacity-70 transition hover:opacity-100">
                <span aria-hidden className="text-lg leading-none">{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
