'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

// v4: 아이콘은 절제 — 홈(문), 목표(과녁), 달력(캘린더)
const ICONS: Record<string, (active: boolean) => React.ReactNode> = {
  today: (a) => (
    <svg viewBox="0 0 24 24" {...S} fill={a ? 'currentColor' : 'none'}>
      <path d="M4.5 10.2 12 4l7.5 6.2V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19v-8.8Z" />
    </svg>
  ),
  okr: (a) => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="1.4" fill={a ? 'currentColor' : 'none'} />
    </svg>
  ),
  calendar: (a) => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.6h17M8 2.8v3.4M16 2.8v3.4" />
      {a && <rect x="7" y="12.5" width="4" height="4" rx="1" fill="currentColor" stroke="none" />}
    </svg>
  ),
};

const NAV = [
  { href: '/', label: '홈', icon: 'today' },
  { href: '/okr', label: '목표', icon: 'okr' },
  { href: '/calendar', label: '달력', icon: 'calendar' },
];

function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <>
      {/* 데스크톱: 상단 네비 */}
      <header className="topnav hidden md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-medium text-white" style={{ background: 'var(--accent)' }}>G</span>
            목표 허브
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`topnav-link ${isActive(n.href, pathname) ? 'active' : ''}`}>
                {n.label}
              </Link>
            ))}
            <Link href="/settings" aria-label="설정" className={`topnav-link ${pathname.startsWith('/settings') ? 'active' : ''}`}>⚙</Link>
          </nav>
        </div>
      </header>
      {/* 모바일: 하단 탭바 */}
      <nav className="tabbar md:hidden" aria-label="주 탐색">
        <div className="mx-auto flex max-w-3xl items-stretch">
          {NAV.map((n) => {
            const active = isActive(n.href, pathname);
            return (
              <Link key={n.href} href={n.href} className={`tab ${active ? 'active' : ''}`}>
                {ICONS[n.icon](active)}
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
