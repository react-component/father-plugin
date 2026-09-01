import fs from 'fs-extra';
import path from 'path';

const sourceExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs'];
const declarationExtensions = ['.d.ts', '.d.mts', '.d.cts'];
const runtimeExtensions = ['.js', '.mjs', '.cjs'];
const moduleSpecifierPattern =
  /(\b(?:from|import|require)\s*(?:\(\s*)?)(['"])(\.\.?(?:\/[^'"]*)?)\2(\s*\)?)/g;

function hasExtension(specifier: string) {
  return Boolean(path.extname(specifier));
}

function normalizeOutputDirectory(output: string) {
  return output
    .replace(/^\.\//, '')
    .replace(/[\\/]$/, '')
    .replace(/\\/g, '/');
}

function targetUsesOutput(target: unknown, output: string): boolean {
  if (Array.isArray(target)) {
    return target.some((item) => targetUsesOutput(item, output));
  }

  if (typeof target !== 'string') {
    return false;
  }

  const normalizedOutput = normalizeOutputDirectory(output);
  return (
    target === `./${normalizedOutput}` ||
    target.startsWith(`./${normalizedOutput}/`)
  );
}

export function hasNativeEsmExport(
  exportsField: unknown,
  output: string,
): boolean {
  if (!exportsField || typeof exportsField !== 'object') {
    return false;
  }

  return Object.entries(exportsField).some(([condition, target]) => {
    if (condition === 'import') {
      return targetUsesOutput(target, output);
    }

    return hasNativeEsmExport(target, output);
  });
}

function isSourceFile(absoluteSpecifier: string) {
  return sourceExtensions.some((extension) =>
    fs.existsSync(`${absoluteSpecifier}${extension}`),
  );
}

function isSourceDirectory(absoluteSpecifier: string) {
  return sourceExtensions.some((extension) =>
    fs.existsSync(path.join(absoluteSpecifier, `index${extension}`)),
  );
}

function getPackageName(specifier: string) {
  const segments = specifier.split('/');
  return specifier.startsWith('@')
    ? segments.slice(0, 2).join('/')
    : segments[0];
}

function findPackage(
  resolvedPath: string,
  packageName: string,
): { directory: string; packageJson: any } | undefined {
  let directory = path.dirname(resolvedPath);

  while (true) {
    const packageJsonPath = path.join(directory, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = fs.readJsonSync(packageJsonPath);
      if (packageJson.name === packageName) {
        return { directory, packageJson };
      }
    }

    const parentDirectory = path.dirname(directory);
    if (parentDirectory === directory) {
      return undefined;
    }
    directory = parentDirectory;
  }
}

function resolvePackageEsmSpecifier(filePath: string, specifier: string) {
  const packageName = getPackageName(specifier);
  if (!packageName || specifier === packageName) {
    return specifier;
  }

  let resolvedPath: string;
  try {
    resolvedPath = require.resolve(specifier, {
      paths: [path.dirname(filePath)],
    });
  } catch {
    return specifier;
  }

  const packageInfo = findPackage(resolvedPath, packageName);
  if (
    !packageInfo ||
    Object.prototype.hasOwnProperty.call(packageInfo.packageJson, 'exports')
  ) {
    return specifier;
  }

  const packagePath = path
    .relative(packageInfo.directory, resolvedPath)
    .replace(/\\/g, '/');
  if (
    packagePath.startsWith('../') ||
    !runtimeExtensions.includes(path.extname(packagePath))
  ) {
    return specifier;
  }

  return `${packageName}/${packagePath}`;
}

export function resolveSourceEsmSpecifier(filePath: string, specifier: string) {
  if (!specifier.startsWith('.')) {
    return resolvePackageEsmSpecifier(filePath, specifier);
  }

  const absoluteSpecifier = path.resolve(path.dirname(filePath), specifier);
  if (
    fs.existsSync(absoluteSpecifier) &&
    fs.statSync(absoluteSpecifier).isFile()
  ) {
    return specifier;
  }

  if (isSourceFile(absoluteSpecifier)) {
    return `${specifier}.js`;
  }

  if (isSourceDirectory(absoluteSpecifier)) {
    return `${specifier.replace(/\/$/, '')}/index.js`;
  }

  if (hasExtension(specifier)) {
    return specifier;
  }

  throw new Error(
    `Cannot resolve native ESM import ${specifier} from ${path.relative(process.cwd(), filePath)}`,
  );
}

function collectDeclarationFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectDeclarationFiles(entryPath);
    }

    return entry.isFile() &&
      declarationExtensions.some((extension) => entry.name.endsWith(extension))
      ? [entryPath]
      : [];
  });
}

function resolveDeclarationSpecifier(filePath: string, specifier: string) {
  if (!specifier.startsWith('.')) {
    return specifier;
  }

  const absoluteSpecifier = path.resolve(path.dirname(filePath), specifier);
  if (
    fs.existsSync(absoluteSpecifier) &&
    fs.statSync(absoluteSpecifier).isFile()
  ) {
    return specifier;
  }

  const fileExists =
    fs.existsSync(`${absoluteSpecifier}.js`) ||
    declarationExtensions.some((extension) =>
      fs.existsSync(`${absoluteSpecifier}${extension}`),
    );
  if (fileExists) {
    return `${specifier}.js`;
  }

  const indexExists =
    fs.existsSync(path.join(absoluteSpecifier, 'index.js')) ||
    declarationExtensions.some((extension) =>
      fs.existsSync(path.join(absoluteSpecifier, `index${extension}`)),
    );
  if (indexExists) {
    return `${specifier.replace(/\/$/, '')}/index.js`;
  }

  if (hasExtension(specifier)) {
    return specifier;
  }

  throw new Error(
    `Cannot resolve native ESM declaration ${specifier} from ${path.relative(process.cwd(), filePath)}`,
  );
}

function writeEsmPackageJson(directory: string) {
  const packageJsonPath = path.join(directory, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath)
    ? fs.readJsonSync(packageJsonPath)
    : {};

  if (packageJson.type !== 'module') {
    fs.writeJsonSync(
      packageJsonPath,
      { ...packageJson, type: 'module' },
      { spaces: 2 },
    );
  }
}

export function finalizeNativeEsmOutput(directory: string) {
  let rewriteCount = 0;

  collectDeclarationFiles(directory).forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');
    const rewrittenSource = source.replace(
      moduleSpecifierPattern,
      (match, prefix, quote, specifier, suffix) => {
        const rewrittenSpecifier = resolveDeclarationSpecifier(
          filePath,
          specifier,
        );
        if (rewrittenSpecifier !== specifier) {
          rewriteCount += 1;
        }
        return `${prefix}${quote}${rewrittenSpecifier}${quote}${suffix}`;
      },
    );

    if (rewrittenSource !== source) {
      fs.writeFileSync(filePath, rewrittenSource);
    }
  });

  writeEsmPackageJson(directory);
  return rewriteCount;
}
