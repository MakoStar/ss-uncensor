import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

const r = (path: string) => resolve(__dirname, path);
const sourcemap = process.env.SOURCE_MAP === '1';

const minify = {
  minify: 'oxc' as const,
  reportCompressedSize: false
};

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@core': r('src/main/core'),
        '@shared': r('src/shared')
      }
    },
    build: {
      ...minify,
      outDir: 'dist/main',
      sourcemap,
      target: 'node22',
      lib: { entry: 'src/main/index.ts', formats: ['cjs'] },
      rollupOptions: { output: { strict: true } }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': r('src/shared')
      }
    },
    build: {
      ...minify,
      outDir: 'dist/preload',
      sourcemap,
      target: 'node22',
      lib: { entry: 'src/preload/index.ts', formats: ['cjs'] },
      rollupOptions: { output: { strict: true } }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [vue()],
    resolve: {
      alias: {
        '@shared': r('src/shared'),
        '@': r('src/renderer/src')
      }
    },
    build: {
      ...minify,
      outDir: 'dist/renderer',
      target: 'chrome130'
    }
  }
});
