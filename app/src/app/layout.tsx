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
  themeColor: '#0a0f1c',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* Pretendard Variable — 동적 서브셋(필요 글리프만 로드) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <Nav />
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-4 md:px-6 md:pb-12">{children}</div>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(e){console.warn('SW 등록 실패',e)})}`,
          }}
        />
      </body>
    </html>
  );
}
