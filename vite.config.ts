import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages отдаёт 404.html для несуществующих путей; без него прямой заход/обновление на /products даёт 404.
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'spa-github-pages-404',
      closeBundle() {
        const dist = resolve(__dirname, 'dist')
        copyFileSync(resolve(dist, 'index.html'), resolve(dist, '404.html'))
      },
    },
  ],
  base: process.env.VITE_BASE_PATH ?? '/',
})
