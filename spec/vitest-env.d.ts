// vitest.config.ts sets `test.globals: true`, so `describe`/`it`/`expect`/`vi` are ambient
// at runtime. `compilerOptions.types` can't reach `vitest/globals` under `moduleResolution:
// nodenext` (it resolves types-package names outside the package.json `exports` map this
// package declares), so pull the same ambient declarations in via a normal import instead.
import "vitest/globals";
