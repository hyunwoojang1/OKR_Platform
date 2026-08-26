// 프로그래머스 문제 페이지에서 제목·난이도를 긁고, 문제 설명으로 유형을 분류한다.
// 사용자는 링크만 붙여넣고, 나머지는 여기서 채운다.

/** 노션 「푼 문제」 DB의 유형 옵션 — AI에게도 이 목록 안에서만 고르게 한다. */
export const CODING_TAGS = [
  '구현', '그리디', 'DP', 'DFS/BFS', '이분탐색', '정렬',
  '해시', '스택/큐', '그래프', '문자열', '수학', 'SQL',
] as const;

const LESSON_URL = /school\.programmers\.co\.kr\/learn\/courses\/\d+\/lessons\/(\d+)/;

export function isProgrammersUrl(url: string): boolean {
  return LESSON_URL.test(url);
}

export type ProblemInfo = { title: string; level: number | null; description: string };

/** 문제 페이지 파싱. 로그인 없이 열리는 공개 페이지라 HTML만 보면 된다. */
export async function fetchProgrammersProblem(url: string): Promise<ProblemInfo | null> {
  if (!isProgrammersUrl(url)) return null;
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (goal-hub personal tracker)' },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const html = await res.text();

  // 제목: data-lesson-title 속성이 가장 정확하고, 없으면 <title>에서 잘라낸다.
  const byAttr = /data-lesson-title="([^"]+)"/.exec(html)?.[1];
  const byTitle = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1]?.replace(/^코딩테스트 연습\s*-\s*/, '').replace(/\s*\|[\s\S]*$/, '');
  const title = (byAttr ?? byTitle ?? '').trim();
  if (!title) return null;

  // 난이도: 페이지 JSON에 level":3 형태로 들어 있다(HTML 이스케이프됨).
  const lv = /level(?:&quot;|")\s*:\s*(\d)/.exec(html)?.[1];
  const level = lv ? Number(lv) : null;

  // 문제 설명: 태그를 걷어내고 앞부분만 — 유형 분류에는 이 정도면 충분하다.
  const raw = /문제 설명([\s\S]{0,3000})/.exec(html)?.[1] ?? '';
  const description = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200);

  return { title, level, description };
}

/** 문제 설명을 보고 유형을 고른다. AI가 죽어 있으면 키워드 휴리스틱으로 떨어진다. */
export async function classifyProblem(title: string, description: string): Promise<string[]> {
  try {
    const { chatCompleteJson } = await import('./llm');
    const { content } = await chatCompleteJson(
      [
        {
          role: 'system',
          content:
            '너는 알고리즘 문제 분류기다. 반드시 JSON 객체 하나만 출력한다. ' +
            `형식: {"tags":["유형1","유형2"]}. 유형은 반드시 다음 중에서만 고른다: ${CODING_TAGS.join(', ')}. ` +
            '1~2개만 고른다. 가장 핵심적인 풀이 기법을 우선한다.',
        },
        { role: 'user', content: `문제: ${title}\n설명: ${description}` },
      ],
      20_000,
    );
    const parsed = JSON.parse(content) as { tags?: unknown };
    const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
      .map((t) => String(t).trim())
      .filter((t): t is string => (CODING_TAGS as readonly string[]).includes(t))
      .slice(0, 2);
    if (tags.length > 0) return tags;
  } catch {
    // AI 실패 → 아래 휴리스틱
  }
  return heuristicTags(`${title} ${description}`);
}

/** AI 없이도 최소한은 맞춘다. 못 고르면 '구현'. */
function heuristicTags(text: string): string[] {
  const rules: [RegExp, string][] = [
    [/다이나믹|동적 계획|점화식/i, 'DP'],
    [/그래프|정점|간선|노드|인접/i, '그래프'],
    [/최단 ?거리|너비 우선|깊이 우선|BFS|DFS|탐색해/i, 'DFS/BFS'],
    [/이분 ?탐색|이진 ?탐색|binary search/i, '이분탐색'],
    [/정렬해|오름차순|내림차순|sort/i, '정렬'],
    [/해시|딕셔너리|map |중복.*제거/i, '해시'],
    [/스택|큐|괄호|프린터/i, '스택/큐'],
    [/문자열|부분 ?문자열|알파벳/i, '문자열'],
    [/최대공약수|소수|약수|나머지|모듈러/i, '수학'],
    [/SELECT|FROM|테이블에서/i, 'SQL'],
    [/최소 ?비용|가장 ?많은|최적|욕심/i, '그리디'],
  ];
  const hit = rules.filter(([re]) => re.test(text)).map(([, tag]) => tag).slice(0, 2);
  return hit.length > 0 ? hit : ['구현'];
}
