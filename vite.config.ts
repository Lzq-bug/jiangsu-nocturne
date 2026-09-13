import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // pi-ai 的 provider-env.ts 在 Bun 沙箱分支里 require("node:fs").
      // 浏览器永远不触发该分支,此桩只为让打包解析通过。
      { find: /^node:fs$/, replacement: resolve(dir, 'src/stubs/node-fs.ts') },
    ],
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.loca.lt', '.lhr.life'],
    // 同源代理:浏览器直连 anthropic 兼容网关会被 CORS 拦截,
    // 改为请求本地 /__anthropic/*,由 Vite 在服务端转发。
    proxy: {
      '/api/tts': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/asr': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/__api': {
        target: process.env.VITE_DEEPSEEK_TARGET || 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__api/, ''),
      },
    },
  },
});