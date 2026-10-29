"""Generate local-only Compose settings using the Python standard library."""
import argparse
import base64
import os
from pathlib import Path
import secrets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parquet", required=True, type=Path)
    args = parser.parse_args()
    source = args.parquet.expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() != ".parquet":
        parser.error("--parquet must be an existing Parquet file")
    if any(c in str(source) for c in "\n\r'$"):
        parser.error("Use a source path without quotes, dollar signs or newlines")
    root = Path(__file__).resolve().parents[1]
    target = root / ".env.compose"
    if target.exists():
        print(".env.compose already exists; existing credentials and settings were left unchanged.")
        return
    template = (root / "deploy/local.env.example").read_text()
    values = {
        "PERSONA_PARQUET_HOST_PATH": f"'{source}'",
        "POSTGRES_PASSWORD": secrets.token_hex(24),
        "PERSONA_DB_PASSWORD": secrets.token_hex(24),
        "PERSONA_ENCRYPTION_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    }
    lines = [f"{line.split('=', 1)[0]}={values[line.split('=', 1)[0]]}"
             if line.split("=", 1)[0] in values else line for line in template.splitlines()]
    with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
        output.write("\n".join(lines) + "\n")
    print("Created ignored .env.compose (0600). Source will be mounted read-only; no data copied.")


if __name__ == "__main__":
    main()
