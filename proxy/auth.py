#!/usr/bin/env python3

import os
import signal
import socket
import subprocess
import sys
import time


def exchange(line):
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(2)
            connection.connect("/run/awg-proxy/auth.sock")
            connection.sendall(line)
            with connection.makefile("rb") as response:
                return response.readline(64)
    except OSError:
        return b""


if sys.argv[1:] == ["--start"]:
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    namespace = os.readlink("/proc/self/ns/net").encode() + b"\n"
    deadline = time.monotonic() + 45
    while exchange(b"PING\n") != namespace:
        if time.monotonic() >= deadline:
            sys.exit("awg-easy proxy authentication is unavailable in this network namespace")
        time.sleep(1)
    squid = subprocess.Popen(["squid", "-N"])
    signal.signal(signal.SIGTERM, lambda *_: squid.terminate())
    while squid.poll() is None:
        try:
            squid.wait(timeout=2)
        except subprocess.TimeoutExpired:
            # Docker may give a restarted awg-easy container a new network namespace.
            if exchange(b"PING\n") != namespace:
                squid.terminate()
                break
    sys.exit(squid.wait())

for request in sys.stdin.buffer:
    print("OK" if exchange(request) == b"OK\n" else "ERR", flush=True)
