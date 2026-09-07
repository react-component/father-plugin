const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { transformSync } = require('@babel/core');
const interop = require('../dist/babelPluginDefaultInterop').default;
const fatherPlugin = require('../dist').default;

const fixtures = [];
afterEach(() => {
  fixtures
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    );
});

function transform(source, typescript = false) {
  return transformSync(source, {
    filename: typescript ? 'consumer.ts' : 'consumer.js',
    configFile: false,
    babelrc: false,
    sourceMaps: true,
    plugins: [
      interop,
      ...(typescript ? [require('@babel/plugin-transform-typescript')] : []),
    ],
  });
}

async function run(source, esm = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-interop-'));
  fixtures.push(directory);
  for (const name of ['trigger', 'resize-observer', 'overflow']) {
    const dependency = path.join(
      directory,
      'node_modules',
      '@rc-component',
      name,
    );
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, 'package.json'),
      JSON.stringify({
        name: `@rc-component/${name}`,
        type: esm ? 'module' : 'commonjs',
        main: 'index.js',
      }),
    );
    fs.writeFileSync(
      path.join(dependency, 'index.js'),
      esm
        ? `export const marker = '${name}'; export default function component() { return marker; }`
        : `Object.defineProperty(exports, '__esModule', { value: true });
           exports.marker = '${name}'; exports.default = function component() { return exports.marker; };`,
    );
  }
  const output = transform(source);
  const entry = path.join(directory, 'consumer.mjs');
  fs.writeFileSync(entry, output.code);
  return { module: await import(pathToFileURL(entry).href), ...output };
}

for (const esm of [false, true]) {
  test(`default imports work with ${esm ? 'native ESM' : 'transpiled CommonJS'} dependencies`, async () => {
    const { module, code } = await run(
      `
      import Trigger, { marker } from '@rc-component/trigger';
      import { default as ResizeObserver } from '@rc-component/resize-observer';
      import Overflow from '@rc-component/overflow';
      export const result = [Trigger(), ResizeObserver(), Overflow(), marker];
      export { Trigger as default };
    `,
      esm,
    );
    assert.deepEqual(module.result, [
      'trigger',
      'resize-observer',
      'overflow',
      'trigger',
    ]);
    assert.equal(module.default(), 'trigger');
    assert.equal((code.match(/function _rcDefaultInterop/g) || []).length, 1);
  });
}

test('keeps import hoisting, shadowed bindings, directives, and generated-name collisions', async () => {
  const { module, code, map } = await run(`
    'use client';
    export const result = Trigger();
    import Trigger from '@rc-component/trigger';
    const _rcDefaultInterop = 'user helper';
    const _TriggerModule = 'user binding';
    export function shadow(Trigger) { return Trigger; }
    export const names = [_rcDefaultInterop, _TriggerModule];
  `);
  assert.equal(module.result, 'trigger');
  assert.equal(module.shadow('local'), 'local');
  assert.deepEqual(module.names, ['user helper', 'user binding']);
  assert.match(code, /^'use client';/);
  assert.deepEqual(map.sources, ['consumer.js']);
});

test('does not change named imports, namespace imports, other packages, or rc deep paths', () => {
  const { code } = transform(`
    import { marker } from '@rc-component/trigger';
    import * as observer from '@rc-component/resize-observer';
    import React from 'react';
    import deep from '@rc-component/overflow/lib';
    export { marker, observer, React, deep };
  `);
  assert.doesNotMatch(code, /rcDefaultInterop|__esModule/);
});

test('does not introduce runtime imports for TypeScript-only dependencies', () => {
  const { code } = transform(
    `
    import type Trigger from '@rc-component/trigger';
    import ResizeObserver from '@rc-component/resize-observer';
    import { type default as Overflow } from '@rc-component/overflow';
    export type Values = [Trigger, typeof ResizeObserver, Overflow];
  `,
    true,
  );
  assert.doesNotMatch(code, /rc-component|rcDefaultInterop|__esModule/);
});

test('is only installed in the ESM Babel configuration', () => {
  let config;
  fatherPlugin({
    onStart() {},
    modifyDefaultConfig(modify) {
      config = modify({});
    },
  });
  assert.ok(
    config.esm.extraBabelPlugins.includes(
      require.resolve('../dist/babelPluginDefaultInterop'),
    ),
  );
  assert.equal(config.cjs.extraBabelPlugins, undefined);
  assert.equal(config.esm.transformer, undefined);
});
