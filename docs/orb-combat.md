# ORB: charged blast, dash and moving water

Hold **F** (or the attack touch button) to charge; release to launch. A tap
fires a smaller shot. Full charge takes 1.15 seconds and a held input releases
automatically after another 1.75 seconds. Sato extends his right arm and uses
the left to counterbalance, then recoils and settles. Movement unlocks after
the short firing pose; the projectile continues independently.

The shot uses inverse-square planetary gravity, integrated at 120 Hz with
velocity Verlet. Initial tangential speed is 1.02 times circular orbital speed.
It follows the sphere, expires after 5.5 seconds (fading over the last half
second), and disappears on solid terrain contact. The pool contains at most
six shots. Speed, gravity and lifetime controls apply to subsequent shots;
color, gradient, size, rings and trail controls update existing effects.

**Shift** or **Dash** replaces the running toggle. The action has 110 ms of knee
compression, a 240 ms burst, 190 ms of recovery and a 950 ms cooldown. Direction
comes from movement input or the current facing when stationary. Capsule
probes still stop the character at trunks and stone sides. Six fading pose
snapshots, including a captured cape shape, accompany the burst; an expanding
ring and radial streaks mark push-off and collision. Reduced motion suppresses
afterimages and reduces the impact spread. Holding Shift does not repeat dash.

Idle shifts weight between flexed legs, offsets their stance, and turns the
head independently of the torso. Ascending and descending jump poses use
opposing arms and staggered leg tuck. Joint interpolation, recoil and the
existing cloth simulation provide follow-through. The physical root continues
to follow the motor, rather than being moved by animation.

## Debug controls

Open **Ataque · VFX** next to **Água · debug**. The panels are mutually exclusive
and scroll on small screens. The VFX panel exposes charge duration, sphere
size, emission, noise, warp, particles, rings, projectile colors, gradient,
Fresnel rim, trail, muzzle flash, trajectory, lifetime, water response and sound
volume. **Prévia da carga** holds a charge so sliders can be adjusted without
holding a key; **Disparar** and **Parar** control the preview. Sato must be awake
and grounded. The normal maximum-hold timer is disabled only for this explicit
preview. Blur, hidden tab and leaving character control cancel it.

Values persist under `sato-orb-combat-v1` in localStorage, are bounded on load,
and can be copied as JSON or restored. Input focused inside either panel does
not trigger movement or attack keys.

## Water and sound

The displacement force responds through an underdamped spring. Dispersive
radial waves and a phase-warped cross-current fold the rim back into the hollow
while charge is maintained; a decaying wake persists after release. The field
is evaluated on the CPU for contacts and in GLSL for the surface, with analytic
gradients for normals. The same settings drive both paths.

Jump now uses an original rising arcade square/triangle chirp, distinct from
the terrain recording. Double jump rises higher. Charge uses a rising two-tone
loop and a ready cue; release combines a falling oscillator, filtered noise and
a bass transient. Dash has an air burst and a collision accent. Filtered noise
with a moving filter follows water displacement and decays with its wake.
All audio uses the existing user-gesture AudioContext and master mute; hiding
the page suspends it and disposal disconnects nodes. No additional audio files
are fetched. Effects volume includes jump, dash, charge, blast and water force;
the existing ambience and recorded footsteps keep their levels.

## References and attribution

The charge/glow/noise, scrolling projectile gradient, and muzzle shader source
in `orb-blast-shaders.js` is adapted from **Christian Ortiz**,
[cortiz2894/charged-blast-vfx](https://github.com/cortiz2894/charged-blast-vfx/tree/391cbe1c60a807b674091dad4bf6a8c2ba2c6a13),
revision `391cbe1c60a807b674091dad4bf6a8c2ba2c6a13`. The dome-and-taper profile,
converging particles, ring pulses and soft trail follow the same reference.
The adaptation uses the existing Three.js runtime without adding React,
Howler, Leva or postprocessing passes. A reversed-edge smoothstep in the flow
mask was replaced with its defined complement. The linked
[video](https://www.youtube.com/watch?v=6SY1u-8EfOY) accompanies the user's
reference; its playback could not be retrieved during implementation. The
repository source was inspected directly. Audio is newly synthesized using
the reference's charge/ready/buster structure; its recordings are not copied.

Animation references: Animation Mentor's
[anticipation](https://www.animationmentor.com/blog/anticipation-the-12-basic-principles-of-animation/)
and [follow-through / overlapping action](https://www.animationmentor.com/blog/follow-through-and-overlapping-action-the-12-basic-principles-of-animation/).

## Verification

`node --test tests/orb-game.test.mjs tests/orb-power.test.mjs tests/orb-combat.test.mjs`
covers gravity and support, dash timing and collision, projectile orbital energy,
lifetime and pool bounds, transient water reversals, asymmetric poses, afterimage
expiry and setting validation. `tests/browser/orb-power.spec.cjs` exercises real
keyboard/touch input, preview controls, GPU shader rendering, CPU/GPU water
height and gradient agreement, and OfflineAudioContext sound envelopes and loop
shutdown. Existing browser audio tests cover master mute, hidden-tab suspension,
context disposal and recorded terrain contacts.
