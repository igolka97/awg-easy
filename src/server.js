'use strict';

const WireGuard = require('./services/WireGuard');

const Outbound = require('./services/Outbound');

Outbound.prepare()
  .then(() => WireGuard.getConfig())
  .then(() => Outbound.restore())
  // Start HTTP only after restoring the selected exit and its firewall.
  // eslint-disable-next-line global-require
  .then(() => require('./services/Server'))
  .catch((err) => {
  // eslint-disable-next-line no-console
    console.error(err);

    // eslint-disable-next-line no-process-exit
    process.exit(1);
  });

// Handle terminate signal
process.on('SIGTERM', async () => {
  // eslint-disable-next-line no-console
  console.log('SIGTERM signal received.');
  await WireGuard.Shutdown();
  // eslint-disable-next-line no-process-exit
  process.exit(0);
});

// Handle interrupt signal
process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('SIGINT signal received.');
});
