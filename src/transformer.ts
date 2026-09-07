import type { IFatherConfig, IJSTransformer } from 'father';
import { createRequire } from 'module';
import path from 'path';
import defaultInterop from './defaultInterop';

type Transformer = NonNullable<IJSTransformer['fn']>;

// Delegate to Father's compiler so its JSX, aliases, targets, and source maps stay in effect.
const transformer: Transformer = async function (content) {
  const { config, paths } = this;
  const loadCompiler = createRequire(path.join(paths.cwd, 'package.json'));
  const compile = loadCompiler(
    `father/dist/builder/bundless/loaders/javascript/${config.transformer}`,
  ).default;
  const result = await compile.call(this, content);
  return (config as IFatherConfig).cjsDefaultInterop === true &&
    config.format === 'esm' &&
    config.platform === 'node'
    ? defaultInterop(result[0], paths.fileAbsPath, result[1])
    : result;
};

export default transformer;
