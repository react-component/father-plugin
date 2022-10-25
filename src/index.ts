import type { IApi } from 'father';

export default (api: IApi) => {
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
