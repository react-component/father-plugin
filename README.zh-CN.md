<div align="center">
  <h1>@rc-component/father-plugin</h1>
  <p><sub><a href="https://ant.design"><img alt="Ant Design" height="14" src="https://gw.alipayobjects.com/zos/rmsportal/KDpgvguMpGfqaHPjicRK.svg" style="vertical-align: -0.125em;" /></a> Ant Design 生态的一部分。</sub></p>
  <p>🧱 rc-component 包共享的 father 构建插件。</p>

  <p>
    <a href="https://npmjs.org/package/@rc-component/father-plugin"><img alt="NPM version" src="https://img.shields.io/npm/v/@rc-component/father-plugin.svg?style=flat-square"></a>
    <a href="https://npmjs.org/package/@rc-component/father-plugin"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@rc-component/father-plugin.svg?style=flat-square"></a>
    <a href="https://bundlephobia.com/package/@rc-component/father-plugin"><img alt="bundle size" src="https://img.shields.io/bundlephobia/minzip/%40rc-component%2Ffather-plugin?style=flat-square"></a>
    <a href="https://github.com/react-component/father-plugin/actions/workflows/test.yml"><img alt="build status" src="https://github.com/react-component/father-plugin/actions/workflows/test.yml/badge.svg"></a>
    <a href="https://app.codecov.io/gh/react-component/father-plugin"><img alt="Codecov" src="https://img.shields.io/codecov/c/github/react-component/father-plugin/main.svg?style=flat-square"></a>
  </p>
</div>

<p align="center"><a href="./README.md">English</a> | 简体中文</p>

## 亮点

| 方向 | 支持                                    |
| ---- | --------------------------------------- |
| 定位 | rc-component 包共享的 father 构建插件。 |
| 包名 | `@rc-component/father-plugin`           |
| 发布 | `@rc-component/np` / `rc-np`            |

## 安装

```bash
npm install @rc-component/father-plugin --save-dev
```

## 用法

```ts | pure
import { defineConfig } from 'father';

export default defineConfig({
  plugins: ['@rc-component/father-plugin'],
});
```

## API

### 原生 ESM 的默认导入

`cjsDefaultInterop` **默认关闭**。不配置或设为 `false` 时，插件不注册 interop 编译处理，也不加载相关检查依赖，保留原有编译产物和导入语义。

需要让转译后的 CommonJS 默认导入在原生 Node ESM 中工作时，由组件库显式开启。使用 Father 4.6.37 或更高版本：

```ts | pure
import type {} from '@rc-component/father-plugin';
import { defineConfig } from 'father';

export default defineConfig({
  plugins: ['@rc-component/father-plugin'],
  cjsDefaultInterop: true,
  esm: { platform: 'node', autoExtension: true },
});
```

类型导入为 `defineConfig` 加载插件的配置类型，不产生运行时导入。开关位于配置顶层，与 `esm`、`cjs` 同级。切换开关也会改变 Father 的文件构建缓存键。

开启后，仅对 **Node ESM 产物** 中能静态识别的转译后 CommonJS 依赖处理默认导入。插件按照 Node 的 **import** 条件解析依赖入口，检查 `__esModule` 和 `default` 导出，全程不执行依赖代码。不维护包名白名单，支持带 scope 的包、包子路径和可静态识别的 CommonJS 转导出入口。

Father 继续使用 Node 平台默认的 esbuild；显式选择 Babel 或 SWC 时也会在 TypeScript/JSX 编译完成后执行相同的处理，并将 source map 合并回原始源码。每个涉及的产物文件只生成一个小型兼容函数，组件源码保持普通默认导入，包括 `import { default as Name }`。

构建时识别为原生 ESM 的入口和普通 CommonJS 导出保持原样。规则不处理命名导入、命名空间导入、纯类型导入、相对路径、内置模块、动态导入以及消费方源码中的依赖再导出语句。无法解析的依赖、无法静态识别的导出结构以及检查用解析器不支持的产物语法也保持原样。面向浏览器的构建和 CommonJS 构建继续使用原有编译产物。

**开启此选项会改变默认导入语义。** 对于识别到的 CommonJS 依赖，`import pkg from 'legacy'` 拿到的是内部的 `default` 值，原本的 CommonJS 导出对象会被解包。因此，已有的 `pkg.default()` 调用或对该对象其他属性的访问需要先检查。如果构建时识别为 CommonJS，下游实际却选择了原生 ESM 入口，生成的局部变量会保存初始值，无法反映默认导出的后续更新；运行时检查不能保留这种情况下的 ESM 实时绑定。组件库应验证其支持的消费方式后再开启。

这是一项过渡措施，待依赖提供原生 ESM 入口后可移除。产物仍会在运行时检查导出值。解析相关依赖只在组件库构建时运行，产物不会额外导入 helper 包。

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `plugins` | — | 在 father 配置中注册 `@rc-component/father-plugin`。 |
| `cjsDefaultInterop` | `false` | 显式开启 Node ESM 产物的 CommonJS 默认导入兼容处理。 |

## 本地开发

```bash
npm install
npm run lint
npm run build
```

## 发布

```bash
npm run prepublishOnly
```

发布流程通过 `@rc-component/np` 提供的 `rc-np` 命令处理。

## 许可证

@rc-component/father-plugin 基于 [MIT](./LICENSE) 协议发布。
