#!/usr/bin/env python3
"""Set SMTP_* values in both LAND LEDGER env files (idempotent, no secrets baked in).
Usage:
  python3 set-smtp-env.py <smtp_user> <smtp_app_password> [smtp_host] [smtp_port]
Examples:
  python3 set-smtp-env.py you@example.com YOUR_16_CHAR_APP_PASSWORD smtp.gmail.com 465
Files updated:
  land-ledger/backend/.env      (sandbox runtime, gitignored)
  upload/atlas-credentials.env  (tracked -> ships in deploy payload)
"""
import re, sys

FILES = [
    "/home/z/my-project/land-ledger/backend/.env",
    "/home/z/my-project/upload/atlas-credentials.env",
]

def main() -> None:
    if len(sys.argv) < 3:
        sys.exit("usage: set-smtp-env.py <smtp_user> <smtp_app_password> [host] [port]")
    user, password = sys.argv[1], sys.argv[2]
    host = sys.argv[3] if len(sys.argv) > 3 else "smtp.gmail.com"
    port = sys.argv[4] if len(sys.argv) > 4 else "465"
    cre = {
        "SMTP_HOST": host,
        "SMTP_PORT": port,
        "SMTP_SECURE": "true" if port == "465" else "false",
        "SMTP_USER": user,
        "SMTP_PASSWORD": password,
        "SMTP_FROM": f"LAND LEDGER <{user}>",
    }
    total = 0
    for path in FILES:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
        seen, out = set(), []
        for line in lines:
            m = re.match(r"^(SMTP_[A-Z_]+)=", line)
            if m and m.group(1) in cre:
                key = m.group(1)
                if key not in seen:
                    out.append(f"{key}={cre[key]}")
                    seen.add(key)
            else:
                out.append(line)
        new = "\n".join(out) + "\n"
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        total += 1
        print(f"updated: {path}")
    print(f"done ({total} files); password never printed to logs")

if __name__ == "__main__":
    main()
