'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const parseOutbound = require('./OutboundConfig');
const parseRouting = require('./OutboundRouting');
const parseNetworks = require('./IPv4Networks');
const ServerError = require('./ServerError');

const execute = promisify(execFile);

module.exports = class Outbound {

  constructor({ directory, run, device = 'eth0' } = {}) {
    this.directory = directory;
    this.device = device;
    this.run = run || (async (command, args) => {
      if (process.platform !== 'linux') throw new ServerError('VPN exits require Linux.', 503);
      try {
        const { stdout } = await execute(command, args, { timeout: 20000, maxBuffer: 65536 });
        return stdout.trim();
      } catch (err) {
        // Never expose command output: awg-quick errors can contain private keys.
        throw new ServerError(`${command} failed. Check VPN configuration and container network permissions.`, 503);
      }
    });
    this.state = {
      mode: 'direct', profile: null, blockedNetworks: [], routing: { defaultExit: 'vpn', networks: [] },
    };
    this.error = null;
    this.busy = false;
    this.routingReady = false;
  }

  async prepare() {
    try {
      this.state = JSON.parse(await fs.readFile(path.join(this.directory, 'outbound.json'), 'utf8'));
      if (!['direct', 'vpn'].includes(this.state.mode) || (this.state.mode === 'vpn' && !this.state.profile)) throw new Error('Invalid outbound state');
      if (!this.state.routing) throw new Error('Missing IP routing settings. Run the explicit offline routing migration before upgrading.');
      this.state.routing = parseRouting(this.state.routing);
      this.state.blockedNetworks = Object.hasOwn(this.state, 'blockedNetworks') ? parseNetworks(this.state.blockedNetworks) : [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    // Install the guard before the receiving interface becomes available on startup.
    if (this.state.mode === 'vpn') await this.guard(true);
    if (this.state.blockedNetworks.length) {
      await this.stageBlocking(this.state.blockedNetworks);
      await this.run('ipset', ['swap', 'awg-block-staging', 'awg-block-networks']);
    }
  }

  async persist() {
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, 'outbound.json');
    await fs.writeFile(`${target}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
    await fs.rename(`${target}.tmp`, target);
  }

  async guard(enabled) {
    for (const [binary, rule] of [
      ['iptables', ['-i', 'wg0', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'REJECT']],
      ['ip6tables', ['-i', 'wg0', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'REJECT']],
    ]) {
      let exists = true;
      try {
        await this.run(binary, ['-w', '5', '-C', 'FORWARD', ...rule]);
      } catch {
        exists = false;
      }
      if (enabled && !exists) await this.run(binary, ['-w', '5', '-I', 'FORWARD', '1', ...rule]);
      if (!enabled && exists) await this.run(binary, ['-w', '5', '-D', 'FORWARD', ...rule]);
    }
  }

  async tunnel() {
    const file = path.join(this.directory, 'awgout.conf');
    const interfaces = (await this.run('wg', ['show', 'interfaces'])).split(/\s+/);
    if (!interfaces.includes('awgout')) {
      await fs.writeFile(file, this.state.profile.config, { mode: 0o600 });
      await this.run('wg-quick', ['up', file]);
    }
    await this.run('ip', ['route', 'replace', 'unreachable', 'default', 'metric', '32760', 'table', '51830']);
    await this.run('ip', ['route', 'replace', 'default', 'dev', 'awgout', 'metric', '10', 'table', '51830']);
    // The oif rule serves probes bound to awgout; unbound host traffic is unchanged.
    const rules = await this.run('ip', ['rule', 'show']);
    if (!rules.includes('oif awgout lookup 51830')) await this.run('ip', ['rule', 'add', 'priority', '10001', 'oif', 'awgout', 'lookup', '51830']);
    const nat = ['-o', 'awgout', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'MASQUERADE'];
    let exists = true;
    try {
      await this.run('iptables', ['-w', '5', '-t', 'nat', '-C', 'POSTROUTING', ...nat]);
    } catch {
      exists = false;
    }
    if (!exists) await this.run('iptables', ['-w', '5', '-t', 'nat', '-A', 'POSTROUTING', ...nat]);
  }

  async stageNetworks(entries, name) {
    // Load only the inactive set; a partial restore never alters live traffic.
    const options = ['hash:net', 'family', 'inet', 'maxelem', '262144'];
    await this.run('ipset', ['create', `${name}-networks`, ...options, '-exist']);
    await this.run('ipset', ['create', `${name}-staging`, ...options, '-exist']);
    const networks = entries.flatMap((network) => (network === '0.0.0.0/0' ? ['0.0.0.0/1', '128.0.0.0/1'] : [network]));
    await fs.mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${name}.ipset`);
    try {
      await fs.writeFile(file, `flush ${name}-staging\n${networks.map((network) => `add ${name}-staging ${network}`).join('\n')}\n`, { mode: 0o600 });
      await this.run('ipset', ['-exist', 'restore', '-file', file]);
    } finally {
      await fs.rm(file, { force: true });
    }
  }

  async stageBlocking(networks) {
    await this.stageNetworks(networks, 'awg-block');
    // PREROUTING also covers local destinations and established connections.
    const rule = ['-i', 'wg0', '-m', 'set', '--match-set', 'awg-block-networks', 'dst', '-j', 'DROP'];
    let exists = true;
    try {
      await this.run('iptables', ['-w', '5', '-t', 'mangle', '-C', 'PREROUTING', ...rule]);
    } catch {
      exists = false;
    }
    if (!exists) await this.run('iptables', ['-w', '5', '-t', 'mangle', '-I', 'PREROUTING', '1', ...rule]);
  }

  async applyRouting() {
    this.routingReady = false;
    // Only enabling/disabling or changing the default exit requires a brief guard.
    await this.guard(true);
    for (const [table, chain, parent] of [['filter', 'AWG-EXIT', 'FORWARD'], ['mangle', 'AWG-CLASSIFY', 'PREROUTING']]) {
      let exists = true;
      try {
        await this.run('iptables', ['-w', '5', '-t', table, '-S', chain]);
      } catch {
        exists = false;
      }
      if (!exists) await this.run('iptables', ['-w', '5', '-t', table, '-N', chain]);
      await this.run('iptables', ['-w', '5', '-t', table, '-F', chain]);
      const jump = ['-i', 'wg0', '-j', chain];
      let attached = true;
      try {
        await this.run('iptables', ['-w', '5', '-t', table, '-C', parent, ...jump]);
      } catch {
        attached = false;
      }
      if (this.state.mode === 'vpn' && !attached) await this.run('iptables', ['-w', '5', '-t', table, '-I', parent, table === 'filter' ? '2' : '1', ...jump]);
      if (this.state.mode === 'direct' && attached) await this.run('iptables', ['-w', '5', '-t', table, '-D', parent, ...jump]);
    }
    const rules = JSON.parse(await this.run('ip', ['-j', 'rule', 'show']));
    for (const rule of rules.filter((entry) => entry.priority === 10000)) {
      await this.run('ip', ['rule', 'del', 'priority', String(rule.priority)]);
    }
    if (this.state.mode === 'vpn') {
      await this.run('ip', ['route', 'replace', 'unreachable', 'default', 'metric', '32760', 'table', '51830']);
      await this.run('ipset', ['swap', 'awg-exit-staging', 'awg-exit-networks']);
      const vpnDefault = this.state.routing.defaultExit === 'vpn';
      // Reserve one mark bit, recomputed per packet; other mark bits are preserved.
      await this.run('iptables', ['-w', '5', '-t', 'mangle', '-A', 'AWG-CLASSIFY', '-j', 'MARK', '--set-xmark', `${vpnDefault ? '0x1000000' : '0x0'}/0x1000000`]);
      await this.run('iptables', ['-w', '5', '-t', 'mangle', '-A', 'AWG-CLASSIFY', '-m', 'set', '--match-set', 'awg-exit-networks', 'dst', '-j', 'MARK', '--set-xmark', `${vpnDefault ? '0x0' : '0x1000000'}/0x1000000`]);
      await this.run('iptables', ['-w', '5', '-A', 'AWG-EXIT', '-m', 'mark', '--mark', '0x1000000/0x1000000', '-o', 'awgout', '-j', 'RETURN']);
      await this.run('iptables', ['-w', '5', '-A', 'AWG-EXIT', '-m', 'mark', '--mark', '0x0/0x1000000', '-o', this.device, '-j', 'RETURN']);
      await this.run('iptables', ['-w', '5', '-A', 'AWG-EXIT', '-j', 'REJECT']);
      await this.run('ip', ['rule', 'add', 'priority', '10000', 'iif', 'wg0', 'fwmark', '0x1000000/0x1000000', 'lookup', '51830']);
      // Both routing and forwarding use the packet's mark, not a second set lookup.
      await this.run('iptables', ['-w', '5', '-D', 'FORWARD', '-i', 'wg0', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'REJECT']);
      this.routingReady = true;
    } else {
      await this.guard(false);
    }
  }

  async restore(staged = false) {
    if (this.state.mode !== 'vpn') return;
    this.error = null;
    try {
      if (!staged) await this.stageNetworks(this.state.routing.networks, 'awg-exit');
      await this.guard(true);
    } catch (err) {
      this.error = err.message;
      return;
    }
    try {
      await this.tunnel();
    } catch (err) {
      this.error = err.message;
    }
    // Direct destinations must remain usable even when tunnel startup failed.
    try {
      await this.applyRouting();
    } catch (err) {
      this.error = err.message;
    }
  }

  async status() {
    let handshake = null;
    if (this.state.profile) {
      try {
        const output = await this.run('wg', ['show', 'awgout', 'latest-handshakes']);
        const timestamp = Number(output.split(/\s+/)[1]);
        if (timestamp > 0) handshake = timestamp;
      } catch { /* An imported profile need not be running. */ }
    }
    return {
      mode: this.state.mode,
      blockedNetworks: [...this.state.blockedNetworks],
      routing: { ...this.state.routing, networks: [...this.state.routing.networks] },
      profile: this.state.profile ? { name: this.state.profile.name, endpoint: this.state.profile.endpoint } : null,
      handshake,
      connected: handshake !== null && (Date.now() / 1000) - handshake < 180,
      error: this.error,
    };
  }

  async change(action, input, serverAddress) {
    if (this.busy) throw new ServerError('Another VPN exit operation is in progress.', 409);
    this.busy = true;
    try {
      if (action === 'import') {
        if (this.state.mode !== 'direct') throw new ServerError('Select direct access before replacing the VPN exit.', 409);
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new ServerError('Enter an exit name (1–80 characters).', 400);
        const profile = { ...parseOutbound(input.config, serverAddress), name: input.name.trim() };
        await this.stopTunnel();
        this.state.profile = profile;
        await this.persist();
        this.error = null;
      } else if (action === 'blocking') {
        const networks = parseNetworks(input.blockedNetworks);
        await this.stageBlocking(networks);
        const previous = this.state.blockedNetworks;
        this.state.blockedNetworks = networks;
        try {
          await this.persist();
          await this.run('ipset', ['swap', 'awg-block-staging', 'awg-block-networks']);
        } catch (err) {
          this.state.blockedNetworks = previous;
          await this.persist();
          throw err;
        }
      } else if (action === 'routing') {
        const routing = parseRouting(input.routing);
        const previous = this.state.routing;
        const swapOnly = this.state.mode === 'vpn' && this.routingReady && previous.defaultExit === routing.defaultExit;
        if (this.state.mode === 'vpn') await this.stageNetworks(routing.networks, 'awg-exit');
        this.state.routing = routing;
        try {
          await this.persist();
          if (swapOnly) await this.run('ipset', ['swap', 'awg-exit-staging', 'awg-exit-networks']);
        } catch (err) {
          this.state.routing = previous;
          await this.persist();
          throw err;
        }
        if (this.state.mode === 'vpn' && !swapOnly) {
          await this.restore(true);
          if (this.error) throw new ServerError(this.error, 503);
        }
      } else if (action === 'mode') {
        if (!['direct', 'vpn'].includes(input.mode)) throw new ServerError('Invalid exit mode.', 400);
        if (input.mode === 'vpn') {
          if (!this.state.profile) throw new ServerError('Import a VPN configuration first.', 400);
          await this.guard(true);
          this.state.mode = 'vpn';
          await this.persist();
          await this.restore();
          if (this.error) throw new ServerError(this.error, 503);
        } else {
          await this.guard(true);
          this.state.mode = 'direct';
          try {
            await this.persist();
          } catch (err) {
            this.state.mode = 'vpn';
            throw err;
          }
          await this.applyRouting();
          this.error = null;
        }
      } else if (action === 'check') {
        if (!this.state.profile) throw new ServerError('Import a VPN configuration first.', 400);
        await this.tunnel();
        let internet = false;
        let exitIp = null;
        try {
          const trace = await this.run('curl', ['--interface', 'awgout', '--connect-timeout', '5', '--max-time', '10', '--fail', '--silent', '--show-error', 'https://1.1.1.1/cdn-cgi/trace']);
          exitIp = trace.match(/^ip=([0-9.]+)$/m)?.[1] || null;
          internet = exitIp !== null;
        } catch { /* Report probe failure separately from handshake status. */ }
        return { ...await this.status(), internet, exitIp };
      } else if (action === 'delete') {
        if (this.state.mode !== 'direct') throw new ServerError('Select direct access before deleting the VPN exit.', 409);
        await this.stopTunnel();
        this.state.profile = null;
        await this.persist();
        this.error = null;
      } else {
        throw new ServerError('Unknown VPN exit action.', 400);
      }
      return await this.status();
    } finally {
      this.busy = false;
    }
  }

  async stopTunnel() {
    const interfaces = (await this.run('wg', ['show', 'interfaces'])).split(/\s+/);
    if (interfaces.includes('awgout')) await this.run('wg-quick', ['down', path.join(this.directory, 'awgout.conf')]);
    const rules = await this.run('ip', ['rule', 'show']);
    if (rules.includes('oif awgout lookup 51830')) await this.run('ip', ['rule', 'del', 'priority', '10001', 'oif', 'awgout', 'lookup', '51830']);
    const nat = ['-o', 'awgout', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'MASQUERADE'];
    let exists = true;
    try {
      await this.run('iptables', ['-w', '5', '-t', 'nat', '-C', 'POSTROUTING', ...nat]);
    } catch {
      exists = false;
    }
    if (exists) await this.run('iptables', ['-w', '5', '-t', 'nat', '-D', 'POSTROUTING', ...nat]);
    // This table is exclusively owned by the exit; it may not exist before the first import.
    await this.run('ip', ['route', 'flush', 'table', '51830']).catch(() => {});
    await fs.rm(path.join(this.directory, 'awgout.conf'), { force: true });
  }

};
