"""Build small lunar albedo/normal maps from NASA SVS LROC and LOLA data.

Requires Pillow and numpy. Sources and usage are in textures/orb-moon/README.md.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--source-dir', type=Path, required=True)
parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'static/textures/orb-moon')
args = parser.parse_args()
args.output_dir.mkdir(parents=True, exist_ok=True)

color = Image.open(args.source_dir / 'lroc-color-1k.jpg').convert('RGB')
color.save(args.output_dir / 'lroc-color.webp', quality=80, method=6)

# LOLA float TIFF values are kilometers above the 1737.4 km reference sphere.
# Derivatives use spherical distances and wrap longitude, avoiding a seam.
height = np.asarray(Image.open(args.source_dir / 'lola-elevation-4.tif').resize((512, 256), Image.Resampling.BILINEAR), dtype=np.float64)
h, w = height.shape
latitude = np.pi / 2 - (np.arange(h) + .5) * np.pi / h
cos_lat = np.cos(latitude)[:, None]
east = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * (2 * np.pi / w) * 1737.4 * np.maximum(cos_lat, .12))
south = np.gradient(height, axis=0) / ((np.pi / h) * 1737.4)
# Modest relief amplification; taper the sparse polar data to avoid pinching.
polar = np.clip((cos_lat - .03) / .15, 0, 1)
normal = np.stack([-east * 2.5 * polar, south * 2.5 * polar, np.ones_like(height)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
rgb = np.uint8(np.clip((normal * .5 + .5) * 255, 0, 255))
Image.fromarray(rgb).save(args.output_dir / 'lola-normal.webp', quality=90, method=6)
for path in sorted(args.output_dir.glob('*.webp')):
    print(f'{path.name}: {path.stat().st_size} bytes')
