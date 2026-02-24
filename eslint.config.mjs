import { defineConfig, globalIgnores } from "eslint/config";

export const sharedIgnores = [
  "**/.next/**",
  "**/out/**",
  "**/build/**",
  "**/dist/**",
  "**/.turbo/**",
  "**/.astro/**",
  "**/.docusaurus/**",
  "**/next-env.d.ts",
];

export default defineConfig([globalIgnores(sharedIgnores)]);
