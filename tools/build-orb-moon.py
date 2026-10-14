"""Reduce Poly Haven's CC0 Rock Boulder Dry maps for orb's small rocky moon.

Requires Pillow and numpy. Sources are documented beside the generated maps.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'static/textures/orb-moon')
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)

color = Image.open(args.source_dir / 'rock-color-1k.jpg').convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
# Keep the photographed rock detail, with softer color/contrast like the island.
color = ImageEnhance.Color(color).enhance(.65)
color = ImageEnhance.Contrast(color).enhance(.88)
color.save(args.output_dir / 'rock-color.webp', quality=78, method=6)

normal = np.asarray(Image.open(args.source_dir / 'rock-normal-1k.jpg').convert('RGB').resize((512, 512), Image.Resampling.LANCZOS), dtype=np.float64) / 127.5 - 1
normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-8)
Image.fromarray(np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255))).save(args.output_dir / 'rock-normal.webp', quality=86, method=6)

# CPU geometry displacement only needs a small height sample, not a GPU map.
height = Image.open(args.source_dir / 'rock-height-1k.jpg').convert('L').resize((64, 64), Image.Resampling.LANCZOS)
height.save(args.output_dir / 'rock-height.png', optimize=True)
for name in ['rock-color.webp', 'rock-normal.webp', 'rock-height.png']:
    path = args.output_dir / name
    print(f'{path.name}: {path.stat().st_size} bytes')
