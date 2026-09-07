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
  for (const directory of fixtures.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content),
  );
  return file;
}

function loadOutput(directory, code) {
  const entry = writeFile(path.join(directory, 'compiled.mjs'), code);
  return import(pathToFileURL(entry).href);
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-interop-'));
  fixtures.push(directory);
  const add = (name, files, config = {}) => {
    const root = path.join(directory, 'node_modules', name);
    writeFile(path.join(root, 'package.json'), {
      name,
      main: 'index.js',
      ...config,
    });
    for (const [file, code] of Object.entries(files)) {
      writeFile(path.join(root, file), code);
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
  writeFile(path.join(directory, 'package.json'), {
    name: 'interop-fixture',
    version: '1.0.0',
    type: 'commonjs',
  });
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
  const [code] = normalize(source, path.join(directory, 'src.ts'));
  return { module: await loadOutput(directory, code), code };
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
    assert.equal((await loadOutput(directory, code)).default, value);
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
  const file = writeFile(path.join(directory, 'entry.ts'), source);
  writeFile(path.join(directory, 'tsconfig.json'), {
    compilerOptions: { target: 'ES2020' },
  });
  const context = {
    config: {
      transformer: 'esbuild',
      format: 'esm',
      platform: 'node',
      cjsDefaultInterop: true,
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
    assert.equal((await loadOutput(directory, code)).result, 'cjs');
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

test('returns the original compiler output when disabled, or for CJS and browser builds', async () => {
  const { directory } = fixture();
  const source = `import Component from 'any-legacy-package'; export default Component;`;
  const original =
    require('father/dist/builder/bundless/loaders/javascript/esbuild').default;
  for (const options of [
    { cjsDefaultInterop: undefined },
    { cjsDefaultInterop: false },
    { format: 'cjs' },
    { platform: 'browser' },
  ]) {
    const { result, context } = await compile(directory, source, options);
    assert.deepEqual(result, await original.call(context, source));
  }
});

test('a real Father build opts in with default esbuild and invalidates the cache when toggled', async () => {
  const { directory } = fixture();
  writeFile(
    path.join(directory, 'src/index.ts'),
    `import Component from 'any-legacy-package'; export default Component;`,
  );
  const entry = path.join(directory, 'es/index.mjs');
  let original;
  let enabled;
  for (const option of [undefined, true, false, true, undefined]) {
    writeFile(
      path.join(directory, '.fatherrc.ts'),
      `export default ${JSON.stringify({
        plugins: [require.resolve('../dist')],
        cjsDefaultInterop: option,
        esm: { platform: 'node', autoExtension: true },
      })};`,
    );
    const log = execFileSync(
      process.execPath,
      [require.resolve('father/bin/father.js'), 'build'],
      {
        cwd: directory,
        env: {
          ...process.env,
          FATHER_CACHE: 'true',
          FATHER_CACHE_DIR: path.join(directory, '.cache'),
        },
        stdio: 'pipe',
        encoding: 'utf8',
      },
    );
    assert.ok(fs.existsSync(entry), log);
    // The shared plugin's output defaults still apply even when interop is false.
    assert.ok(fs.existsSync(path.join(directory, 'lib/index.js')), log);
    const code = fs.readFileSync(entry, 'utf8');
    if (option === true) {
      assert.match(code, /rcDefaultInterop/);
      enabled ??= code;
      assert.equal(code, enabled);
    } else {
      assert.doesNotMatch(code, /rcDefaultInterop/);
      original ??= code;
      assert.equal(code, original);
    }
    const consume = `import Component from './es/index.mjs';
      console.log(${option === true ? 'Component()' : 'Component.default()'});`;
    assert.equal(
      execFileSync(process.execPath, ['--input-type=module', '-e', consume], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
      'cjs',
    );
  }
  assert.ok(
    fs.readdirSync(path.join(directory, '.cache/bundless-loader')).length,
  );
});

test('opting out preserves explicit .default access and downstream ESM live bindings', async () => {
  for (const cjsDefaultInterop of [undefined, false]) {
    const { directory, add, cjs } = fixture();
    add('switch-entry', { 'index.js': cjs });
    const source = `import Legacy from 'any-legacy-package';
      import Value, { update } from 'switch-entry';
      export const explicit = Legacy.default();
      export const read = () => Value;
      export { Value as current, update };`;
    const {
      result: [code],
    } = await compile(directory, source, { cjsDefaultInterop });
    assert.doesNotMatch(code, /rcDefaultInterop/);
    // Model a downstream resolver choosing ESM after the library was built against CJS.
    add(
      'switch-entry',
      {
        'index.js': `let value = 1; export { value as default };
          export function update() { value = 2; }`,
      },
      { type: 'module' },
    );
    const consumer = await loadOutput(directory, code);
    assert.equal(consumer.explicit, 'cjs');
    assert.equal(consumer.read(), 1);
    assert.equal(consumer.current, 1);
    consumer.update();
    assert.equal(consumer.read(), 2);
    assert.equal(consumer.current, 2);
  }
});

test('the published declaration supports the opt-in in Father defineConfig', () => {
  const { directory, add } = fixture();
  add(
    '@rc-component/father-plugin',
    {
      'types.d.ts': fs.readFileSync(
        path.join(__dirname, '../types.d.ts'),
        'utf8',
      ),
    },
    { types: 'types.d.ts' },
  );
  const config = writeFile(
    path.join(directory, '.fatherrc.ts'),
    `import type {} from '@rc-component/father-plugin';
    import { defineConfig } from 'father';
    export default defineConfig({
      plugins: ['@rc-component/father-plugin'],
      cjsDefaultInterop: true,
      esm: { platform: 'node', autoExtension: true },
    });
    defineConfig({ cjsDefaultInterop: false });
    defineConfig({
      // @ts-expect-error Only booleans are accepted.
      cjsDefaultInterop: 'true',
    });`,
  );
  execFileSync(
    process.execPath,
    [
      require.resolve('typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--module',
      'commonjs',
      '--target',
      'es2020',
      config,
    ],
    { cwd: directory, stdio: 'pipe' },
  );
});
