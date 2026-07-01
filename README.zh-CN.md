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

| 名称      | 说明                                                 |
| --------- | ---------------------------------------------------- |
| `plugins` | 在 father 配置中注册 `@rc-component/father-plugin`。 |

## 本地开发

```bash
ut install
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
