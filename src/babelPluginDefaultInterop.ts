import type * as Babel from '@babel/core';

// TODO: Remove this bridge when these packages and their dependencies expose native ESM entries.
const interopPackages = new Set([
  '@rc-component/trigger',
  '@rc-component/resize-observer',
  '@rc-component/overflow',
]);

/** Normalize the default imports of rc dependencies that still expose transpiled CJS to Node. */
export default function defaultInterop({
  types: t,
  template,
}: typeof Babel): Babel.PluginObj {
  return {
    name: 'rc-component-default-interop',
    visitor: {
      Program: {
        exit(program) {
          const helper =
            program.scope.generateUidIdentifier('rcDefaultInterop');
          const declarations: Babel.types.VariableDeclarator[] = [];

          // Run after TypeScript has removed imports that are only used as types.
          for (const statement of program.get('body')) {
            if (
              !statement.isImportDeclaration() ||
              statement.node.importKind === 'type' ||
              !interopPackages.has(statement.node.source.value)
            ) {
              continue;
            }

            for (const specifier of statement.node.specifiers) {
              if (
                !t.isImportDefaultSpecifier(specifier) &&
                !(
                  t.isImportSpecifier(specifier) &&
                  specifier.importKind !== 'type' &&
                  (t.isIdentifier(specifier.imported, { name: 'default' }) ||
                    t.isStringLiteral(specifier.imported, { value: 'default' }))
                )
              ) {
                continue;
              }

              const local = specifier.local;
              const imported = program.scope.generateUidIdentifier(
                `${local.name}Module`,
              );
              specifier.local = imported;
              declarations.push(
                t.variableDeclarator(
                  local,
                  t.callExpression(helper, [t.cloneNode(imported)]),
                ),
              );
            }
          }

          if (!declarations.length) return;

          const normalize = template.statement(`
            function %%NAME%%(value) {
              return value && typeof value === 'object' &&
                '__esModule' in value && value.__esModule && 'default' in value
                ? value.default : value;
            }
          `)({ NAME: helper });

          // Imports are hoisted, so initialize their local aliases before any source statements.
          program.unshiftContainer('body', [
            normalize,
            t.variableDeclaration('var', declarations),
          ]);
          program.scope.crawl();
        },
      },
    },
  };
}
