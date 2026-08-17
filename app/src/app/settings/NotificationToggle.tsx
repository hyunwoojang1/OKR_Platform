'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = 'unsupported' | 'idle' | 'subscribed' | 'denied' | 'working';

export default function NotificationToggle() {
  const [state, setState] = useState<State>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('denied');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? 'subscribed' : 'idle');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setState('working');
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }
      const { publicKey } = await fetch('/api/push/subscribe').then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('서버 저장 실패');
      setState('subscribed');
      setMessage('알림이 켜졌어요. 아침 7시·저녁 9시에 만나요!');
    } catch (e) {
      setState('idle');
      setMessage(`실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('idle');
      setMessage('알림을 껐어요.');
    } catch {
      setState('subscribed');
      setMessage('해제 실패 — 다시 시도해주세요.');
    }
  }

  async function sendTest() {
    setMessage('발송 중…');
    const r = await fetch('/api/push/test', { method: 'POST' }).then((r) => r.json());
    setMessage(r.error ? `실패: ${r.error}` : `발송 완료 (성공 ${r.sent} · 실패 ${r.failed})`);
  }

  return (
    <div className="space-y-2">
      {state === 'unsupported' && <p className="text-sm opacity-60">이 브라우저는 푸시를 지원하지 않아요. (iOS는 홈화면에 추가한 뒤 앱에서 켜야 해요)</p>}
      {state === 'denied' && <p className="text-sm text-red-500">알림 권한이 차단돼 있어요. 브라우저 설정에서 허용으로 바꿔주세요.</p>}
      {state === 'idle' && (
        <button onClick={enable} className="w-full rounded-xl border border-[var(--line)] py-2.5 text-sm font-medium">
          🔔 알림 켜기
        </button>
      )}
      {state === 'subscribed' && (
        <div className="flex gap-2">
          <button onClick={sendTest} className="flex-1 rounded-xl border border-[var(--line)] py-2.5 text-sm">테스트 알림 보내기</button>
          <button onClick={disable} className="rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm opacity-60">끄기</button>
        </div>
      )}
      {state === 'working' && <p className="text-sm opacity-50">처리 중…</p>}
      {message && <p className="text-xs opacity-70">{message}</p>}
    </div>
  );
}
