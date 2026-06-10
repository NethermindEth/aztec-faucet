import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
    // Local agent worktrees; not part of the repo, but ESLint scans them.
    ".claude/**",
  ]),
  {
    rules: {
      // Conscious downgrade (#47): the hits are fetch-and-set or
      // subscription-sync effect patterns that work today but would need
      // useSyncExternalStore-style rewrites to satisfy the rule. Keep the
      // signal as a warning; new code should avoid the pattern.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
