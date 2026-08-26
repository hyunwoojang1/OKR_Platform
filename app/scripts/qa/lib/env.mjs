import fs from 'node:fs';
import path from 'node:path';

/**
 * .env.local 을 직접 읽는다.
 * `node --env-file` 에 기대지 않는 이유: 이 하네스는 npm script 로도, 손으로도, 훅에서도
 * 불릴 수 있고 그때마다 플래그가 붙는다는 보장이 없다. 못 읽으면 여기서 바로 멈춘다.
 */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`${file} 을 못 찾았습니다. app/ 디렉토리에서 실행하세요.`);
  }
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return out;
}

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const fileEnv = loadEnvFile(path.join(APP_DIR, '.env.local'));

/** 환경변수 우선, 없으면 .env.local. */
function pick(name) {
  return process.env[name] ?? fileEnv[name] ?? '';
}

export const env = {
  appDir: APP_DIR,
  supabaseUrl: pick('SUPABASE_URL'),
  supabaseKey: pick('SUPABASE_SECRET_KEY'),
  devGateToken: pick('DEV_GATE_TOKEN'),
  baseUrl: (process.env.QA_BASE_URL || 'http://localhost:3007').replace(/\/$/, ''),
  allowRemote: process.env.QA_ALLOW_REMOTE === '1',
};

for (const key of ['supabaseUrl', 'supabaseKey']) {
  if (!env[key]) throw new Error(`.env.local 에 ${key === 'supabaseUrl' ? 'SUPABASE_URL' : 'SUPABASE_SECRET_KEY'} 이 없습니다.`);
}
