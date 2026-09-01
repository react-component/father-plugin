const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { afterEach, test } = require('node:test');

const {
  finalizeNativeEsmOutput,
  hasNativeEsmExport,
  resolveSourceEsmSpecifier,
} = require('../dist/nativeEsm');

const fixtures = [];

afterEach(() => {
  fixtures.splice(0).forEach((fixture) => {
    fs.rmSync(fixture, { recursive: true, force: true });
  });
});

function createFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'father-plugin-esm-'));
  fixtures.push(fixture);
  return fixture;
}

test('detects when package imports target the ESM output', () => {
  assert.equal(
    hasNativeEsmExport(
      {
        '.': {
          import: './es/index.js',
          require: './lib/index.js',
        },
      },
      'es',
    ),
    true,
  );
  assert.equal(
    hasNativeEsmExport(
      {
        '.': {
          import: './lib/index.js',
          require: './lib/index.js',
        },
      },
      'es',
    ),
    false,
  );
  assert.equal(hasNativeEsmExport(undefined, 'es'), false);
});

test('resolves source files and directory entries to JavaScript specifiers', () => {
  const fixture = createFixture();
  const sourceDirectory = path.join(fixture, 'src');
  const indexPath = path.join(sourceDirectory, 'index.ts');

  fs.mkdirSync(path.join(sourceDirectory, 'nested'), { recursive: true });
  fs.writeFileSync(indexPath, '');
  fs.writeFileSync(
    path.join(sourceDirectory, 'value.ts'),
    'export const value = 1;',
  );
  fs.writeFileSync(
    path.join(sourceDirectory, 'value.test.ts'),
    'export const dotted = 1;',
  );
  fs.writeFileSync(path.join(sourceDirectory, 'style.css'), '.fixture {}');
  fs.writeFileSync(
    path.join(sourceDirectory, 'nested', 'index.tsx'),
    'export const nested = 1;',
  );

  assert.equal(resolveSourceEsmSpecifier(indexPath, './value'), './value.js');
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, './value.test'),
    './value.test.js',
  );
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, './nested'),
    './nested/index.js',
  );
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, './style.css'),
    './style.css',
  );
  assert.equal(resolveSourceEsmSpecifier(indexPath, 'react'), 'react');
  assert.throws(
    () => resolveSourceEsmSpecifier(indexPath, './missing'),
    /Cannot resolve native ESM import/,
  );
});

test('completes legacy package subpaths without changing package exports', () => {
  const fixture = createFixture();
  const sourceDirectory = path.join(fixture, 'src');
  const indexPath = path.join(sourceDirectory, 'index.ts');
  const legacyPackage = path.join(fixture, 'node_modules', 'legacy-package');
  const exportedPackage = path.join(
    fixture,
    'node_modules',
    'exported-package',
  );

  fs.mkdirSync(path.join(legacyPackage, 'nested'), { recursive: true });
  fs.mkdirSync(exportedPackage, { recursive: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(indexPath, '');
  fs.writeFileSync(
    path.join(legacyPackage, 'package.json'),
    JSON.stringify({ name: 'legacy-package' }),
  );
  fs.writeFileSync(
    path.join(legacyPackage, 'plugin.js'),
    'module.exports = {};',
  );
  fs.writeFileSync(
    path.join(legacyPackage, 'nested', 'index.js'),
    'module.exports = {};',
  );
  fs.writeFileSync(
    path.join(exportedPackage, 'package.json'),
    JSON.stringify({
      name: 'exported-package',
      exports: { './feature': './feature.js' },
    }),
  );
  fs.writeFileSync(
    path.join(exportedPackage, 'feature.js'),
    'export default {};',
  );

  assert.equal(
    resolveSourceEsmSpecifier(indexPath, 'legacy-package/plugin'),
    'legacy-package/plugin.js',
  );
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, 'legacy-package/nested'),
    'legacy-package/nested/index.js',
  );
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, 'exported-package/feature'),
    'exported-package/feature',
  );
  assert.equal(
    resolveSourceEsmSpecifier(indexPath, 'legacy-package'),
    'legacy-package',
  );
});

test('rewrites declaration specifiers and marks the output as ESM', () => {
  const fixture = createFixture();
  const outputDirectory = path.join(fixture, 'es');

  fs.mkdirSync(path.join(outputDirectory, 'nested'), { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'value.js'),
    'export const value = 1;',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'value.d.ts'),
    'export declare const value = 1;',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'nested', 'index.js'),
    'export const nested = 1;',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'nested', 'index.d.ts'),
    'export declare const nested = 1;',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'nested', 'consumer.d.ts'),
    "import type { nested } from '.';",
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'index.d.ts'),
    [
      "export { value } from './value';",
      "export { nested } from './nested';",
      "export type Value = import('./value').value;",
    ].join('\n'),
  );

  assert.equal(finalizeNativeEsmOutput(outputDirectory), 4);
  assert.equal(
    fs.readFileSync(path.join(outputDirectory, 'index.d.ts'), 'utf8'),
    [
      "export { value } from './value.js';",
      "export { nested } from './nested/index.js';",
      "export type Value = import('./value.js').value;",
    ].join('\n'),
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(outputDirectory, 'package.json'), 'utf8'),
    ),
    { type: 'module' },
  );
  assert.equal(
    fs.readFileSync(
      path.join(outputDirectory, 'nested', 'consumer.d.ts'),
      'utf8',
    ),
    "import type { nested } from './index.js';",
  );
  assert.equal(finalizeNativeEsmOutput(outputDirectory), 0);
});

test('builds native ESM exports while preserving CommonJS output', async () => {
  const fixture = createFixture();
  const pluginPath = path.resolve(__dirname, '../dist/index.js');
  const fatherBin = require.resolve('father/bin/father.js');
  const legacyPackage = path.join(fixture, 'node_modules', 'legacy-package');

  fs.mkdirSync(path.join(fixture, 'src', 'nested'), { recursive: true });
  fs.mkdirSync(legacyPackage, { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      name: 'father-plugin-native-esm-fixture',
      exports: {
        '.': {
          types: './es/index.d.ts',
          import: './es/index.js',
          require: './lib/index.js',
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(fixture, '.fatherrc.ts'),
    `export default { plugins: [${JSON.stringify(pluginPath)}] };`,
  );
  fs.writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        declaration: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
        target: 'ES2018',
      },
    }),
  );
  fs.writeFileSync(
    path.join(fixture, 'src', 'index.ts'),
    [
      "export { default as legacy } from 'legacy-package/plugin';",
      "export { nested } from './nested';",
      "export { value } from './value';",
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(fixture, 'src', 'value.ts'),
    'export const value = 1;',
  );
  fs.writeFileSync(
    path.join(fixture, 'src', 'nested', 'index.ts'),
    'export const nested = 2;',
  );
  fs.writeFileSync(
    path.join(legacyPackage, 'package.json'),
    JSON.stringify({ name: 'legacy-package' }),
  );
  fs.writeFileSync(
    path.join(legacyPackage, 'plugin.js'),
    'module.exports = 3;',
  );
  fs.writeFileSync(
    path.join(legacyPackage, 'plugin.d.ts'),
    'declare const plugin: number; export default plugin;',
  );

  execFileSync(process.execPath, [fatherBin, 'build'], {
    cwd: fixture,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: 'pipe',
  });

  const esmSource = fs.readFileSync(
    path.join(fixture, 'es', 'index.js'),
    'utf8',
  );
  const declarationSource = fs.readFileSync(
    path.join(fixture, 'es', 'index.d.ts'),
    'utf8',
  );
  assert.match(esmSource, /from ['"]legacy-package\/plugin\.js['"]/);
  assert.match(esmSource, /from ['"]\.\/nested\/index\.js['"]/);
  assert.match(esmSource, /from ['"]\.\/value\.js['"]/);
  assert.match(declarationSource, /from ['"]\.\/nested\/index\.js['"]/);
  assert.match(declarationSource, /from ['"]\.\/value\.js['"]/);
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(fixture, 'es', 'package.json'), 'utf8'),
    ),
    { type: 'module' },
  );

  const esm = await import(pathToFileURL(path.join(fixture, 'es', 'index.js')));
  const commonJS = require(path.join(fixture, 'lib', 'index.js'));
  assert.deepEqual(
    { legacy: esm.legacy, nested: esm.nested, value: esm.value },
    { legacy: 3, nested: 2, value: 1 },
  );
  assert.deepEqual(
    {
      legacy: commonJS.legacy,
      nested: commonJS.nested,
      value: commonJS.value,
    },
    { legacy: 3, nested: 2, value: 1 },
  );
});

test('keeps legacy bundler ESM output unchanged without an import export', () => {
  const fixture = createFixture();
  const pluginPath = path.resolve(__dirname, '../dist/index.js');
  const fatherBin = require.resolve('father/bin/father.js');

  fs.mkdirSync(path.join(fixture, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({
      name: 'father-plugin-legacy-esm-fixture',
      main: './lib/index.js',
      module: './es/index.js',
    }),
  );
  fs.writeFileSync(
    path.join(fixture, '.fatherrc.ts'),
    `export default { plugins: [${JSON.stringify(pluginPath)}] };`,
  );
  fs.writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        declaration: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
        target: 'ES2018',
      },
    }),
  );
  fs.writeFileSync(
    path.join(fixture, 'src', 'index.ts'),
    "export { value } from './value';",
  );
  fs.writeFileSync(
    path.join(fixture, 'src', 'value.ts'),
    'export const value = 1;',
  );

  execFileSync(process.execPath, [fatherBin, 'build'], {
    cwd: fixture,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: 'pipe',
  });

  assert.match(
    fs.readFileSync(path.join(fixture, 'es', 'index.js'), 'utf8'),
    /from ['"]\.\/value['"]/,
  );
  assert.equal(fs.existsSync(path.join(fixture, 'es', 'package.json')), false);
});
