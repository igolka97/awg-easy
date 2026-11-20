'use strict';

const Proxy = require('../lib/Proxy');
const { WG_PATH, PROXY_URL, PASSWORD_HASH } = require('../config');
const WireGuard = require('./WireGuard');

if (PROXY_URL && !PASSWORD_HASH) throw new Error('PASSWORD_HASH is required when the proxy is enabled.');

module.exports = new Proxy({
  url: PROXY_URL,
  directory: WG_PATH,
  socketPath: '/run/awg-proxy/auth.sock',
  getConfig: () => WireGuard.getConfig(),
});
