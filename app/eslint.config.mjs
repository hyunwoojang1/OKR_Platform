import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import checkedDbWrite from "./eslint-rules/checked-db-write.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 결과를 안 보는 db() 쓰기 금지 — 규칙 파일 상단에 사고 경위가 적혀 있다.
  // 서버 액션과 크론/수집 라우트가 전부 대상. QA 하네스는 supabase 클라이언트를 직접 쓰므로 제외.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { goalhub: { rules: { "checked-db-write": checkedDbWrite } } },
    rules: { "goalhub/checked-db-write": "error" },
  },
]);

export default eslintConfig;
