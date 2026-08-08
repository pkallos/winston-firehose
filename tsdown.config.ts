import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // tsdown owns package.json's `exports`/`main`/`module`/`types` fields and rewrites them on
  // every build from entry/format/outExtensions below. Don't hand-edit those fields.
  exports: true,
  publint: true,
  attw: true,
  outExtensions: ({ format }) =>
    format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : { js: '.js', dts: '.d.ts' },
});
