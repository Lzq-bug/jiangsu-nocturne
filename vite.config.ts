/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    // 卡面 SVG 一律独立发射为文件（懒加载、可缓存），禁止内联成 base64 塞进 JS
    assetsInlineLimit: 0,
  },
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: resolve(dir, 'src/$1') }],
  },
  server: {
    host: true,
    // 可选「星语」AI 模式：开发环境经同源代理转发 DeepSeek，绕过浏览器 CORS。
    // 生产环境需自行部署同等反向代理（见 README「启用 AI」一节）。
    proxy: {
      '/__api': {
        target: process.env.VITE_DEEPSEEK_TARGET || 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__api/, ''),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
