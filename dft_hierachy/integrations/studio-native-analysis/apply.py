"""Apply or verify this fixed delta in the existing non-Git Studio product directory."""
from pathlib import Path
import argparse
import hashlib
import gzip
import json
import shutil
import subprocess

HERE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--studio", required=True, type=Path)
    parser.add_argument("--delivery", type=Path, default=HERE, help="Fixed delta directory (defaults to the original delivery)")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--verify", action="store_true")
    options = parser.parse_args()
    delivery = options.delivery.resolve(strict=True)
    manifest = json.loads((delivery / "delivery.json").read_text())
    root = options.studio.resolve(strict=True)
    for name, expected in manifest["packages"].items():
        if Path(name).name != name or digest(delivery / "packages" / name) != expected:
            raise ValueError("Fixed dependency package changed: " + name)
    patch = gzip.decompress((delivery / manifest["patchFile"]).read_bytes())
    if hashlib.sha256(patch).hexdigest() != manifest["patchSha256"]:
        raise ValueError("Fixed Studio patch changed")
    if options.verify:
        for item in manifest["studioSources"]:
            if item["path"] in manifest.get("packagingOmissions", []) and not (root / item["path"]).exists():
                continue
            if digest(root / item["path"]) != item["sha256"]:
                raise ValueError("Studio source differs: " + item["path"])
        for name, expected in manifest["packages"].items():
            if digest(root / "vendor" / name) != expected:
                raise ValueError("Installed package differs: " + name)
        print("Verified fixed Studio source and local package bytes")
        return
    for name, expected in manifest["baseStudio"].items():
        if name in manifest.get("packagingOmissions", []) and not (root / name).exists():
            continue
        if digest(root / name) != expected["sha256"]:
            raise ValueError("Preserve existing changes; Studio base differs: " + name)
    for name in manifest["changedFiles"]:
        if name not in manifest["baseStudio"] and (root / name).exists():
            raise ValueError("New Studio path already exists: " + name)
    for name, expected in manifest["packages"].items():
        target = root / "vendor" / name
        if target.exists() and digest(target) != expected:
            raise ValueError("Preserve existing vendor file: " + name)
    subprocess.run(["git", "apply", "--check", "-"], cwd=root, input=patch, check=True)
    if options.check:
        print("Studio base and patch preflight passed; no files changed")
        return
    subprocess.run(["git", "apply", "-"], cwd=root, input=patch, check=True)
    (root / "vendor").mkdir(exist_ok=True)
    for name in manifest["packages"]:
        shutil.copy2(delivery / "packages" / name, root / "vendor" / name)
    print("Applied fixed Studio delta. Install Node dependencies, then run tools/install_native_analysis.py and build:desktop.")


if __name__ == "__main__":
    main()
