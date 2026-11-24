#!/usr/bin/env python3
"""Package the verified standalone build for a GitHub Release.

This script is intentionally offline and uses only the Python standard library.
It does not build or alter the browser application.
"""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")


def required(path: Path) -> Path:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"Missing or unsafe release input: {path}")
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(required(path).read_bytes()).hexdigest()


def changelog_section(version: str) -> str:
    text = required(ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    start = re.search(rf"(?m)^## {re.escape(version)}(?:[ \t]+-[^\r\n]*)?[ \t]*$", text)
    if not start:
        raise ValueError(f"CHANGELOG.md has no section for version {version}")
    following = re.search(r"(?m)^## ", text[start.end():])
    body = text[start.end():start.end() + following.start() if following else None].strip()
    if not body or not any(line.lstrip().startswith("- ") for line in body.splitlines()):
        raise ValueError(f"CHANGELOG.md has no release notes for version {version}")
    return body


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "release-assets"))
    parser.add_argument("--commit", required=True, help="Exact merged 40-character commit SHA")
    parser.add_argument("--run-id", default="", help="Build and validation workflow run ID")
    args = parser.parse_args()

    config = json.loads(required(ROOT / "app.config.json").read_text(encoding="utf-8"))
    version = config["version"]
    if not isinstance(version, str) or not SEMVER.fullmatch(version):
        raise ValueError(f"Expected a stable SemVer version in app.config.json: {version!r}")
    if not COMMIT.fullmatch(args.commit):
        raise ValueError("Release must name the exact 40-character merged commit SHA")

    name = config["repository"]["name"]
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
        raise ValueError("Unexpected repository name in app.config.json")

    dist = ROOT / "dist"
    readable = required(dist / "index.html")
    self_extract = required(dist / "index.self-extract.html")
    dependency_manifest = required(dist / "dependency-manifest.json")
    self_extract_manifest = required(dist / "self-extract-manifest.json")
    expected_version = f'"version":"{version}"'.encode("utf-8")
    if expected_version not in readable.read_bytes():
        raise ValueError("Readable standalone version differs from app.config.json")

    manifest = json.loads(self_extract_manifest.read_text(encoding="utf-8"))
    if manifest["source"]["sha256"].lower() != sha256(readable):
        raise ValueError("Self-extract manifest does not match the readable HTML")
    if manifest["output"]["sha256"].lower() != sha256(self_extract):
        raise ValueError("Self-extract manifest does not match the self-extracting HTML")

    # Match the naming convention of the existing v1.0.4 GitHub Release.
    prefix = f"{name}-v{version}"
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    download_files = [
        (f"{prefix}.html", readable),
        (f"{prefix}.self-extract.html", self_extract),
    ]
    for filename, source in download_files:
        shutil.copyfile(source, output / filename)

    zip_inputs = [
        ("index.html", readable),
        ("index.self-extract.html", self_extract),
        ("dependency-manifest.json", dependency_manifest),
        ("self-extract-manifest.json", self_extract_manifest),
        ("README.md", ROOT / "README.md"),
        ("README.ja.md", ROOT / "README.ja.md"),
        ("APP_SPEC.md", ROOT / "APP_SPEC.md"),
        ("LICENSE", ROOT / "LICENSE"),
        ("THIRD_PARTY_NOTICES.md", ROOT / "THIRD_PARTY_NOTICES.md"),
        ("app.config.json", ROOT / "app.config.json"),
        ("assets/favicon.svg", ROOT / "assets" / "favicon.svg"),
        ("assets/screenshot.png", ROOT / "assets" / "screenshot.png"),
        ("assets/screenshot-en.png", ROOT / "assets" / "screenshot-en.png"),
    ]
    archive = output / f"{prefix}.zip"
    with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as zipped:
        for member_name, source in zip_inputs:
            entry = ZipInfo(member_name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            zipped.writestr(entry, required(source).read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
    with ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise ValueError("Distribution ZIP failed integrity verification")

    downloads = [name for name, _ in download_files] + [archive.name]
    checksums = "".join(f"{sha256(output / filename)}  {filename}\n" for filename in downloads)
    (output / "SHA256SUMS.txt").write_text(checksums, encoding="ascii")

    run_url = f"https://github.com/{config['repository']['owner']}/{name}/actions/runs/{args.run_id}" if args.run_id else ""
    notes = (
        "## 変更内容 / Changes\n\n"
        + changelog_section(version)
        + f"\n\nVersion **{version}**; merged commit `{args.commit}`.\n\n"
        + "## Downloads\n\n"
        + "- `SHA256SUMS.txt`: SHA-256 checksums for the other downloads.\n"
        + f"- `{downloads[0]}`: Readable standalone HTML.\n"
        + f"- `{downloads[1]}`: Self-extracting standalone HTML.\n"
        + f"- `{downloads[2]}`: Full distribution with manifests, documentation and license notices.\n\n"
        + "## Verification\n\n"
        + (f"- [Merged-commit build and verification]({run_url}) succeeded before publication.\n" if run_url else "")
        + "- The release HTML files are taken from the verified build artifacts, not rebuilt after validation.\n"
        + "- The ZIP and SHA-256 checksums were validated before publication.\n"
    )
    (output / "release-notes.md").write_text(notes, encoding="utf-8")
    print(f"[OK] Prepared v{version} release from commit {args.commit}")
    for filename in downloads + ["SHA256SUMS.txt", "release-notes.md"]:
        print("  " + str(output / filename))


if __name__ == "__main__":
    main()
