// Google Calendar 양방향 동기화 (P5).
// - push: 앱에서 만든 일정(sync_status='pending_push') → Google primary 캘린더에 생성
// - pull: Google 일정(오늘~+60일) → calendar_events 캐시 갱신 (추가·수정·삭제 반영)
// 서버 전용 — service_role db()와 refresh_token을 다루므로 클라이언트 컴포넌트에서 import 금지.
import { config } from './config';
import { db } from './db';
import { cleanEventTitle, isDeadlineEvent } from './deadline';
import type { CalendarEvent } from './types';
import { kstToday } from './types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const PULL_DAYS = 60;
const SYNC_THROTTLE_MS = 60_000;

export type SyncResult = {
  connected: boolean;
  ok: boolean;
  pushed: number;
  pulled: number;
  deleted: number;
  error: string | null;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

// 람다 인스턴스 내 access_token 캐시 + 동기화 스로틀 (서버리스라 인스턴스별로만 유효)
const g = globalThis as unknown as {
  __gcalToken?: { token: string; expiresAt: number };
  __gcalLastSync?: number;
};

async function getRefreshToken(): Promise<string | null> {
  const { data, error } = await db().from('oauth_tokens').select('refresh_token').eq('provider', 'google').maybeSingle();
  if (error) throw new Error(`토큰 조회 실패: ${error.message}`);
  return data?.refresh_token ?? null;
}

async function getAccessToken(): Promise<string | null> {
  if (g.__gcalToken && g.__gcalToken.expiresAt > Date.now()) return g.__gcalToken.token;
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`access_token 갱신 실패: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  g.__gcalToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return json.access_token;
}

// DB 행 → Google 이벤트 본문 (종일은 date, 시간제는 dateTime+KST)
function toGoogleBody(e: Pick<CalendarEvent, 'title' | 'starts_at' | 'ends_at' | 'all_day'>) {
  if (e.all_day) {
    const startDate = new Date(new Date(e.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const endBase = e.ends_at ? new Date(new Date(e.ends_at).getTime() + 9 * 3600_000) : new Date(`${startDate}T00:00:00Z`);
    // Google 종일 일정의 end.date는 exclusive — 최소 시작일+1일
    const endDate = new Date(Math.max(endBase.getTime(), new Date(`${startDate}T00:00:00Z`).getTime()) + 86400_000)
      .toISOString().slice(0, 10);
    return { summary: e.title, start: { date: startDate }, end: { date: endDate } };
  }
  const ends = e.ends_at ?? new Date(new Date(e.starts_at).getTime() + 3600_000).toISOString();
  return {
    summary: e.title,
    start: { dateTime: e.starts_at, timeZone: 'Asia/Seoul' },
    end: { dateTime: ends, timeZone: 'Asia/Seoul' },
  };
}

// Google 이벤트 → DB 컬럼 (종일 end.date는 exclusive라 그대로 보관해도 뷰에는 무해)
function fromGoogle(ev: GoogleEvent) {
  const allDay = !!ev.start?.date;
  const startsAt = allDay ? new Date(`${ev.start!.date}T00:00:00+09:00`).toISOString() : ev.start!.dateTime!;
  const endsAt = allDay
    ? (ev.end?.date ? new Date(`${ev.end.date}T00:00:00+09:00`).toISOString() : null)
    : (ev.end?.dateTime ?? null);
  // 제목은 들어올 때 한 번 정리한다 — "🔴 마감 15:00 — 우리자산운용…" 의 앞머리는
  // 구글 달력에서 눈에 띄라고 붙인 표시지 읽을 내용이 아니다. 화면마다 따로 떼면
  // 반드시 어딘가 빠뜨린다(실제로 12곳에서 그리고 있었다). 시각은 starts_at 에 이미 있다.
  const raw = ev.summary ?? '';
  const clean = cleanEventTitle(raw).title;
  return {
    title: clean || '(제목 없음)',
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    // 마감인지도 여기서 정한다. 판별 규칙은 '마감'·'🔴' 같은 앞머리를 보고 판단하는데,
    // 그 앞머리는 방금 제목에서 뗐다. 원본이 살아 있는 건 이 순간뿐이라 여기서 판정해 저장한다.
    // (화면에서 다시 계산하려 들면 지워진 단서를 찾게 되고, 아무것도 마감으로 안 잡힌다)
    deadlineGuess: isDeadlineEvent({ title: raw, is_deadline: null }),
  };
}

async function pushPending(token: string): Promise<number> {
  const { data, error } = await db()
    .from('calendar_events').select('*').eq('sync_status', 'pending_push').eq('source', 'app');
  if (error) throw new Error(`밀어낼 일정 조회 실패: ${error.message}`);
  let pushed = 0;
  for (const e of (data as CalendarEvent[]) ?? []) {
    const res = await fetch(EVENTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(toGoogleBody(e)),
    });
    if (!res.ok) throw new Error(`Google 일정 생성 실패(${e.title}): ${res.status} ${(await res.text()).slice(0, 200)}`);
    const created = (await res.json()) as GoogleEvent;
    const { error: upErr } = await db()
      .from('calendar_events')
      .update({ google_event_id: created.id, sync_status: 'synced' })
      .eq('id', e.id);
    if (upErr) throw new Error(`동기화 상태 갱신 실패: ${upErr.message}`);
    pushed += 1;
  }
  return pushed;
}

async function pullWindow(token: string): Promise<{ pulled: number; deleted: number }> {
  const timeMin = new Date(`${kstToday()}T00:00:00+09:00`).toISOString();
  const timeMax = new Date(Date.now() + PULL_DAYS * 86400_000).toISOString();

  // Google 쪽 이벤트 전체 수집 (페이지네이션)
  const googleEvents: GoogleEvent[] = [];
  let pageToken: string | null = null;
  do {
    const url = new URL(EVENTS_URL);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Google 일정 조회 실패: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    googleEvents.push(...(json.items ?? []).filter((ev) => ev.status !== 'cancelled' && ev.start));
    pageToken = json.nextPageToken ?? null;
  } while (pageToken);

  // 기존 캐시를 한 번에 읽어 source 보존 + 삭제 대상 판별에 쓴다 (이벤트별 왕복 금지)
  const { data: cached, error: cacheErr } = await db()
    .from('calendar_events').select('id,google_event_id,source,starts_at').not('google_event_id', 'is', null);
  if (cacheErr) throw new Error(`캐시 조회 실패: ${cacheErr.message}`);
  const cachedRows = (cached as Pick<CalendarEvent, 'id' | 'google_event_id' | 'source' | 'starts_at'>[]) ?? [];
  const sourceByGid = new Map(cachedRows.map((c) => [c.google_event_id!, c.source]));

  // 앱에서 밀어올린 일정(google_event_id 보유)도 Google 쪽 수정을 이 upsert로 되받는다
  const parsed = googleEvents.map((ev) => {
    const { deadlineGuess, ...cols } = fromGoogle(ev);
    return {
      gid: ev.id,
      deadlineGuess,
      row: { google_event_id: ev.id, ...cols, source: sourceByGid.get(ev.id) ?? 'google', sync_status: 'synced' },
    };
  });
  if (parsed.length > 0) {
    const { error } = await db()
      .from('calendar_events').upsert(parsed.map((p) => p.row), { onConflict: 'google_event_id' });
    if (error) throw new Error(`일정 캐시 갱신 실패: ${error.message}`);

    // 마감 판정은 '아직 아무도 안 정한 것'만 채운다.
    // 사용자가 ⚙ 로 직접 뒤집어 둔 값을 동기화가 매번 되돌리면 그 스위치가 무용지물이 된다.
    for (const want of [true, false]) {
      const ids = parsed.filter((p) => p.deadlineGuess === want).map((p) => p.gid);
      if (ids.length === 0) continue;
      const { error: gErr } = await db()
        .from('calendar_events').update({ is_deadline: want })
        .in('google_event_id', ids).is('is_deadline', null);
      if (gErr) throw new Error(`마감 판정 저장 실패: ${gErr.message}`);
    }
  }

  // 창(window) 안에 있는데 Google에서 사라진 일정 = 삭제된 것 → 캐시에서도 제거
  const seen = new Set(googleEvents.map((ev) => ev.id));
  const [minT, maxT] = [new Date(timeMin).getTime(), new Date(timeMax).getTime()];
  const stale = cachedRows.filter((c) => {
    if (!c.google_event_id || seen.has(c.google_event_id)) return false;
    const t = new Date(c.starts_at).getTime();
    return t >= minT && t <= maxT;
  });
  if (stale.length > 0) {
    const { error } = await db().from('calendar_events').delete().in('id', stale.map((c) => c.id));
    if (error) throw new Error(`삭제 반영 실패: ${error.message}`);
  }
  return { pulled: parsed.length, deleted: stale.length };
}

// 앱에서 지운 일정을 Google에도 반영 (없어진 일정 404는 성공으로 간주)
export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google 일정 삭제 실패: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// 전체 동기화. force=false면 인스턴스당 1분 스로틀 (페이지 로드마다 API 왕복 방지)
export async function syncCalendar(force = false): Promise<SyncResult> {
  const base: SyncResult = { connected: false, ok: false, pushed: 0, pulled: 0, deleted: 0, error: null };
  try {
    if (!config.google.clientId || !config.google.clientSecret) {
      return { ...base, error: 'Google 크리덴셜 미설정' };
    }
    const token = await getAccessToken();
    if (!token) return { ...base, error: 'Google 계정 미연결 — 로그인 1회 필요' };

    if (!force && g.__gcalLastSync && Date.now() - g.__gcalLastSync < SYNC_THROTTLE_MS) {
      return { ...base, connected: true, ok: true };
    }
    const pushed = await pushPending(token);
    const { pulled, deleted } = await pullWindow(token);
    g.__gcalLastSync = Date.now();
    return { connected: true, ok: true, pushed, pulled, deleted, error: null };
  } catch (e) {
    console.error('[gcal-sync]', e);
    return { ...base, connected: true, error: e instanceof Error ? e.message : String(e) };
  }
}
