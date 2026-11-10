# AmnewziaWG Easy

You have found the easiest way to install & manage WireGuard on ~~any~~ Linux host!

<p align="center">
  <img src="./assets/screenshot.png" width="802" />
</p>

## Features

* All-in-one: AmneziaWG + Web UI.
* Easy installation, simple to use.
* List, create, edit, delete, enable & disable clients.
* Show a client's QR code.
* Download a client's configuration file.
* Statistics for which clients are connected.
* Tx/Rx charts for each connected client.
* Gravatar support or random avatars.
* Automatic Light / Dark Mode
* Multilanguage Support
* Traffic Stats (default off)
* One Time Links (default off)
* Client Expiry (default off)
* Prometheus metrics support

## Requirements

* A host with Docker installed.

## Installation

### 1. Install Docker

If you haven't installed Docker yet, install it by running:

```bash
curl -sSL https://get.docker.com | sh
sudo usermod -aG docker $(whoami)
exit
```

And log in again.

### 2. Run AmneziaWG Easy

For a new installation, replace the host and password hash below, then run:

```
  docker run -d \
  --name=amnezia-wg-easy \
  -e LANG=en \
  -e WG_HOST='YOUR_SERVER_IP' \
  -e PASSWORD_HASH='YOUR_ADMIN_PASSWORD_HASH' \
  -e PORT=51821 \
  -e WG_PORT=51820 \
  -v "$HOME/.amnezia-wg-easy:/etc/amnezia/amneziawg" \
  -p 51820:51820/udp \
  -p 51821:51821/tcp \
  --cap-add=NET_ADMIN \
  --cap-add=SYS_MODULE \
  --sysctl="net.ipv4.conf.all.src_valid_mark=1" \
  --sysctl="net.ipv4.ip_forward=1" \
  --device=/dev/net/tun:/dev/net/tun \
  --restart unless-stopped \
  ghcr.io/igolka97/awg-easy:latest
```

> 💡 Replace `YOUR_SERVER_IP` with your WAN IP, or a Dynamic DNS hostname.
>
> 💡 Replace `YOUR_ADMIN_PASSWORD_HASH` with a bcrypt password hash to log in on the Web UI.
> See [How_to_generate_an_bcrypt_hash.md](./How_to_generate_an_bcrypt_hash.md) for know how generate the hash.

The Web UI will be available on `http://YOUR_SERVER_IP:51821`. Keep the bcrypt hash in single quotes so the shell preserves its `$` characters.

The Prometheus metrics will now be available on `http://0.0.0.0:51821/metrics`. Grafana dashboard [21733](https://grafana.com/grafana/dashboards/21733-wireguard/)

> 💡 Your configuration files will be saved in `~/.amnezia-wg-easy`

### Persistent configuration

Mount `/etc/amnezia/amneziawg` as shown above. This directory contains the server and client keys in `wg0.json`, the generated `wg0.conf`, and the VPN exit configuration in `outbound.json` and `awgout.conf` when configured. Back it up before replacing a container. Existing installations that mounted `/etc/wireguard` must copy their actual configuration out of the old container before changing the mount; mounting an empty directory does not migrate data.

Existing JSON configurations must contain `server.s3` and `server.s4`. Missing fields, malformed JSON, and read errors stop startup instead of regenerating keys. There is no automatic migration. Environment variables `S3` and `S4` apply when creating a new server configuration; existing stored values are preserved.

## Options

These options can be configured by setting environment variables using `-e KEY="VALUE"` in the `docker run` command.

| Env                           | Default           | Example                        | Description                                                                                                                                                                                                              |
|-------------------------------|-------------------|--------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `PORT`                        | `51821`           | `6789`                         | TCP port for Web UI.                                                                                                                                                                                                     |
| `WEBUI_HOST`                  | `0.0.0.0`         | `localhost`                    | IP address web UI binds to.                                                                                                                                                                                              |
| `PASSWORD_HASH`               | -                 | `$2y$05$Ci...`                 | When set, requires a password when logging in to the Web UI. See [How to generate an bcrypt hash.md]("https://github.com/wg-easy/wg-easy/blob/master/How_to_generate_an_bcrypt_hash.md") for know how generate the hash. |
| `WG_HOST`                     | -                 | `vpn.myserver.com`             | The public hostname of your VPN server.                                                                                                                                                                                  |
| `WG_DEVICE`                   | `eth0`            | `ens6f0`                       | Ethernet device the wireguard traffic should be forwarded through.                                                                                                                                                       |
| `WG_PORT`                     | `51820`           | `12345`                        | The public UDP port of your VPN server. WireGuard will listen on that (othwise default) inside the Docker container.                                                                                                     |
| `WG_CONFIG_PORT`              | `51820`           | `12345`                        | The UDP port used on [Home Assistant Plugin](https://github.com/adriy-be/homeassistant-addons-jdeath/tree/main/wgeasy)                                                                                                   |
| `WG_MTU`                      | `null`            | `1420`                         | The MTU the clients will use. Server uses default WG MTU.                                                                                                                                                                |
| `WG_PERSISTENT_KEEPALIVE`     | `0`               | `25`                           | Value in seconds to keep the "connection" open. If this value is 0, then connections won't be kept alive.                                                                                                                |
| `WG_DEFAULT_ADDRESS`          | `10.8.0.x`        | `10.6.0.x`                     | Clients IP address range.                                                                                                                                                                                                |
| `WG_DEFAULT_DNS`              | `1.1.1.1`         | `8.8.8.8, 8.8.4.4`             | DNS server clients will use. If set to blank value, clients will not use any DNS.                                                                                                                                        |
| `WG_ALLOWED_IPS`              | `0.0.0.0/0, ::/0` | `192.168.15.0/24, 10.0.1.0/24` | Allowed IPs clients will use.                                                                                                                                                                                            |
| `WG_PRE_UP`                   | `...`             | -                              | See [config.js](https://github.com/wg-easy/wg-easy/blob/master/src/config.js#L19) for the default value.                                                                                                                 |
| `WG_POST_UP`                  | `...`             | `iptables ...`                 | See [config.js](https://github.com/wg-easy/wg-easy/blob/master/src/config.js#L20) for the default value.                                                                                                                 |
| `WG_PRE_DOWN`                 | `...`             | -                              | See [config.js](https://github.com/wg-easy/wg-easy/blob/master/src/config.js#L27) for the default value.                                                                                                                 |
| `WG_POST_DOWN`                | `...`             | `iptables ...`                 | See [config.js](https://github.com/wg-easy/wg-easy/blob/master/src/config.js#L28) for the default value.                                                                                                                 |
| `WG_ENABLE_EXPIRES_TIME`      | `false`           | `true`                         | Enable expire time for clients                                                                                                                                                                                           |
| `LANG`                        | `en`              | `de`                           | Web UI language (Supports: en, ua, ru, tr, no, pl, fr, de, ca, es, ko, vi, nl, is, pt, chs, cht, it, th, hi).                                                                                                            |
| `UI_TRAFFIC_STATS`            | `false`           | `true`                         | Enable detailed RX / TX client stats in Web UI                                                                                                                                                                           |
| `UI_CHART_TYPE`               | `0`               | `1`                            | UI_CHART_TYPE=0 # Charts disabled, UI_CHART_TYPE=1 # Line chart, UI_CHART_TYPE=2 # Area chart, UI_CHART_TYPE=3 # Bar chart                                                                                               |
| `DICEBEAR_TYPE`               | `false`           | `bottts`                       | see [dicebear types](https://www.dicebear.com/styles/)                                                                                                                                                                   |
| `USE_GRAVATAR`                | `false`           | `true`                         | Use or not GRAVATAR service                                                                                                                                                                                              |
| `WG_ENABLE_ONE_TIME_LINKS`    | `false`           | `true`                         | Enable display and generation of short one time download links (expire after 5 minutes)                                                                                                                                  |
| `MAX_AGE`                     | `0`               | `1440`                         | The maximum age of Web UI sessions in minutes. `0` means that the session will exist until the browser is closed.                                                                                                        |
| `UI_ENABLE_SORT_CLIENTS`      | `false`           | `true`                         | Enable UI sort clients by name                                                                                                                                                                                           |
| `ENABLE_PROMETHEUS_METRICS`   | `false`           | `true`                         | Enable Prometheus metrics `http://0.0.0.0:51821/metrics` and `http://0.0.0.0:51821/metrics/json`                                                                                                                         |
| `PROMETHEUS_METRICS_PASSWORD` | -                 | `$2y$05$Ci...`                 | If set, Basic Auth is required when requesting metrics. See [How to generate an bcrypt hash.md]("https://github.com/wg-easy/wg-easy/blob/master/How_to_generate_an_bcrypt_hash.md") for know how generate the hash.      |
| `JC`                          | `random`          | `5`                            | Junk packet count — number of packets with random data that are sent before the start of the session.                                                                                                                    |
| `JMIN`                        | `50`              | `25`                           | Junk packet minimum size — minimum packet size for Junk packet. That is, all randomly generated packets will have a size no smaller than Jmin.                                                                           |
| `JMAX`                        | `1000`            | `250`                          | Junk packet maximum size — maximum size for Junk packets.                                                                                                                                                                |
| `S1`                          | `random`          | `75`                           | Init packet junk size — the size of random data that will be added to the init packet, the size of which is initially fixed.                                                                                             |
| `S2`                          | `random`          | `75`                           | Response packet junk size — the size of random data that will be added to the response packet, the size of which is initially fixed.                                                                                     |
| `S3` | `random (1–63)` | `16` | Cookie reply packet padding. Generated once and stored in the server configuration. |
| `S4` | `0` | `0` | Transport data packet padding. Affects bandwidth overhead; keep at zero unless needed. |
| `H1`                          | `random`          | `1234567891`                   | Init packet magic header — the header of the first byte of the handshake. Must be < uint_max.                                                                                                                            |
| `H2`                          | `random`          | `1234567892`                   | Response packet magic header — header of the first byte of the handshake response. Must be < uint_max.                                                                                                                   |
| `H3`                          | `random`          | `1234567893`                   | Underload packet magic header — UnderLoad packet header. Must be < uint_max.                                                                                                                                             |
| `H4`                          | `random`          | `1234567894`                   | Transport packet magic header — header of the packet of the data packet. Must be < uint_max.                                                                                                                             |

> If you change `WG_PORT`, make sure to also change the exposed port.

## Updating

To update to the latest version, simply run:

```bash
docker stop amnezia-wg-easy
docker rm amnezia-wg-easy
docker pull ghcr.io/igolka97/awg-easy
```

And then run the `docker run -d \ ...` command above again.

## Thanks

Based on [wg-easy](https://github.com/wg-easy/wg-easy) by Emile Nijssen.  
Use integrations with AmneziaWg from [amnezia-wg-easy](https://github.com/spcfox/amnezia-wg-easy) by Viktor Yudov.

---
Then based on [amnezia-wg-easy](https://github.com/w0rng/amnezia-wg-easy) by Anton Abramov.

Changes by Stanislav Karakovskii:
- Replaced the old amneziavpn/amnezia-wg image (last released 2 years ago) with amneziavpn/amneziawg-go and fixed the version
- Added restriction to only linux/amd64 build architecture because the new image does not support others
- Minor changes to Dockerfile because the new image is alpine-based
- Raised NodeJs build version
- Fixes to docker-compose.yml
- Release number now matches amneziawg-go version

### Internet exit through another AWG server

Create a regular client on the exit server and download its `.conf`. On the entry
server, turn on **Exit through another VPN**, upload or paste that configuration,
and select **Save and connect**. This saves the configuration and activates the
exit for all clients. Use **Check connection** to verify internet access. Turning
the switch off restores direct access and keeps the saved configuration. Turning
it back on reconnects using that configuration. To replace or delete it, turn
the switch off, then select **Replace configuration**.

The `docker run` command above already grants the networking permissions needed
for an exit: `NET_ADMIN`, `/dev/net/tun`, IPv4 forwarding and `src_valid_mark`.
No extra published port, host networking or privileged mode is needed for the
outgoing tunnel. Keep the whole `WG_PATH` directory mounted so both VPNs survive
container replacement.

For a **new entry server**, add this option to the command above:

```bash
-e WG_DEFAULT_ADDRESS='10.9.0.x'
```

Use `WG_HOST` for the entry server's public IP, not the exit server's IP. The
remote endpoint comes from the imported client configuration. Keep the exit
server on a different client subnet, for example `10.8.0.x`. On an existing
installation, changing this environment variable alone does not migrate stored
server/client addresses; preserve the existing data and plan a subnet change
separately.

The exit feature must be included in the image being launched. Local source
changes are not included in an already published `latest` tag. To build the
current checkout on a Linux Docker host:

```bash
docker build --platform linux/amd64 -t awg-easy:outbound .
```

Then use `awg-easy:outbound` instead of `ghcr.io/igolka97/awg-easy:latest` as the
last argument of `docker run`. Alternatively, use the registry image after the
updated source has been published by CI. The base image is amd64-only; a build
on an ARM machine does not establish that its emulated VPN runtime works.

Use different client subnets on the two servers (for example `10.9.0.x` on the
entry server and `10.8.0.x` on the exit server). Import supports one IPv4 address,
one peer and full-tunnel AllowedIPs. Shell hooks and unsupported directives are
rejected. Imported DNS is validated but does not replace the server resolver or
client DNS settings. Clients retain the DNS settings in their own configurations.

The entry server uses a separate `awgout` interface, NAT and policy routing for
packets entering `wg0`. The container's own default route is unchanged. Table
`51830`, rule priorities `10000`/`10001`, interface `awgout` and firewall comment
`awg-easy-outbound` are reserved for this feature. Custom network rules must not
use these identifiers or override the exit's firewall rules.

VPN mode fails closed: forwarded client traffic cannot leave via another
interface if the tunnel goes down. IPv6 forwarding from clients is blocked in
VPN mode; this version only provides an IPv4 VPN exit. This protection operates
on the server and does not replace a client-side kill switch. The exit sees all
entry-server clients as one peer. Per-client statistics remain on the entry.

The connection check performs an HTTPS request to Cloudflare's
`https://1.1.1.1/cdn-cgi/trace`, bound to the exit interface, and displays the
observed exit IP. A recent handshake and a successful internet probe are shown
separately. Checking a saved exit does not select it for clients.

Exit settings, including private keys, are stored in `outbound.json` and
`awgout.conf` under `WG_PATH` with owner-only permissions. Persist and back up the
whole configuration directory; the existing client JSON export does not include
the exit. The selected VPN exit is restored on startup before HTTP is served.
A failed tunnel restore leaves client traffic blocked and reports an error in
the panel so the operator can retry or explicitly select direct access.
