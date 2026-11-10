'use strict';

const Outbound = require('../lib/Outbound');
const { WG_PATH } = require('../config');

module.exports = new Outbound({ directory: WG_PATH });
