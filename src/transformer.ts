import type { IFatherConfig, IJSTransformer } from 'father';
import { createRequire } from 'module';
import path from 'path';
import defaultInterop from './defaultInterop';

type Transformer = NonNullable<IJSTransformer['fn']>;

// Delegate to Father's compiler so its JSX, aliases, targets, and source maps stay in effect.
const transformer: Transformer = async function (content) {
  const loadCompiler = createRequire(path.join(this.paths.cwd, 'package.json'));
  const original = loadCompiler(
    `father/dist/builder/bundless/loaders/javascript/${this.config.transformer}`,
  );
  const result = await (original.default || original).call(this, content);
  const config = this.config as typeof this.config &
    Pick<IFatherConfig, 'cjsDefaultInterop'>;
  if (
    config.cjsDefaultInterop !== true ||
    config.format !== 'esm' ||
    config.platform !== 'node'
  )
    return result;
  return defaultInterop(result[0], this.paths.fileAbsPath, result[1]);
};

export default transformer;
