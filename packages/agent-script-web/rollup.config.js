// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { builtinModules } from 'module';

const external = (id) => {
  const isExternal = builtinModules.includes(id) || /^[a-z@][^:]/.test(id);
  if (isExternal) console.log('External:', id);
  return isExternal;
};

export default [
  // ESM build using tsconfig.lib.json
  {
    input: 'src/index.ts', // adjust if your entrypoint is different
    output: {
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.lib.json',
      }),
    ],
    external,
  },
  // CommonJS build using tsconfig.lib.cjs.json
  {
    input: 'src/index.ts', // adjust if your entrypoint is different
    output: {
      file: 'dist/cjs/index.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.lib.cjs.json',
      }),
    ],
    external,
  },
];
