import type { Metadata, Viewport } from 'next';
import Nav from './Nav';
import './globals.css';

export const metadata: Metadata = {
  title: '목표 허브',
  description: '캘린더 · OKR · 습관 · 아침 브리핑을 한 곳에서',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '목표 허브' },
};

export const viewport: Viewport = {
  themeColor: '#faf8f3',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* v4: IBM Plex Sans KR(문장) + IBM Plex Mono(날짜·수치·기록) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <Nav />
        <div className="mx-auto max-w-[1440px] px-5 pb-28 pt-4 md:px-8 md:pb-12">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(e){console.warn('SW 등록 실패',e)})}`,
          }}
        />
      </body>
    </html>
  );
}
