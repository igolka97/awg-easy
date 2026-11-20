'use strict';

const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const ServerError = require('./ServerError');

const usernamePattern = /^[A-Za-z0-9_-]{1,128}$/;

module.exports = class Proxy {

  constructor({
    url, directory, socketPath, getConfig,
  }) {
    this.url = url;
    this.directory = directory;
    this.socketPath = socketPath;
    this.getConfig = getConfig;
  }

  async start() {
    if (!this.url) return;
    try {
      const url = new URL(this.url);
      if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
      this.url = url.origin;
    } catch {
      throw new Error('PROXY_URL must be an HTTPS proxy origin without credentials.');
    }

    const file = path.join(this.directory, 'proxy-secret');
    try {
      await fs.writeFile(file, randomBytes(32), { mode: 0o600, flag: 'wx' });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    this.secret = await fs.readFile(file);
    if (this.secret.length !== 32) throw new Error('Invalid proxy-secret.');

    const networkNamespace = await fs.readlink('/proc/self/ns/net');
    await fs.rm(this.socketPath, { force: true });
    const server = net.createServer((socket) => {
      let request = '';
      socket.setEncoding('utf8');
      socket.setTimeout(2000, () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.on('data', async (chunk) => {
        request += chunk;
        if (request.length > 256) {
          socket.destroy();
          return;
        }
        if (!request.includes('\n')) return;
        socket.pause();
        if (request === 'PING\n') {
          socket.end(`${networkNamespace}\n`);
          return;
        }
        const [username, password, extra] = request.trimEnd().split(' ');
        let allowed = false;
        if (extra === undefined && password && /^[A-Za-z0-9_-]{43}$/.test(password)) {
          try {
            const credentials = await this.credentials(username);
            allowed = timingSafeEqual(Buffer.from(password), Buffer.from(credentials.password));
          } catch { /* An unavailable profile or config must deny access. */ }
        }
        socket.end(allowed ? 'OK\n' : 'ERR\n');
      });
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.socketPath, resolve);
    });
    await fs.chown(this.socketPath, process.getuid(), 10500);
    await fs.chmod(this.socketPath, 0o660);
  }

  async credentials(username) {
    if (!this.url) throw new ServerError('Proxy is disabled.', 404);
    const { clients } = await this.getConfig();
    if (!usernamePattern.test(username) || !Object.hasOwn(clients, username)) {
      throw new ServerError('Client not found.', 404);
    }
    const client = clients[username];
    if (client.enabled !== true || (client.expiredAt != null && !(new Date(client.expiredAt) > new Date()))) {
      throw new ServerError('Client is disabled or expired.', 403);
    }
    const password = createHmac('sha256', this.secret).update(username).digest('base64url');
    return { url: this.url, username, password };
  }

};
