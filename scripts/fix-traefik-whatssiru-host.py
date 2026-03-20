#!/usr/bin/env python3
"""Add jules-whatssiru.oxuzyt.easypanel.host to whatssiru routers (was nip.io only)."""
import json
import shutil
import sys

PATH = "/etc/easypanel/traefik/config/main.yaml"
NEW = "jules-whatssiru.oxuzyt.easypanel.host"
OLD = "whatssiru.46.224.99.52.nip.io"


def main():
    backup = PATH + ".bak-whatssiru-host"
    shutil.copy2(PATH, backup)
    with open(PATH, encoding="utf-8") as f:
        d = json.load(f)
    routers = d["http"]["routers"]
    rule_both = (
        f"(Host(`{NEW}`) || Host(`{OLD}`)) && PathPrefix(`/`)"
    )
    for name in ("http-jules_whatssiru-0", "https-jules_whatssiru-0"):
        if name not in routers:
            print("missing", name, file=sys.stderr)
            continue
        r = routers[name]
        print(name, "rule:", r.get("rule"), "->", rule_both)
        r["rule"] = rule_both
        if name.startswith("https-") and "tls" in r:
            doms = r["tls"].setdefault("domains", [])
            mains = {d.get("main") for d in doms if isinstance(d, dict)}
            if NEW not in mains:
                doms.insert(0, {"main": NEW})
            if OLD not in mains:
                doms.append({"main": OLD})
            r["tls"]["domains"] = doms
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
    print("OK backup", backup)
    return 0


if __name__ == "__main__":
    sys.exit(main())
