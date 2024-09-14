import type { IApi } from 'father';
import { exec, execSync } from 'child_process';

// 检查是否已安装 npm 包
function checkNpmPackageInstalled(packageName: string) {
  return new Promise((resolve) => {
    exec(`npm list --depth=0 ${packageName}`, (error: Error) => {
      resolve(!error);
    });
  });
}

export default (api: IApi) => {
  // Compile break if export type without consistent
  api.onStart(async () => {
    if (api.name !== 'build') {
      return;
    }

    const inputFolder =
      api?.config?.esm?.input || api?.config?.esm?.input || 'src/';

    const isInstalled = await checkNpmPackageInstalled('eslint');
    if (isInstalled) {
      execSync(
        `npx eslint ${inputFolder} --ext .tsx,.ts --rule '@typescript-eslint/consistent-type-exports: error'`,
        {
          cwd: process.cwd(),
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
    } as typeof memo);

    return memo;
  });
};
