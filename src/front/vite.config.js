import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'


export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    }
  },
  plugins: [react()],
  server: {
    allowedHosts: ['enough-introduction-cat-favors.trycloudflare.com']
  },
})

