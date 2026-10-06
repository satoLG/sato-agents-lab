# Scenic environments

The forest, laboratory garden and exterior stands share leaf-card foliage,
GPU wind and a flat, depth-colored water surface. Home keeps a clear foreground
for the companion and composer. Navigation and telemetry layouts are unchanged.

## Reference and attribution

Bruno Simon's [folio-2025](https://github.com/brunosimon/folio-2025), pinned at
`41046b57eeed8d156d9c3fd7fa259900baef7816`:

- `sources/Game/World/Foliage.js`: 80 rotated .8-unit quads distributed in a
  sphere using `1 - random³`, radial normals blended by .85, SDF threshold and
  wind-driven texture rotation. `folio-foliage.js` ports those ideas to the
  existing WebGL renderer. Cards face three azimuths so the lab's orbit camera
  can view a stand from any side. There are no solid spheres behind the leaves.
- `static/foliage/foliageSDF.png`: the original 128×128, 10,950-byte grayscale
  SDF texture is vendored locally. Its original MIT license is adjacent.
- `sources/Game/Materials/MeshDefaultMaterial.js`: warm directional color and
  colored core shadows, implemented without adding per-leaf lights.
- `sources/Game/Terrain.js`: turquoise `#5bc2b9` to deep blue `#13375f` gradient.
- `sources/Game/World/WaterSurface.js`: shallow shore mask and noise-broken
  drifting ripple contours. `scene-water.js` derives depth/shore distance from
  the authored ribbon instead of the reference world's terrain texture.
- `sources/Game/World/Grass.js`: one triangle per blade, anchored roots and
  moving tips, with denser patches and color variation.

The source uses Three.js WebGPU/TSL and a complete terrain/weather system. This
adaptation retains this app's vendored WebGL build. It does not include the
reference's framebuffer blur, vehicle splashes, ice/weather or physics. Water
does not use shiny wave normals or pretend to reflect the scene.

## Performance and lifecycle

- Two draws per tree stand: merged wood and instanced leaf clouds. Trunks have
  continuous curves, tapered branches and a small base flare. Distant lab stands
  use 20 cards per cloud; nearby stands use 80. Foliage geometry and materials
  are shared across stands while bounds permit frustum culling.
- Water is one opaque draw per scene. It needs no reflection camera, extra
  framebuffer or transmissive material. Shoreline widths are in world units.
- Wind and water update a time uniform; instance matrices remain static.
  Hidden tabs already pause rendering; reduced motion freezes both effects.
- Home retains the 30 Hz cap and 1.75 DPR maximum, lowering DPR in steps toward
  1 when sustained frame intervals exceed 55 ms. CSS/camera sizing is preserved.
- Ground contact shade and broad dappled lighting do not require a home shadow
  map. Lab keeps its single existing shadow map; far trunks and foliage do not
  add dynamic shadow passes.

Measured on Intel UHD Graphics / ANGLE D3D11, 1440×1000, DPR 1, 35 warmed
synchronous renders with `gl.finish()` (render-only measurement, not full-app
FPS): home draw calls decreased from 260 to 46, median render time from 0.9 to
0.3 ms. Triangles increased from 52,816 to 150,805 for leaf clouds and grass;
uploaded geometries decreased from 81 to 29 and textures from 13 to 10.
The sampled lab exterior changed from 2,209 to 2,215 calls and 1.14M to 1.21M
triangles; median render time was 57.5 versus 51.9 ms. Its geometry count changed
from 854 to 874 because continuous wood is merged per stand. These are local samples,
not a guarantee for other GPUs. The lab's existing equipment/shadow workload
still dominates its rendering cost.

## Verification

`node --test tests/scene-nature.test.mjs` raycasts the actual terrain triangles
under the lake/creek, verifies ribbon attributes and validates leaf-card topology.
`tests/browser/scenic-nature.spec.cjs` checks real WebGL compilation, the
reference texture, uniform animation, reduced motion and a home draw-call bound.
Existing home tests cover scenario reuse/disposal, viewport sizing, chat and
fallback behavior; the botanical lab test covers paths and indoor interaction.
