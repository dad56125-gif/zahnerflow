import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: './',
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/nodes': path.resolve(__dirname, './src/nodes'),
      '@/styles': path.resolve(__dirname, './src/styles'),
      '@/utils': path.resolve(__dirname, './src/utils'),
      '@shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    port: 8083,
    host: true,
    fs: {
      strict: false,
      allow: ['..']
    },
    proxy: {
      // 所有设备 API 都通过统一的后端访问
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      // WebSocket连接也通过代理
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'clsx'],
        }
      }
    }
  }
})
