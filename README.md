<div align="center">
  <h1>@rc-component/father-plugin</h1>
  <p><sub><a href="https://ant.design"><img alt="Ant Design" height="14" src="https://gw.alipayobjects.com/zos/rmsportal/KDpgvguMpGfqaHPjicRK.svg" style="vertical-align: -0.125em;" /></a> Part of the Ant Design ecosystem.</sub></p>
  <p>🧱 Shared father build plugin for rc-component packages.</p>

  <p>
    <a href="https://npmjs.org/package/@rc-component/father-plugin"><img alt="NPM version" src="https://img.shields.io/npm/v/@rc-component/father-plugin.svg?style=flat-square"></a>
    <a href="https://npmjs.org/package/@rc-component/father-plugin"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@rc-component/father-plugin.svg?style=flat-square"></a>
    <a href="https://bundlephobia.com/package/@rc-component/father-plugin"><img alt="bundle size" src="https://img.shields.io/bundlephobia/minzip/%40rc-component%2Ffather-plugin?style=flat-square"></a>
    <a href="https://github.com/react-component/father-plugin/actions/workflows/test.yml"><img alt="build status" src="https://github.com/react-component/father-plugin/actions/workflows/test.yml/badge.svg"></a>
    <a href="https://app.codecov.io/gh/react-component/father-plugin"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/react-component/father-plugin/main.svg?style=flat-square"></a>
  </p>
</div>

<p align="center">English | <a href="./README.zh-CN.md">简体中文</a></p>

## Highlights

| Area    | Support                                               |
| ------- | ----------------------------------------------------- |
| Purpose | Shared father build plugin for rc-component packages. |
| Package | `@rc-component/father-plugin`                         |
| Release | `@rc-component/np` / `rc-np`                          |

## Install

```bash
npm install @rc-component/father-plugin --save-dev
```

## Usage

```ts | pure
import { defineConfig } from 'father';

export default defineConfig({
  plugins: ['@rc-component/father-plugin'],
});
```

## API

### Default imports in native ESM

For `esm.platform: 'node'`, the plugin normalizes default imports from statically identifiable transpiled CommonJS dependencies. It resolves each package's Node **import** entry, then checks for `__esModule` and `default` exports without executing the dependency. Package names are not hardcoded: scoped packages, package subpaths, and statically identifiable CommonJS re-export entries are supported.

No additional interop option or compiler switch is needed. For native Node ESM with Father 4.6.37 or newer:

```ts | pure
export default defineConfig({
  plugins: ['@rc-component/father-plugin'],
  esm: { platform: 'node', autoExtension: true },
});
```

Father keeps its default esbuild compiler for Node. The same output normalization also works with explicitly selected Babel or SWC, after their TypeScript/JSX transforms. Source maps are composed back to the original source. One small helper is generated per affected output file, so component source keeps ordinary default imports, including `import { default as Name }`.

Native ESM entries and plain CommonJS exports stay unchanged. The rule skips named imports, namespace imports, type-only imports, relative imports, builtins, dynamic imports, and dependency re-export statements in the consuming source. Unresolved dependencies and export structures that cannot be classified statically are left untouched. Browser-targeted and CommonJS builds keep their existing compiler output.

This is a compatibility bridge until dependencies expose native ESM entries. Generated code still checks the loaded value at runtime, since downstream bundlers can select another entry. The parsing and resolution dependencies run only during the library build; no helper package is imported by the generated output.

| Option    | Description                                              |
| --------- | -------------------------------------------------------- |
| `plugins` | Register `@rc-component/father-plugin` in father config. |

## Development

```bash
npm install
npm run lint
npm run build
```

## Release

```bash
npm run prepublishOnly
```

The release flow is handled by `@rc-component/np` through the `rc-np` command when the package uses the shared release flow.

## License

@rc-component/father-plugin is released under the [MIT](./LICENSE) license.
