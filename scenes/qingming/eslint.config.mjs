import js from '@eslint/js';

/**
 * 这个工程没有构建器：`src/*.js` 走浏览器 ESM，`tools/*.mjs` 走 Node，
 * `vendor/` 是 vendored 的 three.js r160（不该被我们的规则管），
 * `dist/` 是打包产物。所以只 lint 自己写的代码。
 *
 * 规则是照现有代码调过的：真错（未定义变量、重复键、拼错的全局）报 error，
 * 风格问题一律 warn，不拦提交。
 */

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  console: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  Blob: 'readonly',
  Image: 'readonly',
  Audio: 'readonly',
  HTMLElement: 'readonly',
  Element: 'readonly',
  Node: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  KeyboardEvent: 'readonly',
  MouseEvent: 'readonly',
  WheelEvent: 'readonly',
  PointerEvent: 'readonly',
  TouchEvent: 'readonly',
  DeviceOrientationEvent: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  matchMedia: 'readonly',
  getComputedStyle: 'readonly',
  DOMParser: 'readonly',
  globalThis: 'readonly',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  WebSocket: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  globalThis: 'readonly',
  __dirname: 'off',
  __filename: 'off',
};

const relaxedStyle = {
  // 中文文案里出现全角空格、书名号是正常的，不算 irregular whitespace
  'no-irregular-whitespace': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-cond-assign': ['warn', 'except-parens'],
  'no-useless-escape': 'warn',
  'no-fallthrough': 'warn',
  'no-prototype-builtins': 'off',
  'no-inner-declarations': 'off',
  'no-async-promise-executor': 'warn',
  'no-control-regex': 'off',
  'no-restricted-syntax': 'off',
};

const recommendedRules = js.configs.recommended.rules;

const commonRules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'vendor/**',
      'shots/**',
      'shots-profile/**',
      'docs/**',
    ],
  },

  {
    files: ['src/**/*.js', 'src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      ...recommendedRules,
      ...commonRules,
      ...relaxedStyle,
    },
  },

  {
    files: ['tools/**/*.mjs', 'tools/**/*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      ...recommendedRules,
      ...commonRules,
      ...relaxedStyle,
    },
  },
];
