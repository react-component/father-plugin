import { defineConfig } from 'father';
import path from 'path';

export default defineConfig({
  cjs: { output: 'dist' },
  plugins: [path.resolve(__dirname, 'src')],
});
