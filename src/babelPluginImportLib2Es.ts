/**
 * migrate from https://github.com/umijs/father/blob/2.x/packages/father-build/src/importLibToEs.js
 */
const cwd = process.cwd();

export function replaceLibWithEs(moduleName: string, paths = [cwd]) {
  if (!/\/lib\//.test(moduleName)) {
    return moduleName;
  }

  const esModule = moduleName.replace('/lib/', '/es/');

  try {
    require.resolve(esModule, { paths });
    return esModule;
  } catch {
    return moduleName;
  }
}

function replacePath(path: any) {
  if (path.node.source) {
    path.node.source.value = replaceLibWithEs(path.node.source.value);
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
