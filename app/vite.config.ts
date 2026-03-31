import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      '/jjwxc': {
        target: 'https://www.jjwxc.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jjwxc/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const cookie = req.headers['x-jjwxc-cookie'];
            if (cookie && typeof cookie === 'string') {
              proxyReq.setHeader('Cookie', cookie);
            }
            proxyReq.removeHeader('x-jjwxc-cookie');
          });
        },
      },
      '/jjwxc-my': {
        target: 'https://my.jjwxc.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jjwxc-my/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const cookie = req.headers['x-jjwxc-cookie'];
            if (cookie && typeof cookie === 'string') {
              proxyReq.setHeader('Cookie', cookie);
            }
            proxyReq.removeHeader('x-jjwxc-cookie');
          });
        },
      },
    },
  },
});
