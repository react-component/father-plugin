import { resolveSourceEsmSpecifier } from './nativeEsm';

function replaceSource(path: any, state: any) {
  const source = path.node.source;
  const filename = state.filename || path.hub?.file?.opts?.filename;

  if (source?.value && filename) {
    source.value = resolveSourceEsmSpecifier(filename, source.value);
  }
}

function replaceDynamicImport(path: any, state: any) {
  if (path.node.callee?.type !== 'Import') {
    return;
  }

  const source = path.node.arguments?.[0];
  const filename = state.filename || path.hub?.file?.opts?.filename;
  if (source?.type === 'StringLiteral' && filename) {
    source.value = resolveSourceEsmSpecifier(filename, source.value);
  }
}

export default function addEsmExtensions() {
  return {
    visitor: {
      CallExpression: replaceDynamicImport,
      ExportAllDeclaration: replaceSource,
      ExportNamedDeclaration: replaceSource,
      ImportDeclaration: replaceSource,
    },
  };
}
