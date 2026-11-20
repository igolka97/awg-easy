'use strict';

const parseNetworks = require('./IPv4Networks');
const ServerError = require('./ServerError');

module.exports = function parseRouting(input) {
  if (!input || !['vpn', 'direct'].includes(input.defaultExit)) {
    throw new ServerError('Choose a default exit and provide an array of IPv4 addresses or subnets.', 400);
  }
  return { defaultExit: input.defaultExit, networks: parseNetworks(input.networks) };
};
