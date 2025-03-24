// rollup.config.js
import typescript from '@rollup/plugin-typescript';

export default [
  // ESM build using tsconfig.lib.json
  {
    input: 'src/index.ts', // adjust if your entrypoint is different
    output: {
      file: 'dist/esm/index.js',
      format: 'esm',
      sourcemap: true,
      type: 'module',
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.lib.json',
      }),
    ],
    external: [
      /* list external dependencies to exclude from bundle */
    ],
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
    external: [
      /* list external dependencies to exclude from bundle */
    ],
  },
];
