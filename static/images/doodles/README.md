# Chat wallpaper sources

The active home wallpaper uses 30 original SVGs from the
[Popsy Hand Drawn Icons collection](https://www.svgrepo.com/collection/popsy-hand-drawn-icons/)
on SVG Repo. SVG Repo lists CC0 for these assets (for example,
[Coding](https://www.svgrepo.com/svg/474334/coding)). Original files are kept in
`popsy/`; `popsy/manifest.json` records all source IDs.

Technology and digital media: coding, desktop, phone, camera, messages, Google
Play, App Store, Slack, Reddit, Messenger, YouTube, Spotify, Instagram, Twitter,
Facebook, Pinterest and music. The collection has no robot or game-controller
icon; the other 13 drawings add the spontaneous mix requested for the wallpaper.

## Original sources

- [coding](https://www.svgrepo.com/svg/474334/coding)
- [desktop](https://www.svgrepo.com/svg/474346/desktop)
- [phone](https://www.svgrepo.com/svg/474341/phone)
- [camera](https://www.svgrepo.com/svg/474342/camera)
- [messages](https://www.svgrepo.com/svg/474337/messages)
- [google-play](https://www.svgrepo.com/svg/474332/google-play)
- [app-store](https://www.svgrepo.com/svg/474331/app-store)
- [slack](https://www.svgrepo.com/svg/474329/slack)
- [reddit](https://www.svgrepo.com/svg/474328/reddit)
- [messenger](https://www.svgrepo.com/svg/474325/messenger)
- [youtube](https://www.svgrepo.com/svg/474326/youtube)
- [spotify](https://www.svgrepo.com/svg/474327/spotify)
- [instagram](https://www.svgrepo.com/svg/474324/instagram)
- [twitter](https://www.svgrepo.com/svg/474323/twitter)
- [facebook](https://www.svgrepo.com/svg/474322/facebook)
- [pinterest](https://www.svgrepo.com/svg/474330/pinterest)
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

## Composition

Regenerate with `node tools/build-chat-wallpaper.mjs`. Each of the 30 designs
appears four times per 600px tile, shuffled into stable scattered positions.
The SVG boxes are 22–35px (about 20–32px at the CSS repeat size), with modest
random rotations. Conservative collision checks keep a 6px gap between rotated
bounds, including across repeat edges and corners. The original irregular paths
are preserved without a displacement filter. Black ink is recolored to muted
green and white interiors match the default background. Assets are local;
there are no requests to SVG Repo at runtime.

The previous nine SVGs remain available in this directory but are not used by
the wallpaper. Their SVG Repo sources, listed as CC0 when acquired:

- https://www.svgrepo.com/svg/452661/robot-neutral
- https://www.svgrepo.com/svg/452659/robot-love
- https://www.svgrepo.com/svg/151019/game-control-doodle
- https://www.svgrepo.com/svg/140738/game-console
- https://www.svgrepo.com/svg/456198/computer-chip
- https://www.svgrepo.com/svg/9288/robot-hand-drawn-outline
- https://www.svgrepo.com/svg/27468/rocket-hand-drawn-outline
- https://www.svgrepo.com/svg/157945/star-hand-drawn-symbol-outline
- https://www.svgrepo.com/svg/166626/joystick
