# Sato runtime model

`sato-source.glb` is the original Sato asset. `sato.glb` is the runtime replacement: it keeps Sato's appearance and repaired face while using the Quaternius humanoid skeleton and animation set.

The runtime asset contains 53 bones and 45 clips, including the clips used by the lab:

- `Rig|Idle_Loop`
- `Rig|Walk_Loop`
- `Rig|Sprint_Loop`
- `Rig|Jump_Loop`

The application aliases these to `Idle`, `Walk`, `Run` and `Jump` and blends idle, walking and running based on movement speed. `createSatoAvatar().jump()` triggers the one-shot jump clip. The rest of the Quaternius clips remain available in the GLB for future interactions.

The face was rebuilt from the supplied reference: the glasses are straight, thin and black; the eyes sit close to the face; the forehead is clean; and the beard, eyebrows and smile use separate clean materials. The source and generated GLBs have embedded textures, so production does not need a model service or CDN.

The 53-bone hierarchy and 45 animations were verified after export. The GLB validator reports zero errors and zero warnings.


## Face and locomotion revision

The runtime GLB now has a projected chin, wider mandibular corners, a closed nose
embedded into the face, symmetric ears with inner folds, and a shorter rear hair
silhouette. The 53-bone rig and all 45 source clips are retained.

`lab-avatar.js` selects walking/running from explicit controller intent, uses
Jump_Start → Jump_Loop → Jump_Land with a controller-owned arc, and alternates
Punch_Jab/Punch_Cross. Full-body actions fade against locomotion with normalized
weights. The hips steer into lateral travel while the torso follows aim; backward
movement reverses the gait. Foot contacts, takeoff, landing and punches emit sound
cues. Ambient reduced motion keeps direct jump/attack input available.

Checks: `npm run test:avatar`, `npm run test:controls`, `npm run test:navigation`.
The revised GLB passes glTF Validator with zero errors and zero warnings.
