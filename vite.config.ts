import { defineConfig } from 'vite';

export default defineConfig({
  base: '/fullscreen-timer/',
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
      generateScopedName: '[name]__[local]__[hash:base64:5]',
    },
  },
});
