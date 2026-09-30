# Portal 2 sound samples

Selected at the user’s request from https://github.com/sourcesounds/portal2/tree/master/sound. Source game: Portal 2, Valve. Public repository availability does not imply public-domain licensing; original rights remain with their holders.

- `click.wav`: `sound/ui/p2_store_ui_tab_click_01.wav`
- `node.wav`: `sound/ui/ui_coop_hud_focus_01.wav`
- `chat.wav`: `sound/ui/ui_coop_hud_activate_01.wav`
- `answer.wav`: `sound/buttons/button_synth_positive_01.wav`
- `error.wav`: `sound/buttons/button_synth_negative_01.wav`
- `door.wav`: `sound/doors/default_move.wav`
- `arrival.wav`: `sound/labs/door_open_chime_01.wav`
- `drop.wav`: `sound/physics/cube/physics_cube_impact_hard_01.wav`
- `pickup.wav`: `sound/items/ammo_pickup.wav`
- `hum.wav`: `sound/ambient/machines/beam_platform_loop1.wav`
- `walk1.wav`: `sound/player/footsteps/p2_fs_walk_tile_01.wav`
- `walk2.wav`: `sound/player/footsteps/p2_fs_walk_tile_02.wav`
- `walk3.wav`: `sound/player/footsteps/p2_fs_walk_tile_03.wav`
- `walk4.wav`: `sound/player/footsteps/p2_fs_walk_tile_04.wav`

## Movement and localized machinery

The following original Portal 2 samples are stored locally. Running, landing, robot steps and servos use separate variations; cloth foley supports takeoff, and whoosh foley supports punches. Short UI clicks are used as keyboard taps, editor blips as computer feedback. Machinery and electrical cues play only close to their source. The old global hum is no longer loaded or played.

- `run1.wav`: `sound/player/footsteps/p2_fs_run_tile_01.wav` (0.3 s).
- `run2.wav`: `sound/player/footsteps/p2_fs_run_tile_02.wav` (0.265 s).
- `run3.wav`: `sound/player/footsteps/p2_fs_run_tile_03.wav` (0.3 s).
- `run4.wav`: `sound/player/footsteps/p2_fs_run_tile_04.wav` (0.259 s).
- `land1.wav`: `sound/player/footsteps/p2_fs_jump_land_tile_01.wav` (0.518 s).
- `land2.wav`: `sound/player/footsteps/p2_fs_jump_land_tile_02.wav` (0.386 s).
- `robotStep1.wav`: `sound/player/footsteps/coop_bot_ball_fs_robotics_impact_light_01.wav` (0.25 s).
- `robotStep2.wav`: `sound/player/footsteps/coop_bot_ball_fs_robotics_impact_light_02.wav` (0.249 s).
- `robotStep3.wav`: `sound/player/footsteps/coop_bot_ball_fs_robotics_impact_light_03.wav` (0.25 s).
- `robotServo1.wav`: `sound/player/footsteps/coop_bot_ball_fs_robotics_leadin_01.wav` (1.013 s).
- `robotServo2.wav`: `sound/player/footsteps/coop_bot_ball_fs_robotics_leadin_02.wav` (1.259 s).
- `jump1.wav`: `sound/player/coop_foley/coop_cloth_foley_01.wav` (0.603 s).
- `jump2.wav`: `sound/player/coop_foley/coop_cloth_foley_02.wav` (0.53 s).
- `punch1.wav`: `sound/player/coop_foley/coop_foley_whoosh_01.wav` (0.381 s).
- `punch2.wav`: `sound/player/coop_foley/coop_foley_whoosh_02.wav` (0.922 s).
- `typing1.wav`: `sound/ui/buttonclick.wav` (0.21 s).
- `typing2.wav`: `sound/ui/p2_store_ui_tab_click_01.wav` (0.044 s).
- `computer1.wav`: `sound/ui/p2_editor_blips_04.wav` (6.407 s).
- `computer2.wav`: `sound/ui/p2_editor_blips_09.wav` (6.999 s).
- `equipment1.wav`: `sound/ambient/machines/portalgun_rotate1.wav` (1.331 s).
- `equipment2.wav`: `sound/plats/paint_piston_start_01.wav` (2.276 s).
- `energy1.wav`: `sound/player/coop_electric/coop_bot_spark_01.wav` (2.184 s).
- `energy2.wav`: `sound/player/coop_electric/coop_bot_spark_02.wav` (2.555 s).

New samples are converted to mono PCM 16-bit / 22.05 kHz, loudness balanced, with short fade-in/out. Longer mechanisms, computer blips, electric sparks and foley use short excerpts (0.24–0.75 s). `movement-sources.json` records the source URL, excerpt start/duration and gain. No continuous ambient hum or procedural oscillator is used.
