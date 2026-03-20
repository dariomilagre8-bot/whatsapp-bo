#!/usr/bin/env python3
"""Point jules Traefik services at tasks.<service> (Swarm VIP broken from traefik net)."""
import json
import shutil
import sys

PATH = "/etc/easypanel/traefik/config/main.yaml"


def main():
    backup = PATH + ".bak-jules-tasks"
    shutil.copy2(PATH, backup)
    with open(PATH, encoding="utf-8") as f:
        d = json.load(f)
    services = d["http"]["services"]
    pairs = (
        ("jules_whatssiru-0", "http://tasks.jules_whatssiru:80/"),
        ("jules_demo-moda-0", "http://tasks.jules_demo-moda:80/"),
    )
    for name, url in pairs:
        if name not in services:
            print("missing service", name, file=sys.stderr)
            continue
        lb = services[name].get("loadBalancer", {})
        servers = lb.get("servers", [])
        if servers:
            old = servers[0].get("url")
            servers[0]["url"] = url
            print(name, old, "->", url)
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
    print("OK backup", backup)
    return 0


if __name__ == "__main__":
    sys.exit(main())
