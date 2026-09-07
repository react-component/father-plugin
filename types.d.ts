import type { IApi } from 'father';

declare module 'father/dist/types' {
  interface IFatherConfig {
    /**
     * Normalize transpiled CommonJS default imports in Node ESM output.
     * Changes default-import semantics; see the plugin README before enabling.
     * @default false
     */
    cjsDefaultInterop?: boolean;
  }
}

declare const plugin: (api: IApi) => void;
export default plugin;
