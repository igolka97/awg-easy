'use strict';

const net = require('node:net');
const ServerError = require('./ServerError');

const fields = {
  Interface: new Set(['PrivateKey', 'Address', 'DNS', 'MTU', 'Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4']),
  Peer: new Set(['PublicKey', 'PresharedKey', 'Endpoint', 'AllowedIPs', 'PersistentKeepalive']),
};

module.exports = function parseOutbound(text, serverAddress) {
  const invalid = (message) => {
    throw new ServerError(message, 400);
  };
  if (typeof text !== 'string' || text.length > 16384) invalid('Expected an AWG configuration up to 16 KiB.');
  const sections = {};
  let section;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const header = line.match(/^\[(Interface|Peer)\]$/);
    if (header) {
      section = header[1];
      if (sections[section]) invalid('Exactly one Interface and one Peer are required.');
      sections[section] = {};
      continue;
    }
    const entry = line.match(/^([A-Za-z0-9]+)\s*=\s*(.+)$/);
    if (!section || !entry || !fields[section].has(entry[1])) invalid('Unsupported configuration directive. Shell hooks, Table, ListenPort and SaveConfig are not allowed.');
    const [, key, value] = entry;
    if (Object.hasOwn(sections[section], key)) invalid('Duplicate configuration directive.');
    sections[section][key] = value.trim();
  }
  const iface = sections.Interface;
  const peer = sections.Peer;
  if (!iface || !peer) invalid('Exactly one Interface and one Peer are required.');
  for (const key of [iface.PrivateKey, peer.PublicKey, ...(peer.PresharedKey ? [peer.PresharedKey] : [])]) {
    if (!key || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32 || Buffer.from(key, 'base64').toString('base64') !== key) invalid('Invalid WireGuard key.');
  }
  const address = (iface.Address || '').match(/^([0-9.]+)\/(\d{1,2})$/);
  if (!address || net.isIP(address[1]) !== 4 || Number(address[2]) > 32) invalid('This version requires one IPv4 Address with a CIDR prefix.');
  // The receiving server uses a /24. Reject overlap even when the imported client uses /32.
  const numeric = (ip) => ip.split('.').reduce((n, octet) => (n * 256) + Number(octet), 0) >>> 0;
  const mask = (0xffffffff << (32 - Math.min(Number(address[2]), 24))) >>> 0;
  if (Number(address[2]) === 0 || ((numeric(address[1]) & mask) >>> 0) === ((numeric(serverAddress) & mask) >>> 0)) invalid('VPN subnets overlap. Change the client subnet on one server before importing.');
  const endpoint = (peer.Endpoint || '').match(/^([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?):([0-9]{1,5})$/);
  if (!endpoint || Number(endpoint[2]) < 1 || Number(endpoint[2]) > 65535) invalid('Endpoint must be an IPv4 address or hostname and a valid port.');
  const allowed = (peer.AllowedIPs || '').split(',').map((part) => part.trim());
  if (!allowed.includes('0.0.0.0/0') || allowed.some((part) => !['0.0.0.0/0', '::/0'].includes(part))) invalid('AllowedIPs must contain 0.0.0.0/0 (optionally ::/0). Split routes are not supported yet.');
  for (const [key, value] of Object.entries(iface)) {
    if (['PrivateKey', 'Address', 'DNS'].includes(key)) continue;
    const limit = key.startsWith('H') ? 4294967295 : 65535;
    if (!/^\d+$/.test(value) || Number(value) > limit) invalid('Invalid numeric AWG parameter.');
    if (key === 'MTU' && (Number(value) < 576 || Number(value) > 9000)) invalid('MTU must be between 576 and 9000.');
  }
  if (iface.DNS && iface.DNS.split(',').some((ip) => net.isIP(ip.trim()) === 0)) invalid('DNS entries must be IP addresses.');
  if (Number(iface.Jmin || 0) > Number(iface.Jmax || 0)) invalid('Jmin must not exceed Jmax.');
  if (peer.PersistentKeepalive && (!/^\d+$/.test(peer.PersistentKeepalive) || Number(peer.PersistentKeepalive) > 65535)) invalid('Invalid PersistentKeepalive.');
  // Only validated fields are emitted. DNS must not change the container resolver.
  const output = Object.entries(iface).filter(([key]) => !['DNS', 'Address'].includes(key)).map(([key, value]) => `${key} = ${value}`);
  return {
    address: address[1],
    endpoint: peer.Endpoint,
    config: `[Interface]\n${output.join('\n')}\nAddress = ${address[1]}/32\nTable = off\n\n[Peer]\nPublicKey = ${peer.PublicKey}\n${peer.PresharedKey ? `PresharedKey = ${peer.PresharedKey}\n` : ''}Endpoint = ${peer.Endpoint}\nAllowedIPs = 0.0.0.0/0\nPersistentKeepalive = ${Number(peer.PersistentKeepalive) || 25}\n`,
  };
};
