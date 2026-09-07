const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { TraceMap, originalPositionFor } = require('@jridgewell/trace-mapping');
const normalize = require('../dist/defaultInterop').default;
const transformer = require('../dist/transformer').default;

const fixtures = [];
afterEach(() => {
  fixtures
    .splice(0)
    .forEach((directory) =>
      fs.rmSync(directory, { recursive: true, force: true }),
    );
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-interop-'));
  fixtures.push(directory);
  const add = (name, files, config = {}) => {
    const root = path.join(directory, 'node_modules', name);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name, main: 'index.js', ...config }),
    );
    for (const [file, code] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), code);
    }
  };
  const cjs = `Object.defineProperty(exports, '__esModule', { value: true });
    exports.marker = 'cjs'; exports.default = function component() { return exports.marker; };`;
  add('any-legacy-package', { 'index.js': cjs });
  add(
    '@example/components',
    {
      'index.js': `module.exports = require('./component.js');`,
      'component.js': cjs,
    },
    { exports: { '.': './index.js', './feature': './component.js' } },
  );
  add('plain-cjs', {
    'index.js': `module.exports = function plain() { return 'plain'; };`,
  });
  fs.symlinkSync(
    path.dirname(require.resolve('father/package.json')),
    path.join(directory, 'node_modules/father'),
    'junction',
  );
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: 'interop-fixture',
      version: '1.0.0',
      type: 'commonjs',
    }),
  );
  add(
    'dual-package',
    {
      'index.cjs': cjs,
      'index.js': `export const marker = 'esm';
      export let current = { __esModule: true, default: 'intentional ESM value' };
      export { current as default };
      export function update() { current = 'updated'; }`,
    },
    {
      type: 'module',
      exports: { import: './index.js', require: './index.cjs' },
    },
  );
  return { directory, add, cjs };
}

async function run(directory, source) {
  const entry = path.join(directory, 'consumer.mjs');
  const [code] = normalize(source, path.join(directory, 'src.ts'));
  fs.writeFileSync(entry, code);
  return { module: await import(pathToFileURL(entry).href), code };
}

test('handles arbitrary package names, scoped subpaths, and CommonJS re-export entries', async () => {
  const { directory } = fixture();
  const { module, code } = await run(
    directory,
    `
    import Component, { marker } from 'any-legacy-package';
    import { default as Wrapped } from '@example/components';
    import Deep from '@example/components/feature';
    export const result = [Component(), Wrapped(), Deep(), marker];
    export { Component as default };
  `,
  );
  assert.deepEqual(module.result, ['cjs', 'cjs', 'cjs', 'cjs']);
  assert.equal(module.default(), 'cjs');
  assert.equal((code.match(/function _rcDefaultInterop/g) || []).length, 1);
});

test('uses the import condition and preserves native ESM default values and live bindings', async () => {
  const { directory } = fixture();
  const source = `import Value, { update } from 'dual-package';
    import Plain from 'plain-cjs';
    export const before = Value;
    update();
    export const after = Value;
    export const plain = Plain();`;
  const { module, code } = await run(directory, source);
  assert.equal(code, source);
  assert.deepEqual(module.before, {
    __esModule: true,
    default: 'intentional ESM value',
  });
  assert.equal(module.after, 'updated');
  assert.equal(module.plain, 'plain');
});

test('keeps import hoisting, shadowed bindings, directives, and generated-name collisions', async () => {
  const { directory } = fixture();
  const { module, code } = await run(
    directory,
    `'use client';
    export const result = Component();
    import Component from 'any-legacy-package';
    const _rcDefaultInterop = 'user helper';
    const _ComponentModule = 'user binding';
    export function shadow(Component) { return Component; }
    export const names = [_rcDefaultInterop, _ComponentModule];
  `,
  );
  assert.equal(module.result, 'cjs');
  assert.equal(module.shadow('local'), 'local');
  assert.deepEqual(module.names, ['user helper', 'user binding']);
  assert.ok(code.startsWith("'use client';"));
});

test('leaves named, namespace, dynamic, relative, builtin, and unresolved imports unchanged', () => {
  const { directory } = fixture();
  const source = `
    import { marker } from 'any-legacy-package';
    import * as ns from '@example/components';
    import 'any-legacy-package';
    import Relative from './local.js';
    import FS from 'fs';
    import HTTP from 'node:http';
    import Optional from 'not-installed';
    export const lazy = () => import('any-legacy-package');
    export { marker, ns, Relative, FS, HTTP, Optional };
  `;
  assert.equal(normalize(source, path.join(directory, 'entry.js'))[0], source);
});

test('does not execute dependencies while inspecting their exports', () => {
  const { directory, add, cjs } = fixture();
  add('must-not-execute', {
    'index.js': `throw new Error('executed at build time');\n${cjs}`,
  });
  const [code] = normalize(
    `import Value from 'must-not-execute'; export default Value;`,
    path.join(directory, 'entry.js'),
  );
  assert.match(code, /rcDefaultInterop/);
});

test('preserves compiler output with syntax unsupported by the inspection parser', () => {
  const source = `import data from './data.json' assert { type: 'json' }; export default data;`;
  const sourceMap = '{"version":3,"sources":[],"names":[],"mappings":""}';
  assert.deepEqual(normalize(source, '/project/entry.js', sourceMap), [
    source,
    sourceMap,
  ]);
});

test('checks runtime values when a downstream resolver selects another entry', async () => {
  for (const value of [null, false, 0, 'native value']) {
    const { directory, add, cjs } = fixture();
    add('switch-entry', { 'index.js': cjs });
    const [code] = normalize(
      `import Value from 'switch-entry'; export default Value;`,
      path.join(directory, 'entry.js'),
    );
    assert.match(code, /rcDefaultInterop/);
    add(
      'switch-entry',
      { 'index.js': `export default ${JSON.stringify(value)};` },
      { type: 'module' },
    );
    const entry = path.join(directory, 'compiled.mjs');
    fs.writeFileSync(entry, code);
    assert.equal((await import(pathToFileURL(entry).href)).default, value);
  }
});

test('handles cyclic CommonJS re-exports and ignores unrecognized export structures', () => {
  const { directory, add } = fixture();
  add('cyclic', {
    'index.js': `module.exports = require('./other.js');`,
    'other.js': `module.exports = require('./index.js');`,
  });
  const source = `import Value from 'cyclic'; export default Value;`;
  assert.equal(normalize(source, path.join(directory, 'entry.js'))[0], source);
});

async function compile(directory, source, options = {}) {
  const file = path.join(directory, 'entry.ts');
  fs.writeFileSync(file, source);
  fs.writeFileSync(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2020' } }),
  );
  const context = {
    config: {
      transformer: 'esbuild',
      format: 'esm',
      platform: 'node',
      sourcemap: true,
      ...options,
    },
    pkg: {},
    paths: {
      cwd: directory,
      fileAbsPath: file,
      itemDistAbsPath: path.join(directory, 'dist/entry.mjs'),
    },
  };
  return { result: await transformer.call(context, source), context };
}

for (const compiler of ['esbuild', 'babel', 'swc']) {
  test(`keeps ${compiler} compilation and maps back to TypeScript source`, async () => {
    const { directory } = fixture();
    const source = `import Component from 'any-legacy-package';\nexport const result: string = Component();`;
    const {
      result: [code, map],
    } = await compile(directory, source, { transformer: compiler });
    assert.match(code, /rcDefaultInterop/);
    assert.doesNotMatch(code, /: string/);
    assert.ok(JSON.parse(map).sourcesContent.includes(source));
    const declaration = /(?:var|const) result\b/.exec(code);
    assert.ok(declaration);
    const prefix = code.slice(0, declaration.index);
    const position = originalPositionFor(new TraceMap(map), {
      line: prefix.split('\n').length,
      column: prefix.length - prefix.lastIndexOf('\n') - 1,
    });
    assert.equal(position.line, 2);
    assert.ok(position.source.endsWith('entry.ts'));
    const entry = path.join(directory, 'compiled.mjs');
    fs.writeFileSync(entry, code);
    assert.equal((await import(pathToFileURL(entry).href)).result, 'cjs');
  });
}

test('type-only imports are removed before interop analysis', async () => {
  const { directory } = fixture();
  const {
    result: [code],
  } = await compile(
    directory,
    `
    import type Component from 'any-legacy-package';
    import Other from '@example/components';
    export type Value = [typeof Component, typeof Other];
  `,
  );
  assert.doesNotMatch(code, /rcDefaultInterop|any-legacy-package|@example/);
});

test('returns the original compiler output for CJS and browser builds', async () => {
  const { directory } = fixture();
  const source = `import Component from 'any-legacy-package'; export default Component;`;
  const original =
    require('father/dist/builder/bundless/loaders/javascript/esbuild').default;
  for (const options of [{ format: 'cjs' }, { platform: 'browser' }]) {
    const { result, context } = await compile(directory, source, options);
    assert.deepEqual(result, await original.call(context, source));
  }
});

test('a real Father build uses default esbuild with the plugin registered', async () => {
  const { directory } = fixture();
  fs.mkdirSync(path.join(directory, 'src'));
  fs.writeFileSync(
    path.join(directory, 'src/index.ts'),
    `import Component from 'any-legacy-package'; export default Component;`,
  );
  fs.writeFileSync(
    path.join(directory, '.fatherrc.ts'),
    `export default ${JSON.stringify({
      plugins: [require.resolve('../dist')],
      esm: { platform: 'node', autoExtension: true },
    })};`,
  );
  const log = execFileSync(
    process.execPath,
    [require.resolve('father/bin/father.js'), 'build'],
    {
      cwd: directory,
      env: { ...process.env, FATHER_CACHE: 'none' },
      stdio: 'pipe',
      encoding: 'utf8',
    },
  );
  const entry = path.join(directory, 'es/index.mjs');
  assert.ok(fs.existsSync(entry), log);
  assert.match(fs.readFileSync(entry, 'utf8'), /rcDefaultInterop/);
  assert.equal((await import(pathToFileURL(entry).href)).default(), 'cjs');
});
