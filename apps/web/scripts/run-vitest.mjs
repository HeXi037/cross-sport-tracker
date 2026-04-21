import { spawnSync } from 'node:child_process';

const stripWorkspacePrefix = (arg) => {
  if (arg.startsWith('-')) {
    return arg;
  }

  if (arg.startsWith('apps/web/')) {
    return arg.slice('apps/web/'.length);
  }

  return arg;
};

const args = process.argv.slice(2).map(stripWorkspacePrefix);
const result = spawnSync('pnpm', ['exec', 'vitest', ...args], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
