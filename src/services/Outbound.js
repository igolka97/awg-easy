'use strict';

const Outbound = require('../lib/Outbound');
const { WG_PATH, WG_DEVICE, PROXY_URL } = require('../config');

module.exports = new Outbound({ directory: WG_PATH, device: WG_DEVICE, proxyEnabled: Boolean(PROXY_URL) });
