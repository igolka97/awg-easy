'use strict';

// Explicit offline migration: stop the container and run against its mounted data.
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) throw new Error('Usage: node scripts/migrate-outbound-routing.js /path/to/config');
  const file = path.join(directory, 'outbound.json');
  const original = await fs.readFile(file, 'utf8');
  const state = JSON.parse(original);
  if (!['direct', 'vpn'].includes(state.mode) || (state.mode === 'vpn' && !state.profile)) throw new Error('Invalid outbound state; nothing changed.');
  if (Object.hasOwn(state, 'routing')) throw new Error('Routing settings already exist; nothing changed.');
  const backup = `${file}.before-ip-routing`;
  await fs.writeFile(backup, original, { mode: 0o600, flag: 'wx' });
  state.routing = { defaultExit: 'vpn', networks: [] };
  const temporary = `${file}.routing-migration`;
  await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, file);
  // eslint-disable-next-line no-console
  console.log('Routing configuration added. Original preserved as outbound.json.before-ip-routing.');
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err.message);
  process.exitCode = 1;
});
