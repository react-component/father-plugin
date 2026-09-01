import { execSync } from 'child_process';
import type { IApi } from 'father';
import fs from 'fs-extra';
import path from 'path';

import { finalizeNativeEsmOutput, hasNativeEsmExport } from './nativeEsm';

const cwd = process.cwd();

const restrictedPackageDirectoryImports = [
  '@rc-component/*/es',
  '@rc-component/*/es/**',
  '@rc-component/*/lib',
  '@rc-component/*/lib/**',
  'rc-*/es',
  'rc-*/es/**',
  'rc-*/lib',
  'rc-*/lib/**',
];

const eslintRulesString = JSON.stringify({
  '@typescript-eslint/consistent-type-exports': 'error',
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: restrictedPackageDirectoryImports,
          message:
            'Do not import package internals from es/lib. Import from the package root.',
        },
      ],
    },
  ],
}).replace(/"/g, '\\"');

// 检查 package.json 中是否有指定的 npm 包依赖
function checkNpmPackageDependency(packageJson: any, packageName: string) {
  return !!(
    (packageJson.dependencies && packageJson.dependencies[packageName]) ||
    (packageJson.devDependencies && packageJson.devDependencies[packageName])
  );
}

export default (api: IApi) => {
  const packageJson = fs.readJsonSync(path.join(cwd, 'package.json'));
  const esmOutput = api.userConfig.esm?.output || 'es';
  const nativeEsm = hasNativeEsmExport(packageJson.exports, esmOutput);

  // Compile break if export type without consistent
  api.onStart(async () => {
    if (api.name !== 'build') {
      return;
    }

    console.log('Check Typescript exports and rc package directory imports...');

    // Break if current project not install `@rc-component/np`
    if (
      checkNpmPackageDependency(packageJson, 'np') &&
      !checkNpmPackageDependency(packageJson, '@rc-component/np')
    ) {
      console.log('Please install `@rc-component/np` instead of `np`.');
      process.exit(1);
    }

    const inputFolder =
      api?.config?.esm?.input || api?.config?.esm?.input || 'src/';

    const isEslintInstalled = checkNpmPackageDependency(packageJson, 'eslint');
    if (isEslintInstalled) {
      execSync(
        // Requires compatibility with Windows environment
        `npx eslint ${inputFolder} --ext .tsx,.ts --rule "${eslintRulesString}"`,
        {
          cwd,
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          encoding: 'utf-8',
        },
      );
    } else {
      console.log('ESLint is not installed, skip.');
    }
  });

  api.onAllBuildComplete(() => {
    if (api.name !== 'build' || !nativeEsm) {
      return;
    }

    const output = api.config.esm?.output || esmOutput;
    const rewriteCount = finalizeNativeEsmOutput(path.resolve(cwd, output));
    console.log(
      `Prepared native ESM output with ${rewriteCount} declaration specifier rewrites.`,
    );
  });

  // modify default build config for all rc projects
  api.modifyDefaultConfig((memo) => {
    Object.assign(memo, {
      esm: {
        output: 'es',
        // transform all rc-xx/lib to rc-xx/es for esm build
        extraBabelPlugins: [
          require.resolve('./babelPluginImportLib2Es'),
          ...(nativeEsm
            ? [require.resolve('./babelPluginAddEsmExtensions')]
            : []),
        ],
      },
      cjs: {
        // specific platform to browser, father 4 build cjs for node by default
        platform: 'browser',
        output: 'lib',
      },
      targets: {
        chrome: 85,
      },
    } as typeof memo);

    return memo;
  });
};
