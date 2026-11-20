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
`51830`, rule priorities `10000`/`10001`, firewall chains `AWG-EXIT`/`AWG-CLASSIFY`,
mark bit `0x1000000`, ipsets `awg-exit-networks`/`awg-exit-staging`, interface `awgout`
and firewall comment
`awg-easy-outbound` are reserved for this feature. Custom network rules must not
use these identifiers or override the exit's firewall rules.

VPN destinations fail closed: traffic assigned to the second VPN cannot leave
via another interface if the tunnel goes down. Explicit direct destinations
continue to use the entry server. IPv6 forwarding from clients is blocked in
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
A failed tunnel restore leaves VPN destinations blocked and reports an error in
the panel so the operator can retry or explicitly select direct access.

### Route destinations by IPv4 address

The **IP routing** section offers two modes for all clients connected to `wg0`:

| Default exit | Destinations in the list | Other IPv4 destinations |
| --- | --- | --- |
| Second VPN | Directly through this server | Through the second VPN |
| This server | Through the second VPN | Directly through this server |

Enter one IPv4 address or CIDR subnet per line. There is no 64-entry limit;
the input and normalized list are each limited to 1 MiB of text, with a 2 MiB
limit on the JSON request (including chunked requests). Oversized lists are
rejected entirely, never truncated. Host addresses
are normalized to `/32`, CIDRs to their network address, and duplicates removed.
All listed destinations use the same exception exit, so overlapping subnets have
no conflicting actions. An empty list sends everything to the default exit;
`0.0.0.0/0` sends everything to the exception exit. Domains are not accepted.
A site's addresses can change, and shared CDN addresses affect multiple sites.
DNS requests follow the same destination-IP rules; the feature does not resolve
domains or route by hostname. Addresses local to the entry server remain local.

The main switch enables or disables the whole VPN routing policy. When disabled,
all clients use direct access and the rules remain saved. IPv6 forwarding is
blocked while the switch is enabled, in either routing mode. Direct destinations
remain available when the second tunnel is removed or its peer stops responding.
Rules only match forwarded traffic entering `wg0`; the host and other containers
retain their routes. Custom rules must not use the reserved priorities or chain.

Saving validates the entire list, then loads an inactive `hash:net` ipset using
a single bulk `ipset restore`. The active set is replaced with `ipset swap`; a
failed load leaves the active list and persisted configuration unchanged. Updating
only the list does not rebuild rules or block forwarding. Changing the default
exit, or enabling/disabling routing, briefly guards forwarding while replacing
a fixed number of rules. An error installing those rules leaves the transition
guard in place; retry the operation to recover. The classifier marks each packet
once; both policy routing and the forwarding guard use that mark, so a set swap
between classification and forwarding cannot send that packet via the wrong exit. Existing connections
to destinations whose exit changed may need to reconnect because their NAT mapping
has changed. A failed tunnel startup still installs direct routes and keeps VPN
routes unreachable. No automatic fallback to the direct exit is performed.

### Block destinations by IPv4 address

**Blocked IP addresses and subnets** is an independent list available without a
second VPN profile. Enter one IPv4 address or CIDR per line, up to 1 MiB before
and after normalization. Duplicates are removed; an empty list disables blocking.
The list is saved as `blockedNetworks` in `outbound.json`. Existing configurations
without this field load with an empty list; an explicitly invalid value is rejected.

Blocking applies to every IPv4 packet entering `wg0`, before forwarding or local
delivery, regardless of the selected exit or whether the second VPN is enabled.
It takes priority over routing exceptions and also affects established connections.
Blocking this server's VPN address prevents clients from accessing its services,
including the admin panel. `0.0.0.0/0` blocks all incoming client IPv4 traffic.
Domains and IPv6 entries are not supported. Host and other-container traffic is
unaffected. Disabling or deleting the second VPN does not clear this list.

The reserved ipsets `awg-block-networks` and `awg-block-staging` are loaded and
swapped independently of routing. A mangle PREROUTING rule drops destinations in
the active set. A failed load or swap preserves the previous block list. Saved
blocks are restored before `wg0` is initialized; failure stops application startup.

### HTTP proxy through the VPN exit

The optional Squid service lets applications use the configured VPN exit without
connecting to AmneziaWG themselves. It accepts HTTP proxy requests over TLS and
supports HTTPS destinations through CONNECT. The proxy uses `awgout` for site
connections and DNS. Direct-routing exceptions for AmneziaWG clients do not
apply to the proxy. If the VPN exit is disabled or unavailable, proxy requests
fail. The proxy supports IPv4 destinations on ports 80 and 443, with CONNECT
allowed on port 443.

On the Docker host, set `PASSWORD_HASH` for the web UI and add these settings
to `.env`:

```dotenv
PROXY_HOST=proxy.example.com
PROXY_PORT=3128
PROXY_TLS_CERT=/absolute/path/to/fullchain.pem
PROXY_TLS_KEY=/absolute/path/to/privkey.pem
```

Use a TLS certificate valid for `PROXY_HOST`. The mounted files must be readable
by UID/GID 10500 inside Squid. For example, the private key can be owned by
`root:10500` with mode `0640`. Point the hostname at the entry server and allow
the selected TCP port through its firewall. Recreate the Squid service after
replacing the certificate files.

```sh
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d --build
```

Enable the VPN exit in the web UI. Use **Copy proxy settings** on an active
profile to get an `https://username:password@host:port` URL. Use an application
that supports TLS to the proxy. For example, paste the copied URL at the prompt:

```sh
read -rs PROXY_URL
curl --proxy "$PROXY_URL" https://1.1.1.1/cdn-cgi/trace
unset PROXY_URL
```

The returned `ip=` should match **Check connection** in the VPN exit settings.
Disabling, expiring or deleting a profile revokes access for new requests
after Squid's one-second authentication cache expires. Existing CONNECT tunnels
can stay open until the client disconnects.

Back up `proxy-secret` alongside the persistent AmneziaWG configuration to
preserve proxy passwords across restores. The proxy reserves policy route
priorities `10002` and `10003`, routing table `51831` and UID `10500`
in the shared network namespace.

### Explicit upgrade of existing exit configurations

There is **no automatic migration** of an existing `outbound.json`. It now requires:

```json
"routing": { "defaultExit": "vpn", "networks": [] }
```

Fresh installations create these settings themselves. If `outbound.json` does not
exist, no migration is needed. For an existing file, stop the old container first,
then run the following using the new image and the **actual existing data directory**:

```bash
docker stop amnezia-wg-easy
docker run --rm --network none --entrypoint node \
  -v /opt/awg-easy/data:/data \
  ghcr.io/igolka97/awg-easy:NEW_TAG \
  /app/scripts/migrate-outbound-routing.js /data
```

Replace `NEW_TAG` with the new image tag or digest before running. Then recreate
the service with that image and the same volume and environment. The migration
preserves the selected mode, profile and keys, and adds an empty exception list
with the second VPN as default. It creates `outbound.json.before-ip-routing` with
owner-only permissions before replacing the file. It refuses to overwrite an
existing backup, repeat an already completed migration, or migrate malformed JSON.
The running application refuses old or invalid routing settings instead of silently
choosing another exit. Do not run migration against a live service.

The image includes `ipset`; the host kernel must support `ip_set`, `hash:net`,
iptables set matching and packet marks. Unsupported kernels report an error;
there is no fallback to per-destination rules. The set capacity of 262144 entries
exceeds the number of IPv4/CIDR entries that can fit within the text-size limit.
`0.0.0.0/0` is loaded as two `/1` subnets because `hash:net` cannot store `/0`.
No force-add/eviction is enabled. Set contents are rebuilt from `outbound.json`
on restart; the temporary restore file is removed after loading.
