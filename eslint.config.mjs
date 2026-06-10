import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // useDeferredEffect wraps useEffect; keep its dep arrays checked.
      "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "(useDeferredEffect)" }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local agent worktrees; not part of the repo, but ESLint scans them.
    ".claude/**",
  ]),
]);

export default eslintConfig;
