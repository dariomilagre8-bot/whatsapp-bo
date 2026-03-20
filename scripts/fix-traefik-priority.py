#!/usr/bin/env python3
"""Fix Traefik file provider: catch-all error routers must have LOWER priority than apps."""
import json
import shutil
import sys

PATH = "/etc/easypanel/traefik/config/main.yaml"


def main():
    backup = PATH + ".bak-priority-fix"
    shutil.copy2(PATH, backup)
    with open(PATH, encoding="utf-8") as f:
        d = json.load(f)
    routers = d["http"]["routers"]
    for name, cfg in routers.items():
        if name in ("http-error-page", "https-error-page") and cfg.get("priority") == 1:
            cfg["priority"] = -10
        elif cfg.get("priority") == 0:
            cfg["priority"] = 10
    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
        f.write("\n")
    print("OK: backup at", backup)
    for name in sorted(routers):
        if "error" in name or routers[name].get("priority") in (-10, 10):
            print(name, "priority=", routers[name].get("priority"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
