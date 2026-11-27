import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { komariThemeZip } from './build/komariThemeZip'
import { localSnapshotApi } from './build/localSnapshotApi'

function getCommitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const commitHash = getCommitHash()

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_GIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    localSnapshotApi(rootDir),
    vue(),
    vueDevTools(),
    tailwindcss(),
    komariThemeZip(rootDir, commitHash),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 用函数形式按模块路径归组：对象形式的 ['echarts'] 会把完整 echarts
        // 主入口强制打进 chunk（即使代码只用了 echarts/core 的按需注册）
        manualChunks(id: string) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/vue-echarts') || id.includes('node_modules/zrender'))
            return 'echarts'
          if (id.includes('node_modules/@vue/') || id.includes('node_modules/vue-router') || id.includes('node_modules/pinia') || id.includes('node_modules/vue/'))
            return 'vue-vendor'
          if (id.includes('node_modules/reka-ui'))
            return 'reka-ui'
          if (id.includes('node_modules/@vueuse/'))
            return 'vueuse'
        },
      },
    },
  },
})
