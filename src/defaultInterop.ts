import remapping from '@ampproject/remapping';
import { parse as parseModule } from 'acorn';
import { parse as parseCommonJS } from 'cjs-module-lexer';
import { create } from 'enhanced-resolve';
import fs from 'fs';
import MagicString from 'magic-string';
import { builtinModules, createRequire } from 'module';
import path from 'path';

// Match Node's import branch, rather than accidentally inspecting a dual package's require entry.
const resolveImport = create.sync({
  conditionNames: ['node', 'import', 'default'],
  mainFields: ['main'],
  extensions: ['.js', '.json', '.node'],
});

function commonJSExports(
  filename: string,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(filename)) return new Set();
  seen.add(filename);
  if (!/\.(?:c?js)$/.test(filename)) return new Set();

  try {
    const { exports, reexports } = parseCommonJS(
      fs.readFileSync(filename, 'utf8'),
    );
    const names = new Set(exports);
    for (const request of reexports) {
      try {
        const dependency = createRequire(filename).resolve(request);
        commonJSExports(dependency, seen).forEach((name) => names.add(name));
      } catch {
        // Optional or unresolved re-exports cannot be classified statically.
      }
    }
    return names;
  } catch {
    // Native ESM and unrecognized syntax must keep their original import semantics.
    return new Set();
  }
}

function needsInterop(request: string, importer: string): boolean {
  if (
    /^(?:[./#]|[a-z][\w+.-]*:)/i.test(request) ||
    builtinModules.includes(request)
  )
    return false;

  try {
    const entry = resolveImport(path.dirname(importer), request);
    if (!entry) return false;
    const names = commonJSExports(entry);
    return names.has('__esModule') && names.has('default');
  } catch {
    return false;
  }
}

/** Normalize statically identifiable transpiled CommonJS defaults after JS compilation. */
export default function defaultInterop(
  code: string,
  importer: string,
  sourceMap?: string | null,
): [string, (string | null)?] {
  const names = new Set<string>();
  const program = parseModule(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowHashBang: true,
    onToken(token) {
      if (
        token.type.label === 'name' &&
        'value' in token &&
        typeof token.value === 'string'
      ) {
        names.add(token.value);
      }
    },
  });
  const uid = (name: string) => {
    let candidate = `_${name}`;
    while (names.has(candidate)) candidate += '_';
    names.add(candidate);
    return candidate;
  };
  const helper = uid('rcDefaultInterop');
  const output = new MagicString(code);
  const declarations: string[] = [];

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    const defaults = statement.specifiers.filter(
      (specifier) =>
        specifier.type === 'ImportDefaultSpecifier' ||
        (specifier.type === 'ImportSpecifier' &&
          (specifier.imported.type === 'Identifier'
            ? specifier.imported.name
            : specifier.imported.value) === 'default'),
    );
    if (
      !defaults.length ||
      !needsInterop(String(statement.source.value), importer)
    )
      continue;

    for (const specifier of defaults) {
      const imported = uid(`${specifier.local.name}Module`);
      output.overwrite(specifier.local.start, specifier.local.end, imported);
      declarations.push(
        `var ${specifier.local.name} = ${helper}(${imported});`,
      );
    }
  }

  if (!declarations.length) return [code, sourceMap];

  let insertion = code.startsWith('#!') ? code.indexOf('\n') + 1 : 0;
  for (const statement of program.body) {
    if (statement.type !== 'ExpressionStatement' || !statement.directive) break;
    insertion = statement.end;
  }
  // TODO: Remove the bridge when the dependencies expose native ESM entries.
  // Imports are hoisted; initialize aliases before any original executable statement.
  output.appendLeft(
    insertion,
    `
function ${helper}(value) {
  return value && (typeof value === 'object' || typeof value === 'function') &&
    value.__esModule && 'default' in value ? value.default : value;
}
${declarations.join('\n')}
`,
  );

  const map = sourceMap
    ? remapping(
        [
          JSON.parse(
            output
              .generateMap({
                source: importer,
                includeContent: true,
                hires: true,
              })
              .toString(),
          ),
          JSON.parse(sourceMap),
        ],
        () => null,
      ).toString()
    : sourceMap;
  return [output.toString(), map];
}
