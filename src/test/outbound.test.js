/* eslint-disable mocha/handle-done-callback */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { Readable } = require('node:stream');
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
      if (cmd === 'ip' && args[0] === '-j') return '[]';
      if (args.includes('-C') || cmd === 'wg-quick') throw new Error('test failure');
      return '';
    },
  });
  await exit.prepare();
  await exit.change('import', { name: 'Amsterdam', config }, '10.9.0.1');
  await assert.rejects(exit.change('mode', { mode: 'vpn' }, '10.9.0.1'));
  assert.equal((await exit.status()).mode, 'vpn');
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, 'outbound.json'))).mode, 'vpn');
  assert.ok(calls.some(([cmd, args]) => cmd === 'ip' && args.includes('unreachable')));
  assert.ok(calls.some(([cmd, args]) => cmd === 'iptables' && args.includes('AWG-EXIT') && args.includes('REJECT')));
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

const parseRouting = require('../lib/OutboundRouting');
const readOutboundBody = require('../lib/OutboundBody');

test('routing canonicalizes hosts and subnets, deduplicates, and accepts both defaults', () => {
  for (const defaultExit of ['vpn', 'direct']) {
    assert.deepEqual(parseRouting({ defaultExit, networks: [' 1.1.1.1 ', '1.1.1.1/32', '198.51.100.23/24', '8.8.8.8/0'] }), {
      defaultExit, networks: ['1.1.1.1/32', '198.51.100.0/24', '0.0.0.0/0'],
    });
    assert.deepEqual(parseRouting({ defaultExit, networks: [] }), { defaultExit, networks: [] });
  }
});

test('routing rejects malformed contracts and addresses before any network changes', async () => {
  for (const networks of [['1.1.1.1/33'], ['::1'], ['example.com'], ['01.1.1.1'], ['1.1.1.1;id'], [null]]) {
    assert.throws(() => parseRouting({ defaultExit: 'vpn', networks }));
  }
  assert.throws(() => parseRouting({ defaultExit: 'other', networks: [] }));
  assert.throws(() => parseRouting({ defaultExit: 'vpn', networks: '1.1.1.1' }));
  const exit = new Outbound({ run: async () => assert.fail('Invalid input must not touch networking') });
  await assert.rejects(exit.change('routing', { routing: { defaultExit: 'vpn', networks: ['bad'] } }));
  assert.deepEqual(exit.state.routing, { defaultExit: 'vpn', networks: [] });
});

test('an old saved configuration requires explicit migration', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-routing-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'outbound.json'), JSON.stringify({ mode: 'direct', profile: null }));
  const exit = new Outbound({ directory, run: async () => assert.fail('No network changes before validation') });
  await assert.rejects(exit.prepare(), /explicit offline routing migration/);
});

for (const defaultExit of ['vpn', 'direct']) {
  test(`routing survives restart with ${defaultExit} default and applies both paths`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-routing-test-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    const calls = [];
    const run = async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'ip' && args[0] === '-j') return '[]';
      if (args.includes('-C')) throw new Error('Rule absent');
      return '';
    };
    const exit = new Outbound({ directory, run });
    await exit.change('routing', { routing: { defaultExit, networks: ['198.51.100.9/24'] } });
    const restored = new Outbound({ directory, run });
    await restored.prepare();
    assert.deepEqual(restored.state.routing, { defaultExit, networks: ['198.51.100.0/24'] });
    restored.state.mode = 'vpn';
    await restored.applyRouting();
    const routes = calls.filter(([cmd, args]) => cmd === 'ip' && args[1] === 'add').map(([, args]) => args);
    assert.equal(routes.length, 1);
    assert.ok(routes[0].includes('fwmark'));
    assert.equal(routes[0].at(-1), '51830');
    const marks = calls.filter(([cmd, args]) => cmd === 'iptables' && args.includes('--set-xmark')).map(([, args]) => args);
    assert.equal(marks.length, 2);
    assert.equal(marks[0].at(-1), defaultExit === 'vpn' ? '0x1000000/0x1000000' : '0x0/0x1000000');
    assert.ok(marks[1].includes('--match-set'));
    assert.equal(marks[1].at(-1), defaultExit === 'vpn' ? '0x0/0x1000000' : '0x1000000/0x1000000');
    assert.ok(calls.some(([cmd, args]) => cmd === 'ipset' && args[0] === 'swap'));
  });
}

test('a routing apply failure keeps the transition guard in place', async () => {
  let released = false;
  const exit = new Outbound({
    run: async (cmd, args) => {
      if (args.includes('-C')) throw new Error('Rule absent');
      if (cmd === 'ip' && args[0] === '-j') throw new Error('Cannot read routes');
      if (cmd === 'iptables' && args.includes('-D')) released = true;
      return '';
    },
  });
  exit.state.mode = 'vpn';
  await assert.rejects(exit.applyRouting(), /Cannot read routes/);
  assert.equal(released, false);
});

test('explicit migration preserves old state and backup, and refuses a second run', async (t) => {
  const execute = promisify(execFile);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-migration-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = JSON.stringify({ mode: 'vpn', profile: { config, name: 'Amsterdam' } });
  const file = path.join(directory, 'outbound.json');
  await fs.writeFile(file, original);
  const script = path.join(__dirname, '../scripts/migrate-outbound-routing.js');
  await execute(process.execPath, [script, directory]);
  assert.equal(await fs.readFile(`${file}.before-ip-routing`, 'utf8'), original);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), {
    ...JSON.parse(original), routing: { defaultExit: 'vpn', networks: [] },
  });
  assert.equal((await fs.stat(`${file}.before-ip-routing`)).mode & 0o777, 0o600);
  await assert.rejects(execute(process.execPath, [script, directory]));
});

test('large routing lists are accepted and oversized payloads are rejected without truncation', () => {
  const networks = Array.from({ length: 20000 }, (_, i) => `10.${i >>> 8}.${i & 255}.0/24`);
  assert.equal(parseRouting({ defaultExit: 'vpn', networks }).networks.length, 20000);
  assert.throws(() => parseRouting({ defaultExit: 'vpn', networks: Array(100000).fill('192.0.2.1/32') }), (err) => err.statusCode === 413);
});

test('bounded outbound JSON reader rejects malformed and oversized chunked requests', async () => {
  assert.deepEqual(await readOutboundBody(Readable.from([Buffer.from('{"action":"check"}')])), { action: 'check' });
  await assert.rejects(readOutboundBody(Readable.from([Buffer.from('{bad')])), (err) => err.statusCode === 400);
  await assert.rejects(readOutboundBody(Readable.from([Buffer.alloc(1024 * 1024), Buffer.alloc(1024 * 1024 + 1)])), (err) => err.statusCode === 413);
});

test('large list update loads an inactive set and swaps without touching live firewall or routes', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-ipset-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [];
  let restore;
  const exit = new Outbound({
    directory,
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      if (args.includes('restore')) restore = await fs.readFile(args.at(-1), 'utf8');
      return '';
    },
  });
  exit.state.mode = 'vpn';
  exit.routingReady = true;
  const networks = Array.from({ length: 20000 }, (_, i) => `10.${i >>> 8}.${i & 255}.0/24`);
  await exit.change('routing', { routing: { defaultExit: 'vpn', networks } });
  assert.equal(calls.filter(([cmd]) => cmd !== 'ipset').length, 0);
  assert.equal(calls.filter(([, args]) => args[0] === 'swap').length, 1);
  assert.equal(restore.split('\n').filter((line) => line.startsWith('add ')).length, 20000);
  assert.ok(restore.startsWith('flush awg-exit-staging\n'));
  assert.equal(exit.state.routing.networks.length, 20000);
});

test('failed staging leaves live rules and saved configuration untouched', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-ipset-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const calls = [];
  const exit = new Outbound({
    directory,
    run: async (cmd, args) => {
      calls.push([cmd, args]);
      if (args.includes('restore')) throw new Error('Set import failed');
      return '';
    },
  });
  exit.state.mode = 'vpn';
  exit.routingReady = true;
  await exit.persist();
  const before = await fs.readFile(path.join(directory, 'outbound.json'), 'utf8');
  await assert.rejects(exit.change('routing', { routing: { defaultExit: 'vpn', networks: ['1.1.1.1'] } }), /Set import failed/);
  assert.equal(await fs.readFile(path.join(directory, 'outbound.json'), 'utf8'), before);
  assert.ok(calls.every(([cmd, args]) => cmd === 'ipset' && args[0] !== 'swap'));
});

test('failed atomic swap restores saved state and leaves the old live set intact', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'awg-ipset-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const exit = new Outbound({
    directory,
    run: async (cmd, args) => {
      if (cmd === 'ipset' && args[0] === 'swap') throw new Error('Swap failed');
      return '';
    },
  });
  exit.state.mode = 'vpn';
  exit.routingReady = true;
  await exit.persist();
  const before = await fs.readFile(path.join(directory, 'outbound.json'), 'utf8');
  await assert.rejects(exit.change('routing', { routing: { defaultExit: 'vpn', networks: ['1.1.1.1'] } }), /Swap failed/);
  assert.equal(await fs.readFile(path.join(directory, 'outbound.json'), 'utf8'), before);
  assert.deepEqual(exit.state.routing.networks, []);
});
