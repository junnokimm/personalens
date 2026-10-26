"""Create the local at-rest encryption key once, without printing it."""
import os
from pathlib import Path
from cryptography.fernet import Fernet

path = Path(__file__).resolve().parents[1] / ".env"
existing = path.read_text() if path.exists() else ""
if any(line.startswith("PERSONA_ENCRYPTION_KEY=") and line.split("=", 1)[1].strip() for line in existing.splitlines()):
    print("Encryption key already configured; left unchanged.")
else:
    existing = "\n".join(line for line in existing.splitlines() if not line.startswith("PERSONA_ENCRYPTION_KEY="))
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as output:
        output.write(existing.rstrip() + "\nPERSONA_ENCRYPTION_KEY=" + Fernet.generate_key().decode() + "\n")
    path.chmod(0o600)
    print("Local encryption key configured in ignored backend/.env; keep a secure backup.")
