import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['dist/', 'build/', 'coverage/', 'node_modules/']),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
);
