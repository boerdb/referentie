"""
Gedeelde instellingen voor de homelab-scripts: inloggen met een SSH-sleutel,
geheimen uit scripts/.secrets.local of de omgeving (nooit hardgecodeerd).

SSH_KEY_PATH        pad naar de private key (standaard ~/.ssh/id_ed25519_homelab)
SSH_KEY_PASSPHRASE  wachtzin van de sleutel, alleen als die er een heeft
MYSQL_ROOT_PASS     MySQL-root-wachtwoord op de DB-server (192.168.1.14)

Omgevingsvariabelen gaan voor op scripts/.secrets.local.
"""
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path

import paramiko

SECRETS_FILE = Path(__file__).resolve().parent / ".secrets.local"


def _load_secrets() -> dict[str, str]:
    values: dict[str, str] = {}
    if SECRETS_FILE.exists():
        for line in SECRETS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip().strip('"').strip("'")
    values.update(os.environ)
    return values


_SECRETS = _load_secrets()


def setting(name: str, default: str | None = None) -> str | None:
    return _SECRETS.get(name) or default


def secret(name: str) -> str:
    """Verplicht geheim; stopt het script met een duidelijke melding als het ontbreekt."""
    value = _SECRETS.get(name)
    if not value:
        sys.exit(f"{name} ontbreekt: zet het in {SECRETS_FILE} of als omgevingsvariabele.")
    return value


def mysql_root() -> str:
    """Begin van een mysql-commando als root, met het wachtwoord veilig gequote."""
    return f"mysql -uroot -p{shlex.quote(secret('MYSQL_ROOT_PASS'))}"


def ssh_connect(host: str, username: str = "root", timeout: int = 30) -> paramiko.SSHClient:
    """Log in met de SSH-sleutel (SSH_KEY_PATH, standaard ~/.ssh/id_ed25519_homelab)."""
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        host,
        username=username,
        key_filename=os.path.expanduser(setting("SSH_KEY_PATH", "~/.ssh/id_ed25519_homelab")),
        passphrase=setting("SSH_KEY_PASSPHRASE"),
        allow_agent=False,
        look_for_keys=False,
        timeout=timeout,
    )
    return client
