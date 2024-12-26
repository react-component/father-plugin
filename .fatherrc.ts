import { defineConfig } from 'father';

export default defineConfig({
  cjs: { output: 'dist' },
  targets: {
    chrome: 85,
  },
});
