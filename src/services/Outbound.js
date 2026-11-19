'use strict';

const Outbound = require('../lib/Outbound');
const { WG_PATH, WG_DEVICE } = require('../config');

module.exports = new Outbound({ directory: WG_PATH, device: WG_DEVICE });
