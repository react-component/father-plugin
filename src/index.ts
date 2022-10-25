import type { IApi } from 'father';

export default (api: IApi) => {
  // modify default build config for all rc projects
  api.modifyDefaultConfig((memo) => {
    Object.assign(memo, {
      esm: {
        output: 'es',
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
