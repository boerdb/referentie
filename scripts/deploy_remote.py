#!/usr/bin/env python3
"""Deploy referentie naar 192.168.1.32 — zelfde patroon als IC-support deploy_remote.py."""
import os
import subprocess
import sys
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "192.168.1.32")
USER = os.environ.get("DEPLOY_USER", "root")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "kerkpoort")
APP_DIR = os.environ.get("DEPLOY_DIR", "/var/www/referentie")
REPO = "git@github.com:boerdb/referentie.git"
BRANCH = "main"
REPO_ROOT = Path(__file__).resolve().parents[1]


def run_local(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, cwd=REPO_ROOT, check=check, text=True)


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 1200) -> None:
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
    if code != 0:
        if err.strip():
            print(err.rstrip(), file=sys.stderr)
        raise RuntimeError(f"Command failed ({code}): {cmd}")


def push_if_needed() -> None:
    if os.environ.get("DEPLOY_SKIP_PUSH") == "1":
        print("Git push overgeslagen (DEPLOY_SKIP_PUSH=1).")
        return
    status = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if not status.stdout.strip():
        print("Geen lokale wijzigingen; push overgeslagen.")
        return
    run_local(["git", "add", "-A"])
    run_local(["git", "commit", "-m", "chore: deploy sync"])
    run_local(["git", "push", "origin", BRANCH])


def main() -> None:
    push_if_needed()

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST}...")
    ssh.connect(HOST, username=USER, password=PASSWORD, timeout=30)

    run(ssh, "mkdir -p /var/www")
    run(
        ssh,
        f'if [ ! -d "{APP_DIR}/.git" ]; then git clone --branch {BRANCH} {REPO} {APP_DIR}; fi',
    )
    run(
        ssh,
        f'cd "{APP_DIR}" && sed -i "s/\\r$//" scripts/deploy.sh && bash scripts/deploy.sh',
    )
    ssh.close()
    print("Deploy finished OK")


if __name__ == "__main__":
    main()
