'use strict';

const { isIPv4 } = require('node:net');
const ServerError = require('./ServerError');

module.exports = function parseNetworks(input) {
  if (!Array.isArray(input)) throw new ServerError('Provide an array of IPv4 addresses or subnets.', 400);
  let bytes = 0;
  const networks = input.map((entry) => {
    if (typeof entry !== 'string') throw new ServerError('Each destination must be an IPv4 address or CIDR subnet.', 400);
    bytes += Buffer.byteLength(entry, 'utf8') + 1;
    if (bytes > 1024 * 1024) throw new ServerError('The destination list exceeds 1 MiB. Nothing was applied.', 413);
    const match = entry.trim().match(/^([0-9.]+)(?:\/(\d|[12]\d|3[0-2]))?$/);
    if (!match || !isIPv4(match[1])) throw new ServerError('Invalid IPv4 destination. Domains and IPv6 are not supported.', 400);
    const prefix = match[2] === undefined ? 32 : Number(match[2]);
    const ip = match[1].split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
    const network = prefix === 0 ? 0 : (ip & (0xffffffff << (32 - prefix))) >>> 0;
    return `${[24, 16, 8, 0].map((shift) => (network >>> shift) & 255).join('.')}/${prefix}`;
  });
  const unique = [...new Set(networks)];
  if (Buffer.byteLength(unique.join('\n'), 'utf8') + (unique.length ? 1 : 0) > 1024 * 1024) throw new ServerError('The normalized destination list exceeds 1 MiB. Nothing was applied.', 413);
  return unique;
};
