# Sato runtime model

![Sato: painted face, connected hands, front and rear silhouette](sato-style-preview.png)

`sato.glb` is the current runtime character. Its appearance is rebuilt around
the existing Quaternius bind pose, following the supplied low-poly anime
references. Style revision 3 has 6,820 triangles and embeds its two
nearest-filtered pixel textures. There are no external model or texture
requests at runtime.

The neck enters beneath a projecting chin and a rising mandibular edge.
That underside is modeled in geometry; the mouth and nose retain their
previous positions, avoiding a protruding muzzle. The head/neck surface is
continuous. Painted brown anime eyes, thicker brows and a restrained smile
retain the face's identity.
Slim graphite spectacles, chestnut hair, a midnight shirt, slate trousers and
brown sneakers keep Sato recognizable. A filled hair cap follows the back of
the skull down to the nape. One connected hair surface sweeps upward and
backward from the hairline into asymmetric crown tips; the front lock belongs
to that same surface. Long chestnut highlights follow that flow. All hair is
bound exclusively to `DEF-head`. The face atlas remains identical outside
the thicker eyebrow band. Spectacles, eyes and finger shafts are preserved.

The torso has sloping shoulders, a fuller waist, flatter chest and broad,
beveled planes. Fitted sleeves lead into slender upper
arms and faceted forearms. Each arm, wrist, palm, thumb and four fingers is
one connected, closed surface. Palm and back surfaces are flat through their
center, with finger influences starting at the knuckles. The approved fingers
retain the existing three phalanx influences. Hands use
smooth corner normals on their beveled geometry while clothing and forearms
use planar normals. The upper thighs fit beneath the torso, start fuller than
the calves and taper down without lateral swelling. The trousers share a
crotch seam and taper into the
sneakers. Their forefoot uses the existing toe joints; a small heel bevel
clears the floor through the grounded clips. The neckline has room around the
neck at the front and nape and follows its deformation during head turns.

The 53 bone transforms, hierarchy and inverse bind matrices remain unchanged.
Of the 46 clips, **45 are byte-identical** to anatomy revision 1 (`2448a33`),
including the hand audition, source pistol articulation, and authored punch,
sword and torch grips. `Rig|Idle_Loop` now lowers the shoulders, straightens
the arms, angles the hands slightly inward and brings the feet closer together.
Two-bone solves preserve limb lengths, ankle height and sole pitch. Tests
fingerprint every untouched motion channel against the original baseline.

## Authoring and verification

The deterministic authoring source is `tools/style-sato.mjs`. It rebuilds
geometry and draws the two pixel atlases, then repacks the referenced buffer
views while copying untouched animation and inverse-bind bytes unchanged.
The exported `sato-style-face.png` and `sato-style-hair.png` are also available
beside the GLB for texture editing.

To regenerate, provide the style-revision-2 `static/models/sato.glb` from
commit `c4efbd8` (the unmodified idle is needed as the authoring input):

```sh
node tools/style-sato.mjs path/to/style-revision-2.glb static/models/sato.glb
npm run test:avatar
```

`npm run style:sato -- input.glb output.glb` accepts the same arguments.
Applying style revision 3 to an asset already carrying that revision is a
byte-preserving no-op. `sato-source.glb` and the older `build-sato.mjs` use
the earlier rig and are not the input for this pipeline. `refine-sato.mjs` remains the authoring
source for the preceding anatomy/contact/grip revision.

For an editable Blender file with packed textures and the 46 action clips:

```sh
blender --background --factory-startup --python tools/export-sato-blend.py -- static/models/sato.glb path/to/sato-anime.blend
```

The Blender authoring export welds coincident vertices and restores compatible
quads, retaining UV seams and the GLB's split normals as corner data. Sharp
edges keep the deliberate planes of the shirt, trousers and forearms.
Its camera and lights are in a separate preview collection. The runtime GLB is not re-exported through
Blender, so its animation fingerprints remain exact.

`npm run test:avatar` checks actual finger deformation, ground clearance,
connected manifold arm/hand surfaces, preserved mouth/finger/face fingerprints,
texture orientation, jaw/nape contours, thigh and shoulder silhouettes,
closer idle stance and inward hands, scalp coverage and neckline clearance
across moving poses, all-clip finite deformation and lab jump/attack blending.
The browser avatar
and model-inspector tests cover WebGL rendering, playback, isolation and GLB
download. The supplied screenshots are visual references; they
are not baked into the character textures.

## Runtime animation and inspector

`lab-avatar.js` blends `Rig|Idle_Loop`, `Rig|Walk_Loop` and `Rig|Sprint_Loop`
from explicit controller intent. Jump uses Jump_Start → Jump_Loop → Jump_Land
with a controller-owned height arc; punches alternate Jab/Cross. Backward
movement reverses the gait, and lateral travel turns the hips while the torso
follows aim. Footstep and action cues and reduced-motion behavior are retained.

Open `/models` directly to inspect all clips, pause/scrub/step playback,
change speed, orbit, view bones/wireframe and isolate meshes. It uses the
same `sato.glb` as the lab and plays its raw clips without controller blending.
**Baixar GLB** returns the original asset bytes. **Abrir GLB local** previews
Blender revisions without uploading or replacing site assets.

## Editable floating companion

`companion.glb` is the separate home robot: 43 editable meshes, its rigid joint
hierarchy, embedded optic texture and five transform clips (idle and four
banking directions). The home continues to use `lab-rigs.js` and `poseRig`;
`companion-model.js` exports that same factory without batching. Shader glow,
material-opacity animation and emission flashes remain runtime effects.

To regenerate that snapshot, select the floating robot in `/models`, choose
**Baixar GLB**, and replace `companion.glb`. Integrating a revised robot into
the home requires updating its procedural source or explicitly migrating it
to the revised GLB in a separate change.
