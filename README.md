# @rc-component/father-plugin

[![NPM version](https://img.shields.io/npm/v/@rc-component/father-plugin.svg?style=flat)](https://npmjs.org/package/@rc-component/father-plugin) [![NPM downloads](http://img.shields.io/npm/dm/@rc-component/father-plugin.svg?style=flat)](https://npmjs.org/package/@rc-component/father-plugin)

The father plugin for all react-component projects.

## Usage

Install this plugin in `devDependencies`:

```bash
$ npm i @rc-component/father-plugin -D
```

Register it in `.fatherrc.ts`:

```ts
import { defineConfig } from 'father';

export default defineConfig({
  plugins: ['@rc-component/father-plugin'],
});
```

## Development

```bash
$ pnpm install
```

```bash
$ npm run dev
$ npm run build
```

## LICENSE

MIT
