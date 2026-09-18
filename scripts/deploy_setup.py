#!/usr/bin/env python3
"""Eerste setup: MariaDB schema op .14 + .env.local op .32 + deploy — IC-support deploy_push patroon."""
from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "192.168.1.32")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "kerkpoort")
APP_DIR = os.environ.get("DEPLOY_DIR", "/var/www/referentie")
DB_SSH_HOST = os.environ.get("DB_SSH_HOST", "192.168.1.14")
DB_HOST = os.environ.get("DB_HOST", "192.168.1.14")
DB_USER = os.environ.get("DB_USER", "referentie")
DB_PASS = os.environ.get("DB_PASS", "kerkpoort")
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def run(ssh: paramiko.SSHClient, cmd: str, check: bool = True, timeout: int = 1200) -> tuple[int, str, str]:
    print(f"$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, get_pty=True, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        safe = out.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
            sys.stdout.encoding or "utf-8",
            errors="replace",
        )
        print(safe.rstrip())
    if err.strip() and code != 0:
        print(err.rstrip(), file=sys.stderr)
    if check and code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}\n{err}")
    return code, out, err


def parse_env(text: str) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env


def env_to_text(env: dict[str, str]) -> str:
    order = [
        "NODE_ENV",
        "PORT",
        "DATABASE_URL",
        "REDIS_URL",
        "AUTH_SECRET",
        "REGISTRATION_OPEN",
        "UPLOAD_DIR",
    ]
    lines: list[str] = []
    seen: set[str] = set()
    for key in order:
        if key in env:
            lines.append(f"{key}={env[key]}")
            seen.add(key)
    for key, val in sorted(env.items()):
        if key not in seen:
            lines.append(f"{key}={val}")
    return "\n".join(lines) + "\n"


def run_mysql_schema(ssh_db: paramiko.SSHClient) -> None:
    sql = (PROJECT_ROOT / "sql" / "schema.sql").read_text(encoding="utf-8")
    sftp = ssh_db.open_sftp()
    with sftp.file("/tmp/referentie-schema.sql", "w") as f:
        f.write(sql)
    sftp.close()
    run(ssh_db, "mysql -uroot -pkerkpoort < /tmp/referentie-schema.sql", check=False)
    grant = (
        f"CREATE USER IF NOT EXISTS '{DB_USER}'@'%' IDENTIFIED BY '{DB_PASS}'; "
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON referentie.* TO '{DB_USER}'@'%'; "
        f"FLUSH PRIVILEGES;"
    )
    run(ssh_db, f'mysql -uroot -pkerkpoort -e "{grant}"', check=False)
    run(
        ssh_db,
        "mysql -uroot -pkerkpoort referentie -e \"SHOW TABLES;\"",
        check=False,
    )


def merge_env_local(ssh: paramiko.SSHClient) -> None:
    _, out, _ = run(ssh, f"cat {APP_DIR}/.env.local 2>/dev/null || true", check=False)
    env = parse_env(out)
    if not env.get("DATABASE_URL"):
        env["DATABASE_URL"] = f"mysql://{DB_USER}:{DB_PASS}@{DB_HOST}:3306/referentie"
    env.setdefault("REDIS_URL", "redis://192.168.1.14:6379")
    env.setdefault("NODE_ENV", "production")
    env.setdefault("PORT", "3023")
    env.setdefault("REGISTRATION_OPEN", "true")
    env.setdefault("UPLOAD_DIR", "./data/pdfs")
    if not env.get("AUTH_SECRET"):
        env["AUTH_SECRET"] = secrets.token_urlsafe(48)
        print("Generated new AUTH_SECRET")

    content = env_to_text(env)
    run(ssh, f"mkdir -p {APP_DIR}")
    sftp = ssh.open_sftp()
    with sftp.file(f"{APP_DIR}/.env.local", "w") as f:
        f.write(content)
    sftp.close()
    print("Wrote .env.local on app server")


def main() -> None:
    ssh_app = paramiko.SSHClient()
    ssh_app.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting app server {USER}@{HOST}...")
    ssh_app.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    ssh_db = paramiko.SSHClient()
    ssh_db.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting DB server {USER}@{DB_SSH_HOST}...")
    ssh_db.connect(DB_SSH_HOST, username=USER, password=PASSWORD, timeout=30)

    run_mysql_schema(ssh_db)
    ssh_db.close()

    merge_env_local(ssh_app)
    repo = "git@github.com:boerdb/referentie.git"
    ensure_repo = f"""
if [ ! -d "{APP_DIR}/.git" ]; then
  if [ -d "{APP_DIR}" ]; then
    mv "{APP_DIR}/.env.local" /tmp/referentie.env.local.bak 2>/dev/null || true
    rm -rf "{APP_DIR}"
  fi
  git clone --branch main {repo} {APP_DIR}
  mv /tmp/referentie.env.local.bak "{APP_DIR}/.env.local" 2>/dev/null || true
fi
"""
    run(ssh_app, ensure_repo.strip())
    run(
        ssh_app,
        f'cd "{APP_DIR}" && sed -i "s/\\r$//" scripts/deploy.sh && bash scripts/deploy.sh',
    )
    ssh_app.close()
    print("\n=== Referentie setup + deploy complete ===")
    print("App: http://192.168.1.32:3023")


if __name__ == "__main__":
    main()
