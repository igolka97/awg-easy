'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const parseOutbound = require('./OutboundConfig');
const ServerError = require('./ServerError');

const execute = promisify(execFile);

module.exports = class Outbound {

  constructor({ directory, run } = {}) {
    this.directory = directory;
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
    this.state = { mode: 'direct', profile: null };
    this.error = null;
    this.busy = false;
  }

  async prepare() {
    try {
      this.state = JSON.parse(await fs.readFile(path.join(this.directory, 'outbound.json'), 'utf8'));
      if (!['direct', 'vpn'].includes(this.state.mode) || (this.state.mode === 'vpn' && !this.state.profile)) throw new Error('Invalid outbound state');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    // Install the guard before the receiving interface becomes available on startup.
    if (this.state.mode === 'vpn') await this.guard(true);
  }

  async persist() {
    await fs.mkdir(this.directory, { recursive: true });
    const target = path.join(this.directory, 'outbound.json');
    await fs.writeFile(`${target}.tmp`, JSON.stringify(this.state), { mode: 0o600 });
    await fs.rename(`${target}.tmp`, target);
  }

  async guard(enabled) {
    for (const [binary, rule] of [
      ['iptables', ['-i', 'wg0', '!', '-o', 'awgout', '-m', 'comment', '--comment', 'awg-easy-outbound', '-j', 'REJECT']],
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

  async restore() {
    if (this.state.mode !== 'vpn') return;
    try {
      await this.tunnel();
      const rules = await this.run('ip', ['rule', 'show']);
      if (!rules.includes('iif wg0 lookup 51830')) await this.run('ip', ['rule', 'add', 'priority', '10000', 'iif', 'wg0', 'lookup', '51830']);
      this.error = null;
    } catch (err) {
      this.error = err.message;
      // Keep the guard and the selected mode. Never fall back to direct access.
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
          const rules = await this.run('ip', ['rule', 'show']);
          if (rules.includes('iif wg0 lookup 51830')) await this.run('ip', ['rule', 'del', 'priority', '10000', 'iif', 'wg0', 'lookup', '51830']);
          this.state.mode = 'direct';
          try {
            await this.persist();
          } catch (err) {
            this.state.mode = 'vpn';
            throw err;
          }
          await this.guard(false);
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
