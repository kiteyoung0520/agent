#!/usr/bin/env python3
"""Simple GPT Image helper for Claude Code lazy pack."""

from __future__ import annotations

import argparse
import base64
import os
from pathlib import Path
from time import strftime

from openai import OpenAI

MODEL = "gpt-image-2"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def output_dir() -> Path:
    slides = Path.cwd() / "slides"
    if slides.exists():
        target = slides / "generated"
    else:
        target = Path.cwd() / "generated"
    target.mkdir(parents=True, exist_ok=True)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an image with OpenAI GPT Image.")
    parser.add_argument("prompt")
    parser.add_argument("--name", default="image")
    parser.add_argument("--size", default="1536x1024")
    parser.add_argument("--quality", default="low", choices=["low", "medium", "high", "auto"])
    args = parser.parse_args()

    load_env_file(Path.home() / ".openai.env")
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("Missing OPENAI_API_KEY. Add it to ~/.openai.env first.")

    client = OpenAI()
    result = client.images.generate(
        model=MODEL,
        prompt=args.prompt,
        size=args.size,
        quality=args.quality,
    )

    image_b64 = result.data[0].b64_json
    if not image_b64:
        raise SystemExit("OpenAI response did not include image data.")

    filename = f"{args.name}_{strftime('%Y%m%d_%H%M%S')}.png"
    path = output_dir() / filename
    path.write_bytes(base64.b64decode(image_b64))
    print(path)


if __name__ == "__main__":
    main()
