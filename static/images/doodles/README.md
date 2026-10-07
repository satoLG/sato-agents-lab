# Chat wallpaper sources

The active home wallpaper uses every currently listed generic design from the
[Popsy Hand Drawn Icons collection](https://www.svgrepo.com/collection/popsy-hand-drawn-icons/)
and [page 2](https://www.svgrepo.com/collection/popsy-hand-drawn-icons/2): 32 icons.
Site and platform logos (including YouTube, Slack, social networks, app stores,
Airbnb and PayPal) are excluded. The collection advertises 57 items, but its two
pages currently expose 45 downloadable designs; 13 are platform logos.

SVG Repo lists CC0 for these assets (for example,
[Coding](https://www.svgrepo.com/svg/474334/coding)). Original files are preserved
in `popsy/`. `popsy/manifest.json` records the active source IDs and the measured
bounds of their SVG paths, so blank margins can be cropped without editing paths.

## Active original sources

- [coding](https://www.svgrepo.com/svg/474334/coding)
- [desktop](https://www.svgrepo.com/svg/474346/desktop)
- [phone](https://www.svgrepo.com/svg/474341/phone)
- [camera](https://www.svgrepo.com/svg/474342/camera)
- [messages](https://www.svgrepo.com/svg/474337/messages)
- [music](https://www.svgrepo.com/svg/474340/music)
- [star-black](https://www.svgrepo.com/svg/474335/star-black)
- [fire](https://www.svgrepo.com/svg/474336/fire)
- [pencil](https://www.svgrepo.com/svg/474339/pencil)
- [gift-box](https://www.svgrepo.com/svg/474338/gift-box)
- [compass](https://www.svgrepo.com/svg/474294/compass)
- [plane](https://www.svgrepo.com/svg/474295/plane)
- [car-front](https://www.svgrepo.com/svg/474293/car-front)
- [bus-front](https://www.svgrepo.com/svg/474296/bus-front)
- [sailboat](https://www.svgrepo.com/svg/474297/sailboat)
- [boat](https://www.svgrepo.com/svg/474299/boat)
- [piggy-bank](https://www.svgrepo.com/svg/474298/piggy-bank)
- [heart](https://www.svgrepo.com/svg/474319/heart)
- [heart-glasses](https://www.svgrepo.com/svg/474321/heart-glasses)
- [chef-hat](https://www.svgrepo.com/svg/474300/chef-hat)
- [pisces](https://www.svgrepo.com/svg/474313/pisces)
- [tie](https://www.svgrepo.com/svg/474314/tie)
- [aquarius](https://www.svgrepo.com/svg/474315/aquarius)
- [aries](https://www.svgrepo.com/svg/474316/aries)
- [cancer](https://www.svgrepo.com/svg/474317/cancer)
- [christmas-ornament](https://www.svgrepo.com/svg/474318/christmas-ornament)
- [christmas-tree](https://www.svgrepo.com/svg/474320/christmas-tree)
- [buy](https://www.svgrepo.com/svg/474344/buy)
- [shopping-cart](https://www.svgrepo.com/svg/474345/shopping-cart)
- [24](https://www.svgrepo.com/svg/474347/24)
- [dollar](https://www.svgrepo.com/svg/474348/dollar)
- [euro](https://www.svgrepo.com/svg/474349/euro)

## Composition

Regenerate with `node tools/build-chat-wallpaper.mjs`. A 600px tile holds 400
compact slots on an equal 30px pitch. At the existing 540px CSS repeat size,
centers are 27px apart, with a minimum separation of approximately 1px between
conservative rotated bounds. Blank source margins are removed using cached
original path bounds. All shapes retain their original proportions and paths;
modest seeded rotations keep the hand-drawn feel. Narrow designs tilt more to
fill the slots. Shuffled complete decks give every active design a balanced
frequency. There are no random placement gaps or displacement filters.

The generator checks every pair of rotated bounds, including repeat seams and
corners, verifies that all designs are used, rejects platform names, and requires
at least 70% of the tile to be occupied by drawing bounds. This is footprint
coverage, rather than the fraction of filled ink inside the outline drawings.
Black ink is recolored to muted green, with white interiors matching the default
background. Assets are local; no SVG Repo request occurs at runtime.

Retired source files remain available but are not used in the wallpaper. Earlier
non-Popsy sources, listed as CC0 when acquired:

- https://www.svgrepo.com/svg/452661/robot-neutral
- https://www.svgrepo.com/svg/452659/robot-love
- https://www.svgrepo.com/svg/151019/game-control-doodle
- https://www.svgrepo.com/svg/140738/game-console
- https://www.svgrepo.com/svg/456198/computer-chip
- https://www.svgrepo.com/svg/9288/robot-hand-drawn-outline
- https://www.svgrepo.com/svg/27468/rocket-hand-drawn-outline
- https://www.svgrepo.com/svg/157945/star-hand-drawn-symbol-outline
- https://www.svgrepo.com/svg/166626/joystick
