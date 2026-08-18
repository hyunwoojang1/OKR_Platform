'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 탭바 아이콘: 이모지 대신 SVG 스트로크 (활성 시 fill 전환)
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const ICONS: Record<string, (active: boolean) => React.ReactNode> = {
  today: (a) => (
    <svg viewBox="0 0 24 24" {...S} fill={a ? 'currentColor' : 'none'}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
    </svg>
  ),
  hub: (a) => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="2.6" fill={a ? 'currentColor' : 'none'} />
      <circle cx="4.8" cy="6" r="2.1" /><circle cx="19.2" cy="6" r="2.1" /><circle cx="12" cy="20" r="2.1" />
      <path d="M6.6 7.3 10 10.4M17.4 7.3 14 10.4M12 14.7v3.2" />
    </svg>
  ),
  okr: (a) => (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.6" fill={a ? 'currentColor' : 'none'} />
    </svg>
  ),
  habits: (a) => (
    <svg viewBox="0 0 24 24" {...S} fill={a ? 'currentColor' : 'none'}>
      <path d="M12 2.8c.6 3-1.4 4.3-2.6 6C8.1 10.6 7 12.3 7 14.5a5 5 0 0 0 10 0c0-1.6-.6-3-1.5-4.2-.4 1-1 1.8-2 2.3.3-2.8-.4-6.9-1.5-9.8Z" />
    </svg>
  ),
  calendar: (a) => (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.6h17M8 2.8v3.4M16 2.8v3.4" />
      {a && <rect x="7" y="12.5" width="4" height="4" rx="1" fill="currentColor" stroke="none" />}
    </svg>
  ),
  close: (a) => (
    <svg viewBox="0 0 24 24" {...S} fill={a ? 'currentColor' : 'none'}>
      <path d="M20 13.2A8.3 8.3 0 1 1 10.8 4a6.6 6.6 0 0 0 9.2 9.2Z" />
    </svg>
  ),
};

const NAV = [
  { href: '/', label: '오늘', icon: 'today' },
  { href: '/hub', label: '허브', icon: 'hub' },
  { href: '/okr', label: '목표', icon: 'okr' },
  { href: '/habits', label: '습관', icon: 'habits' },
  { href: '/calendar', label: '일정', icon: 'calendar' },
  { href: '/close', label: '마감', icon: 'close' },
];

export default function Nav() {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <nav className="tabbar" aria-label="주 탐색">
      <div className="mx-auto flex max-w-3xl items-stretch">
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`tab ${active ? 'active' : ''}`}>
              {ICONS[n.icon](active)}
              {n.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
