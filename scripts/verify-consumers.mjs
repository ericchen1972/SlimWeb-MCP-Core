import { spawnSync } from 'node:child_process';

const checks = [
  ['/Users/eric/Documents/SlimWeb-MCP-Core', 'npm', ['test']],
  ['/Users/eric/Documents/SlimWeb-MCP', 'npm', ['test']],
  ['/Users/eric/Documents/SlimWeb-Standalone-MCP', 'npm', ['test']],
  ['/Users/eric/Documents/SlimWeb-Standalone', 'php', ['artisan', 'test']]
];

for (const [cwd, command, args] of checks) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
