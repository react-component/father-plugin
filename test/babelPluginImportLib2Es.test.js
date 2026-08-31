const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');

const { replaceLibWithEs } = require('../dist/babelPluginImportLib2Es');

const fixtures = [];

afterEach(() => {
  fixtures.splice(0).forEach((fixture) => {
    fs.rmSync(fixture, { recursive: true, force: true });
  });
});

function createFixture({ withEsm }) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'father-plugin-'));
  const consumer = path.join(fixture, 'packages', 'consumer');
  const packageDir = path.join(fixture, 'node_modules', 'fixture-icons');

  fixtures.push(fixture);
  fs.mkdirSync(consumer, { recursive: true });
  fs.mkdirSync(path.join(packageDir, 'lib', 'asn'), { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    '{"name":"fixture-icons"}',
  );
  fs.writeFileSync(
    path.join(packageDir, 'lib', 'asn', 'Smile.js'),
    'module.exports = {};',
  );

  if (withEsm) {
    fs.mkdirSync(path.join(packageDir, 'es', 'asn'), { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, 'es', 'asn', 'Smile.js'),
      'export default {};',
    );
  }

  return consumer;
}

test('resolves ESM modules from a hoisted node_modules directory', () => {
  const consumer = createFixture({ withEsm: true });

  assert.equal(
    replaceLibWithEs('fixture-icons/lib/asn/Smile', [consumer]),
    'fixture-icons/es/asn/Smile',
  );
});

test('keeps the CommonJS path when the ESM module is unavailable', () => {
  const consumer = createFixture({ withEsm: false });

  assert.equal(
    replaceLibWithEs('fixture-icons/lib/asn/Smile', [consumer]),
    'fixture-icons/lib/asn/Smile',
  );
});

test('ignores imports outside lib directories', () => {
  assert.equal(
    replaceLibWithEs('fixture-icons/legacy/Smile'),
    'fixture-icons/legacy/Smile',
  );
});
