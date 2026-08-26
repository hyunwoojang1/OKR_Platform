// 무료 LLM 호출 유틸 — Finance_Platform 의 chat.ts/ollama client 축소 이식판.
// 1순위: 로컬 Ollama(무료·키 불필요, PC에서 실행 중일 때). 2순위: Groq 무료 티어(GROQ_API_KEY 있을 때만).
// 서버 전용 — 클라이언트 컴포넌트에서 import 금지.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResult {
  content: string;
  engine: 'ollama' | 'groq';
  model: string;
}

const OLLAMA_DEFAULT_BASE = 'http://localhost:11434';
const OLLAMA_DEFAULT_MODEL = 'exaone3.5:7.8b';
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const MAX_RESPONSE_BYTES = 1_000_000;

// SSRF 가드: Ollama base URL 은 로컬 호스트만 허용.
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function assertLocalOllamaUrl(baseUrl: string): void {
  const { hostname, protocol } = new URL(baseUrl);
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`OLLAMA_BASE_URL 스킴 비허용(http/https만): ${protocol}`);
  }
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`OLLAMA_BASE_URL 호스트 비허용(로컬만 가능): ${hostname}`);
  }
}

async function ollamaChat(messages: readonly ChatMessage[], timeoutMs: number): Promise<LlmResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? OLLAMA_DEFAULT_BASE;
  const model = process.env.OLLAMA_MODEL ?? OLLAMA_DEFAULT_MODEL;
  assertLocalOllamaUrl(baseUrl);

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.4 }, messages }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('Ollama 응답 과대');
  const data = JSON.parse(text) as { message?: { content?: string } };
  return { content: data?.message?.content ?? '', engine: 'ollama', model };
}

async function groqChat(messages: readonly ChatMessage[], timeoutMs: number, apiKey: string): Promise<LlmResult> {
  const model = process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, messages, temperature: 0.4, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { content: data?.choices?.[0]?.message?.content ?? '', engine: 'groq', model };
}

/**
 * JSON 응답을 기대하는 채팅 완성 — Groq 먼저, 키가 없거나 실패하면 로컬 Ollama.
 *
 * Groq이 1순위인 이유: 앱은 Vercel에서 돌기 때문에 localhost:11434(내 PC의 Ollama)에
 * 닿을 수가 없다. Ollama를 먼저 시도하면 배포 환경에서는 매번 타임아웃을 기다렸다가
 * 넘어가야 하고, PC가 꺼져 있으면 폰에서 AI 기능이 통째로 죽는다.
 * Ollama는 이제 키가 없거나 Groq이 막혔을 때의 뒷문으로만 쓴다.
 */
export async function chatCompleteJson(messages: readonly ChatMessage[], timeoutMs = 60_000): Promise<LlmResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      return await groqChat(messages, timeoutMs, groqKey);
    } catch (groqError) {
      try {
        return await ollamaChat(messages, timeoutMs);
      } catch {
        throw groqError; // 뒷문도 막혔으면 원래 실패 이유를 보여준다
      }
    }
  }
  return await ollamaChat(messages, timeoutMs);
}
