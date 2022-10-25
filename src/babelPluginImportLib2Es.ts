/**
 * migrate from https://github.com/umijs/father/blob/2.x/packages/father-build/src/importLibToEs.js
 */
import fs from 'fs';
import { dirname, join } from 'path';

const cwd = process.cwd();

function replacePath(path: any) {
  if (path.node.source && /\/lib\//.test(path.node.source.value)) {
    const esModule = path.node.source.value.replace('/lib/', '/es/');
    const esPath = dirname(join(cwd, `node_modules/${esModule}`));

    if (fs.existsSync(esPath)) {
      path.node.source.value = esModule;
    }
  }
}

function replaceLib() {
  return {
    visitor: {
      ImportDeclaration: replacePath,
      ExportNamedDeclaration: replacePath,
    },
  };
}

export default replaceLib;
