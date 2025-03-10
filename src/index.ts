import { execSync } from 'child_process';
import type { IApi } from 'father';
import fs from 'fs-extra';
import path from 'path';

const cwd = process.cwd();

// 检查 package.json 中是否有指定的 npm 包依赖
function checkNpmPackageDependency(packageJson: any, packageName: string) {
  return !!(
    (packageJson.dependencies && packageJson.dependencies[packageName]) ||
    (packageJson.devDependencies && packageJson.devDependencies[packageName])
  );
}

export default (api: IApi) => {
  // Compile break if export type without consistent
  api.onStart(async () => {
    if (api.name !== 'build') {
      return;
    }

    // Break if current project not install `@rc-component/np`
    const packageJson = await fs.readJson(path.join(cwd, 'package.json'));

    // Break if current project not install `@rc-component/np`
    if (!checkNpmPackageDependency(packageJson, '@rc-component/np')) {
      console.log('Please install `@rc-component/np` instead of `np`.');
      process.exit(1);
    }

    const inputFolder =
      api?.config?.esm?.input || api?.config?.esm?.input || 'src/';

    const isEslintInstalled = checkNpmPackageDependency(packageJson, 'eslint');
    if (isEslintInstalled) {
      execSync(
        // Requires compatibility with Windows environment
        `npx eslint ${inputFolder} --ext .tsx,.ts --rule "@typescript-eslint/consistent-type-exports: error"`,
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

  // modify default build config for all rc projects
  api.modifyDefaultConfig((memo) => {
    Object.assign(memo, {
      esm: {
        output: 'es',
        // transform all rc-xx/lib to rc-xx/es for esm build
        extraBabelPlugins: [require.resolve('./babelPluginImportLib2Es')],
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
