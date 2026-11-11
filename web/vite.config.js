import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // 5178 落在 Windows 保留端口段 (5141-5240) 内，会被 EACCES 拒绝，故改用 5599
    host: '127.0.0.1', // 强制 IPv4，避免 ::1 被安全策略拒绝
    port: 5599,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts'],
        },
      },
    },
  },
})
