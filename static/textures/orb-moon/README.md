# Lunar surface

Source: NASA's Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), visualization by Ernie Wright, with LRO LROC and LOLA data. NASA imagery is used under [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

- Color: [2019 LROC natural-color mosaic, 1024 × 512](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg), recompressed as `lroc-color.webp`.
- Normal: derived from [LOLA floating-point elevation, 1440 × 720](https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4.tif), reduced to 512 × 256. OpenGL tangent-space normals use longitude wrapping, spherical distances, 2.5× relief and a polar taper. This is a display derivative, not a scientific data product.

Both maps are served locally. No source TIFF or remote request is needed at runtime. Rebuild with Pillow and numpy:

```bash
python tools/build-orb-moon.py --source-dir /path/to/sources
```

The source directory must contain `lroc-color-1k.jpg` and `lola-elevation-4.tif` downloaded from the URLs above.
