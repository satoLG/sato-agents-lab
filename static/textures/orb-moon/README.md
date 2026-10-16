# Rocky moon surface

Source: [Rock Boulder Dry, Poly Haven](https://polyhaven.com/a/rock_boulder_dry),
photography by Dimitrios Savva, processing by Rico Cilliers. Released under
[CC0](https://polyhaven.com/license). This is weathered rock, not a lunar mosaic.

Original 1K JPG maps:

- [Diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_diff_1k.jpg)
- [OpenGL normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_nor_gl_1k.jpg)
- [Displacement](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_boulder_dry/rock_boulder_dry_disp_1k.jpg)

The color and normal maps are reduced to 512 × 512 WebP. Color saturation and
contrast are softened to fit the island. Normal vectors are renormalized after
resizing. A 64 × 64 grayscale height map is sampled once on the CPU, using
triplanar projection, to sculpt small variations into the moon geometry.
Larger, continuous sphere-space relief complements the fine normal map.
Color and normal maps use object-space triplanar projection in the fragment
shader, eliminating the stretched UV poles. Derivative tangent frames preserve
normal detail across projections. Island rocks share these same texture objects.
All three assets are served locally; no external request is made at runtime.

Rebuild using Pillow and numpy:

```bash
python tools/build-orb-moon.py --source-dir /path/to/sources
```

Save the downloads as `rock-color-1k.jpg`, `rock-normal-1k.jpg` and
`rock-height-1k.jpg` in the source directory.
