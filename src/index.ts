import chalk from 'chalk';
import { ESLint } from 'eslint';
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

    console.log('Check Typescript exports...');

    // Break if current project not install `@rc-component/np`
    const packageJson = await fs.readJson(path.join(cwd, 'package.json'));

    if (
      checkNpmPackageDependency(packageJson, 'np') &&
      !checkNpmPackageDependency(packageJson, '@rc-component/np')
    ) {
      console.log('Please install `@rc-component/np` instead of `np`.');
      process.exit(1);
    }

    const inputFolder =
      api?.config?.esm?.input || api?.config?.esm?.input || 'src/';

    const eslint = new ESLint({
      useEslintrc: false,
      errorOnUnmatchedPattern: false,
      overrideConfig: {
        ignorePatterns: ['__tests__', 'demo', 'locale'],
        rules: {
          '@typescript-eslint/consistent-type-exports': ['error'],
        },
        parser: '@typescript-eslint/parser',
        parserOptions: {
          ecmaVersion: 2021,
          sourceType: 'module',
          project: './tsconfig.json',
        },
        plugins: ['@typescript-eslint'],
      },
      extensions: ['tsx', 'ts'],
    });

    const results = await eslint.lintFiles([inputFolder]);

    // Collect eslint errors
    interface ErrorInfo {
      line: number;
      text: string;
      error: string;
    }
    const errorMessages: {
      filePath: string;
      errors: ErrorInfo[];
    }[] = [];

    results.forEach((result) => {
      const fullText = result.source || '';
      const textLines = fullText.split('\n');

      const errorInfos: ErrorInfo[] = [];

      result.messages.forEach((message) => {
        if (/Definition for rule .* was not found./.test(message.message)) {
          return;
        }

        errorInfos.push({
          line: message.line,
          text: textLines[message.line - 1],
          error: message.message,
        });
      });

      if (errorInfos.length) {
        errorMessages.push({
          filePath: result.filePath,
          errors: errorInfos,
        });
      }
    });

    if (errorMessages.length) {
      console.log('');
      console.log(chalk.red('Eslint errors:'));

      errorMessages.forEach((error) => {
        console.log(chalk.yellow(`${error.filePath}`));
        error.errors.forEach((item) => {
          console.log(`${item.line}: ${item.text.trim()}`);
          console.log(chalk.gray(`${item.error}`));
        });
        console.log('');
      });

      process.exit(1);
    }
  });

  // modify default build config for all rc projects
  if (!process.env.CHECK_TS_ONLY) {
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
  }
};
