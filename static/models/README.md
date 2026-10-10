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

## Model inspector and editable companion

Open `/models` directly (there is deliberately no navigation link). It exposes
all 45 Sato clips, play/pause, scrubbing, a 30 fps frame step, speed and loop
controls, orbit/zoom/pan, wireframe, bones, mesh isolation and geometry counts.
Sato uses the original `sato.glb` in both the inspector and the laboratory.
The inspector plays the raw asset clips, without the lab's locomotion blending
or its controller-owned jump trajectory.

`companion.glb` is an editable snapshot of the home robot: 43 separate meshes,
the rigid joint hierarchy, embedded optic texture and five transform animation
clips (idle and four banking directions). Import it into Blender to edit the
meshes/materials or keyframes. The home still uses `lab-rigs.js` and `poseRig`;
`companion-model.js` uses that same factory without batching, and samples its
joint transforms into glTF clips. Shader glow, animated material opacity and
emission flashes are runtime effects, not baked material animation in the GLB.

To regenerate the snapshot after changing the robot source, select the floating
robot in `/models`, choose **Baixar GLB**, and replace `companion.glb`. Sato's
download returns the original GLB bytes. **Abrir GLB local** previews exported
Blender revisions in the browser without uploading or changing site assets.
To integrate a revised robot into the home, its procedural source must be
updated or explicitly migrated to the revised GLB in a subsequent change.
