# Laboratory placement grid

One cell is **2 × 2 m**. `lab-layout.js` owns floor, wall, sector and
service-strip reservations. Offsets are relative to each sector center; fractional
origins allow odd and even footprints to remain centered on the same axis.
`gridPlacement` converts those cells to the positions used by meshes and colliders.

Each sector has a rear band with three independent elements, all at z = −7 m:

| Element | Floor cells | Wall cells | Width × depth / height |
| --- | --- | --- | --- |
| Number panel | 2 × 1 | 2 × 3 | 2.75 × 0.44 / 5.55 m |
| Six monitors, 3 × 2 | 5 × 1 | 5 × 3 | 8.25 × 0.3 / 4.95 m |
| Sector history | 2 × 1 | 2 × 3 | 2.75 × 0.44 / 5.55 m |
| Main desk, facing the monitors | 5 × 1 | — | 8.4 × 1.65 / 1.25 m |

The number and history centers are x = −7 / +7 m; the monitors and desk are
centered at x = 0. The desk is at z = −5 m. Worker slots occupy the space
between that desk and the equipment bay. The hall sectors are 18–20 m apart.

The equipment centers sit at z = +4 m, with a maximum bay of **4 × 4 cells**:

| Sector equipment | Reserved floor cells | Arrangement |
| --- | --- | --- |
| RAG hologram projector | 4 × 4 | 6.4 m diameter, compared to the previous 11.2 m; exploration zooms in |
| Skills books | 3 × 2 | Same center relative to its desk as the RAG projector |
| MCP workshop | 3 × 3 | Drafting table, blueprint and three toolboxes |
| Providers | 3 × 3 | Two tanks and a manifold; separate overhead west service strip |
| VM | 4 × 3 | Three cabinet rows form two walkable aisles |
| Core brain cylinder | 2 × 2 | Water, floating brain and structural caps |
| Events world-clock wall | 4 × 1 | Six clocks; real time zones and a local alarm for upcoming cron timestamps |

The providers' external conduits reserve **8 × 2 cells** in the west service
strip. They cross the west wall through bulkheads, at heights above adjacent
circulation, and never enter another sector's panel or equipment bay. Their
illustrative circulation is separate from the observed provider readings.

The shell is 80 m wide, from z = −43 m to +33 m. Reception runs from z = 18
to 33 m, **two cells longer** than before. Gateway monitors at x = −14 m and
the directory at x = +14 m have the same distance to the visitor portal.

The conveyor uses one distance-parametrized path with a radius-2 m quarter turn.
Its rails, moving slats and parcels share that path. Its ceiling chute releases
parcels over the straight reception segment; only the hatch crosses the partition.

Adjacent rooms blend only within the centered portal corridors. Near all opaque
walls, the current room keeps its visibility. Camera cutaways remain independent
of that room state. Interaction prompts use projected object rectangles to choose
an above/below position, with a side position only if necessary.

Run `node --test tests/lab-*.test.mjs` for navigation, reservations, telemetry,
controls and conveyor checks. The Playwright grid test checks actual meshes,
all guide routes, first-touch input switching, multi-touch jumping, room culling,
and captures each sector on a 390 × 844 viewport.
