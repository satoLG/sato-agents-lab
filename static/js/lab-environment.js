import * as T from '../vendor/three.module.min.js';
import {RGBELoader} from '../vendor/RGBELoader.js';

// Vendored CC0 assets: no CDN dependency at runtime, 1K maximum.
export async function loadEnvironment(renderer, scene) {
  const loader = new T.TextureLoader();
  const url = name => new URL(`../textures/polyhaven/${name}`, import.meta.url).href;
  const [paving, normal, grass, sky, soil] = await Promise.allSettled([
    loader.loadAsync(url('pavement.jpg')), loader.loadAsync(url('pavement-normal.jpg')),
    loader.loadAsync(url('grass.jpg')), new RGBELoader().loadAsync(url('sky.hdr')),loader.loadAsync(url('forest-floor.jpg')),
  ]);
  const tiled = (result, repeat, color = true) => {
    if (result.status !== 'fulfilled') return null;
    const map = result.value; map.wrapS = map.wrapT = T.RepeatWrapping;
    map.repeat.set(...repeat); map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (color) map.colorSpace = T.SRGBColorSpace;
    return map;
  };
  if (sky.status === 'fulfilled') {
    sky.value.mapping = T.EquirectangularReflectionMapping;
    scene.background = sky.value; scene.backgroundIntensity = .8;
    scene.environment = sky.value; scene.environmentIntensity = .25;
  }
  return {
    soil: tiled(soil,[1,1]) || tiled(grass,[1,1]),
    paving: new T.MeshStandardMaterial({color:'#e1e3db',map:tiled(paving,[14,20]),normalMap:tiled(normal,[14,20],false),normalScale:new T.Vector2(.35,.35),roughness:.92}),
    grass: new T.MeshStandardMaterial({color:'#81966e',map:tiled(grass,[140,140]),roughness:1}),
  };
}
