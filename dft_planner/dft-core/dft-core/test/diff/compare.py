#!/usr/bin/env python3
"""Semantic deep-compare of two DesignHierarchy JSONs (order-sensitive on lists)."""
import json
import sys


def load(p):
    with open(p) as f:
        return json.load(f)


def diff(a, b, path=""):
    out = []
    if type(a) != type(b):
        return [f"{path}: type {type(a).__name__} != {type(b).__name__}"]
    if isinstance(a, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a:
                out.append(f"{path}.{k}: missing in A(oracle)")
            elif k not in b:
                out.append(f"{path}.{k}: missing in B(cxx)")
            else:
                out += diff(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append(f"{path}: len {len(a)} != {len(b)}")
        for i in range(min(len(a), len(b))):
            out += diff(a[i], b[i], f"{path}[{i}]")
    else:
        if a != b:
            out.append(f"{path}: {a!r} != {b!r}")
    return out


if __name__ == "__main__":
    a, b = load(sys.argv[1]), load(sys.argv[2])
    d = diff(a, b, "")
    if d:
        print(f"MISMATCH ({len(d)} diffs):")
        for line in d[:60]:
            print(" ", line)
        sys.exit(1)
    print("MATCH")
