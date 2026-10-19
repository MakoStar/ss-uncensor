import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const r = (path: string) => resolve(__dirname, path)
const sourcemap = process.env.SOURCE_MAP === '1'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@core': r('src/core'),
        '@shared': r('src/shared'),
      },
    },
    build: {
      outDir: 'dist/main',
      sourcemap,
      target: 'node22',
      lib: { entry: 'src/main/index.ts', formats: ['cjs'] },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': r('src/shared'),
      },
    },
    build: {
      outDir: 'dist/preload',
      sourcemap,
      target: 'node22',
      lib: { entry: 'src/preload/index.ts', formats: ['cjs'] },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': r('src/shared'),
      },
    },
    build: {
      outDir: 'dist/renderer',
      target: 'chrome130',
    },
  },
})
