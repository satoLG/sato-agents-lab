# Home ambience

`amb_machinery_factory_lp_01.ogg` is the user's attached
`amb_machinery_factory_lp_01.wav` (2026-10-05), encoded with FFmpeg's
libvorbis at quality 4. Its loop runs at low gain in the home laboratory.
Existing nature audio and its provenance are in `portal2/README.md`.

## Button sounds

`button-sounds/*.mp3` come unchanged from the npm package `button-sounds` 1.0.0
(MIT, Josh Comeau; license in `button-sounds/LICENSE.txt`). Only the four
sounds the site uses are vendored. `static/js/button-sounds.js` ports the
package's player to plain Web Audio, with the same sprite map (press on
pointerdown, release on pointerup, random sample, slight pitch variation).
