/* eslint-disable mocha/handle-done-callback */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const parse = require('../lib/OutboundConfig');
const Outbound = require('../lib/Outbound');

const key = Buffer.alloc(32, 1).toString('base64');
const config = `[Interface]\nPrivateKey = ${key}\nAddress = 10.8.0.2/32\nDNS = 1.1.1.1\nJc = 4\nS3 = 12\n[Peer]\nPublicKey = ${key}\nEndpoint = exit.example.com:51820\nAllowedIPs = 0.0.0.0/0, ::/0\n`;

test('imports a single full-tunnel peer without changing resolver or routing automatically', () => {
  const result = parse(config, '10.9.0.1');
  assert.equal(result.endpoint, 'exit.example.com:51820');
  assert.match(result.config, /Table = off/);
  assert.match(result.config, /S3 = 12/);
  assert.doesNotMatch(result.config, /DNS|::\/0/);
});

test('rejects commands, duplicate sections, keys, partial routes and overlapping networks', () => {
  for (const invalid of [
    config.replace('DNS = 1.1.1.1', 'PostUp = touch /tmp/owned'),
    config.replace('DNS = 1.1.1.1', 'Table = auto'),
    `${config}\n[Peer]\nPublicKey = ${key}`,
    config.replace('Jc = 4', 'Jc = 4;id'),
    config.replace('exit.example.com', '$(id)'),
    config.replace('0.0.0.0/0, ::/0', '10.0.0.0/8'),
    config.replace(key, 'invalid'),
    config.replace('10.8.0.2/32', '10.9.0.2/32'),
    config.replace('10.8.0.2/32', '10.8.0.2/8'),
  ]) assert.throws(() => parse(invalid, '10.9.0.1'));
});

test('activation failure stays selected and guarded; status never returns secrets', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-outbound-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [];
  const exit = new Outbound({
    directory,
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      if (args.includes('-C') || cmd === 'wg-quick') throw new Error('test failure');
      return '';
    },
  });
  await exit.prepare();
  await exit.change('import', { name: 'Amsterdam', config }, '10.9.0.1');
  await assert.rejects(exit.change('mode', { mode: 'vpn' }, '10.9.0.1'));
  assert.equal((await exit.status()).mode, 'vpn');
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'outbound.json'))).mode, 'vpn');
  assert.equal(calls.filter(([, args]) => args.includes('-D')).length, 0);
  assert.equal(calls.filter(([, args]) => args.includes('-I')).length, 2);
  assert.ok(!JSON.stringify(await exit.status()).includes(key));
  assert.equal((await fs.stat(path.join(directory, 'outbound.json'))).mode & 0o777, 0o600);
  await assert.rejects(exit.change('import', { name: 'Other', config }, '10.9.0.1'), /direct/);
});

test('invalid persisted state fails startup instead of reverting to direct access', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-outbound-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'outbound.json'), '{broken');
  const exit = new Outbound({ directory, run: async () => '' });
  await assert.rejects(exit.prepare());
});
