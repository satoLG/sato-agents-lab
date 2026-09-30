# Sato runtime model

`sato-source.glb` is the original Sato asset. `sato.glb` is the runtime replacement: it keeps Sato's appearance and repaired face while using the Quaternius humanoid skeleton and animation set.

The runtime asset contains 53 bones and 45 clips, including the clips used by the lab:

- `Rig|Idle_Loop`
- `Rig|Walk_Loop`
- `Rig|Sprint_Loop`
- `Rig|Jump_Loop`

The application aliases these to `Idle`, `Walk`, `Run` and `Jump` and blends idle, walking and running based on movement speed. `createSatoAvatar().jump()` triggers the one-shot jump clip. The rest of the Quaternius clips remain available in the GLB for future interactions.

The face was rebuilt from the supplied reference: the glasses are straight, thin and black; the eyes sit close to the face; the forehead is clean; and the beard, eyebrows and smile use separate clean materials. The source and generated GLBs have embedded textures, so production does not need a model service or CDN.

The 53 bone hierarchy and 45 animations were verified after export. The GLB validator reports zero errors and zero warnings.
