# Sato Mimic: tool catalog and performer

The robot has a spherical floating body, a blue 34×19 LED visor and exactly two floating arms that morph between balls and paddles. A new imitation is a finite choreography of these existing parts, rather than new geometry or executable code.

## Contract

`GET /api/sato-agent/mimic/tools` advertises the shared catalog from `static/data/mimic-capabilities.json`. Each tool has a `name`, `description` and object `inputSchema`, following the [MCP tool-list convention](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html). This is the in-app tool interface; it does not advertise an external MCP transport/server.

| Tool | Effect |
|---|---|
| `visor_draw` | Select a drawing made of bounded LED line, ellipse and rounded-box primitives; `-1` restores normal eyes. |
| `arm_pose` | Set one existing arm's orbit direction, aim, ball/paddle shape, length, width, reach and axial twist. |
| `body_pose` | Add bounded lift, pitch, yaw and roll relative to the current floor and facing. |

The model receives the catalog, the complete curated application library and the requested imitation on **every model-planned imitation**, including a repair attempt. This data lives in `static/data/mimic-presets.json` (performances) and `mimic-library.json` (aliases, category and recognition cues). It is not installed in Hermes memory, rules or skills. Ordinary professional chat does not receive the library. Planning excludes professional context, operational memories and machine tools.

## Curated library and derivation

| Category | Presets |
|---|---|
| Animals | Rabbit, bird, cat, fish |
| Vehicles | Car, train, helicopter, sailboat |
| Objects | Clock, umbrella, camera, heart |
| Nature | Tree, rain, wave, flower |

Each base coordinates a visor pictogram/face, arm silhouette and two endpoint poses. Recognition cues tell the model which visual features must survive an adaptation. Exact Portuguese/English aliases use the same shared data immediately in the browser or server, without a model call. Modifiers such as `pássaro bravo` or `carro de corrida` still go to the planner.

The preferred response is a small derivation:

```json
{"possible":true,"base":"car","label":"um carro de corrida","cycles":3,"changes":[{"frame":1,"calls":[{"name":"arm_pose","arguments":{"side":"left","width":1.45}}]}]}
```

`base` selects a known application preset. `label` is required; optional `duration`, `cycles` and `drawings` replace those fields. Each `changes` entry selects an existing **frame index**, then merges tool arguments into the matching tool/arm at that frame. Unchanged fields, drawings and frames retain the authored base. The server derives a fresh copy, then validates the complete result against the existing browser contract. Bases are never mutated. Unknown fields, full timelines, invalid indices/tools and values outside the contract are rejected, with at most one precise correction attempt. Refusals use `{possible:false,reason:"..."}`. Existing completed performances and the browser/API performance format remain compatible; only new model planning requires a base.

The complete context is about 35 KB of compact JSON/text, rather than storing these application details in global agent memory. Updating the versioned application files updates future imitation requests.

## Performance

A performance carries version/id/label, 3–12 seconds of duration, 1–3 cycles, up to four drawings and 2–8 normalized frames. The first frame is at 0, the last at 1. Each frame contains up to four `{name, arguments}` calls; targets persist until changed, including omitted pose parameters. Calls at the same frame are applied in order. A cycle smoothly traverses first→last→first. This gives a finite expressive motion without unrestricted loops.

Both Python and JavaScript validate the same JSON Schema plus cross-field invariants: ordered frames, valid drawing references, nonzero direction vectors, LED y coordinates within 0–19, finite values and no unknown properties/tools. The whole plan is validated before any pose changes. The executor never evaluates code, creates extra limbs/props, changes cameras or translates the robot through the world.

`mimic-contract.js` compiles calls into target poses. `mimic-performer.js` interpolates the two arms and local body movement, rasterizes drawings into small distance fields and blends them on the existing LED shader. The same two GPU textures are reused. Completion/cancellation restores neutral controls. Reduced motion uses a still expressive pose. Esc, `/mimic parar`, other reactions, exploration and scenario changes cancel the performance.

## Chat and outcomes

All sixteen exact presets are shared data and play immediately. Other `/mimic …` and natural imitation requests use the existing authenticated chat queue and model runner. Plans and execution status are additive keys in the existing job-context JSON; there is no database-column migration or history rewrite. Older clients ignore the extra response fields.

The browser executes only a newly completed request and tracks its id to prevent replay on polling/history reload. It reports `started`, `completed`, `cancelled` or `unavailable` to the CSRF-protected `jobs/<id>/mimic-result` endpoint. Terminal reports are idempotent and cannot be overwritten by late events. The visible response describes completion only after the browser reports it.

## Extending

Add a primitive to the shared catalog and schema, implement its compiler/executor handler, and add matching boundary and visual tests. For another preset, add a valid performance to `mimic-presets.json` and matching aliases/recognition cues to `mimic-library.json`; the same data feeds local execution and every planner context. The browser suite renders both endpoints of the entire library through the real LED shader and arm rig for visual review. Future external MCP integration can adapt this registry and the existing execution-result channel to a selected browser/session; transport and authentication must be supplied explicitly rather than treating this catalog endpoint as a complete MCP server.
