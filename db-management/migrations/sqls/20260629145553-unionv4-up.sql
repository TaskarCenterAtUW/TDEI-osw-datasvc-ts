-- =============================================================================
-- content.tdei_union_dataset
-- Version: v5 (clean rewrite)
--
-- STRATEGY:
--   DS1 (src_one) is the immutable source of truth.
--   DS2 (src_two) is stitched into DS1:
--     • DS2 nodes within proximity of a TYPE-COMPATIBLE DS1 node snap to it.
--       Type compatibility uses set-membership: a node carries the groups of
--       every edge it lies on. A road node never snaps to a sidewalk node.
--     • DS2 nodes with no compatible nearby DS1 node are added as new nodes
--       (a type-incompatible neighbour does NOT drop the node — it stays
--       unsnapped so its edge survives).
--     • DS2 edges are reconstructed using snapped endpoint positions so they
--       connect exactly to DS1 node positions.
--     • DS2 edges that duplicate a DS1 edge (same node pair) are dropped (Pass 1).
--     • DS2 edges geometrically subsumed (≥80%) by SAME-TYPE DS1 edge buffers
--       are dropped (Pass 2), UNLESS both endpoints are shared nodes
--       (connectivity guard keeps connection-critical segments).
--
--   DS1 IMMUTABILITY EXCEPTION (Rule 3): where a road edge and a crossing edge
--   genuinely intersect, a shared node (id 'ixn-<road>-<crossing>') is created
--   and BOTH edges are split at it. This is the only case DS1 is modified.
--
--   TYPE CLASSIFICATION: edge type ('road'/'pedestrian'/'crossing'/'other')
--   is read ONLY from standard OSW identifying fields (highway, footway).
--   ext:* fields are non-identifying and never drive typing. Extension POINTS
--   are typed from their OSW identifying tag (power=pole, amenity=bench, …) and
--   merge only with the same point type.
--
--   CONFIDENCE: snapped/merged elements carry ext:union_confidence (0–1) from
--   proximity + type match, with merged/carried status for chained unions.
--
-- NODE PROPERTY MERGING RULE:
--   DS1 node properties are authoritative and are NEVER overridden.
--   Properties from the snapped DS2 node that do NOT already exist on DS1
--   are added to the output node as-is (key-for-key, no prefix).
--   Example:
--     DS1 node: { "barrier": "kerb", "surface": "asphalt" }
--     DS2 node: { "barrier": "kerb", "tactile_paving": "yes", "surface": "concrete" }
--     Output:   { "barrier": "kerb", "surface": "asphalt", "tactile_paving": "yes" }
--     ↑ "surface" not overridden, "tactile_paving" added (new key)
--
-- ALGORITHM PHASES:
--   Phase 1 – Load raw inputs (nodes, edges, zones, extensions)
--   Phase 2 – Map DS2 nodes to nearest DS1 node within proximity (NodeMap)
--   Phase 1b– Classify edge type groups + node group sets (type-awareness)
--   Phase 3 – DS1 nodes on DS2 edge interiors → type-guarded split points;
--             plus Rule 3 road×crossing shared-node creation
--   Phase 4 – Build split fractions for each DS2 edge
--   Phase 5 – Reconstruct DS2 sub-edges with snapped endpoints
--   Phase 6 – Compose output: DS1 (+ Rule 3 splits) + DS2 stitched & deduped;
--             node confidence + audit tags
--   Phase 7 – Zones (overlap-based), extension points (type-guarded merge),
--             lines and polygons
--   Phase 8 – Mixed-type property normalisation + export cursors
-- =============================================================================

CREATE OR REPLACE FUNCTION content.tdei_union_dataset(
    src_one_tdei_dataset_id  CHARACTER VARYING,
    src_two_tdei_dataset_id  CHARACTER VARYING,
    proximity                REAL DEFAULT 0.5
)
RETURNS TABLE(file_name TEXT, cursor_ref REFCURSOR)
LANGUAGE plpgsql
COST 100
VOLATILE PARALLEL UNSAFE
ROWS 1000
AS $BODY$
DECLARE
    result_cursor           REFCURSOR;
    fname                   TEXT;
    node_mixed_type_keys    JSONB;
    edge_mixed_type_keys    JSONB;
    zone_mixed_type_keys    JSONB;
    point_mixed_type_keys   JSONB;
    line_mixed_type_keys    JSONB;
    polygon_mixed_type_keys JSONB;
    proximity_degrees       REAL;
    snap_tolerance          FLOAT8 := 1e-8;
    union_label             TEXT;

BEGIN
    -- 1° latitude ≈ 111,111 m
    proximity_degrees := proximity / 111111.0;

    -- Union label for confidence provenance (auto-derived, no new parameter).
    -- Identifies which union produced a confidence score, enabling chained
    -- unions to distinguish freshly-scored ('merged') vs carried-forward values.
    union_label := src_one_tdei_dataset_id || '+' || src_two_tdei_dataset_id;

    -- =========================================================================
    -- PHASE 1: Load raw inputs
    -- =========================================================================
    RAISE NOTICE 'Phase 1: Loading inputs at %', clock_timestamp();

    DROP TABLE IF EXISTS testnodes;
    CREATE TEMP TABLE testnodes ON COMMIT DROP AS
    SELECT n.tdei_dataset_id AS source,
           n.id              AS element_id,
           n.feature,
           n.node_id,
           n.node_loc        AS geom
    FROM content.node n
    WHERE n.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON testnodes (element_id, source);
    CREATE INDEX ON testnodes USING GIST (geom);

    DROP TABLE IF EXISTS testedges;
    CREATE TEMP TABLE testedges ON COMMIT DROP AS
    SELECT e.tdei_dataset_id AS source,
           e.id              AS element_id,
           e.edge_loc        AS geom,
           e.feature
    FROM content.edge e
    WHERE e.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON testedges (element_id, source);
    CREATE INDEX ON testedges USING GIST (geom);

    DROP TABLE IF EXISTS testzones;
    CREATE TEMP TABLE testzones ON COMMIT DROP AS
    SELECT z.tdei_dataset_id AS source,
           z.id              AS element_id,
           z.zone_loc        AS geom,
           z.feature,
           z.node_ids
    FROM content.zone z
    WHERE z.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON testzones (element_id, source);
    CREATE INDEX ON testzones USING GIST (geom);

    -- Zone vertex points — used for ring reconstruction in Phase 7
    DROP TABLE IF EXISTS testzonepoints;
    CREATE TEMP TABLE testzonepoints ON COMMIT DROP AS
    SELECT z.source,
           z.element_id,
           p.path[1] AS element_sub_id,
           p.path[2] AS element_sub_sub_id,
           p.geom
    FROM testzones z, LATERAL ST_DumpPoints(z.geom) p;
    CREATE INDEX ON testzonepoints (element_id, source);

    DROP TABLE IF EXISTS ext_points;
    CREATE TEMP TABLE ext_points ON COMMIT DROP AS
    SELECT n.tdei_dataset_id AS source,
           n.id              AS element_id,
           n.feature,
           n.point_id,
           n.point_loc       AS geom,
           -- Point type from OSW identifying fields (key=value). Two points
           -- merge only when this matches — a pole never merges with a bench.
           -- Per OSW v0.3 Points schema:
           --   power=pole, emergency=fire_hydrant, amenity=bench/waste_basket,
           --   barrier=bollard, man_made=manhole, highway=street_lamp, natural=tree
           CASE
               WHEN (n.feature::jsonb->'properties'->>'power') = 'pole'
                    THEN 'power_pole'
               WHEN (n.feature::jsonb->'properties'->>'emergency') = 'fire_hydrant'
                    THEN 'fire_hydrant'
               WHEN (n.feature::jsonb->'properties'->>'amenity') = 'bench'
                    THEN 'bench'
               WHEN (n.feature::jsonb->'properties'->>'amenity') = 'waste_basket'
                    THEN 'waste_basket'
               WHEN (n.feature::jsonb->'properties'->>'barrier') = 'bollard'
                    THEN 'bollard'
               WHEN (n.feature::jsonb->'properties'->>'man_made') = 'manhole'
                    THEN 'manhole'
               WHEN (n.feature::jsonb->'properties'->>'highway') = 'street_lamp'
                    THEN 'street_lamp'
               WHEN (n.feature::jsonb->'properties'->>'natural') = 'tree'
                    THEN 'tree'
               ELSE 'other'
           END               AS point_type
    FROM content.extension_point n
    WHERE n.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON ext_points (element_id, source);
    CREATE INDEX ON ext_points (point_type);
    CREATE INDEX ON ext_points USING GIST (geom);

    DROP TABLE IF EXISTS ext_lines;
    CREATE TEMP TABLE ext_lines ON COMMIT DROP AS
    SELECT e.tdei_dataset_id AS source,
           e.id              AS element_id,
           e.line_loc        AS geom,
           e.feature
    FROM content.extension_line e
    WHERE e.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON ext_lines (element_id, source);
    CREATE INDEX ON ext_lines USING GIST (geom);

    DROP TABLE IF EXISTS ext_polygons;
    CREATE TEMP TABLE ext_polygons ON COMMIT DROP AS
    SELECT z.tdei_dataset_id AS source,
           z.id              AS element_id,
           z.polygon_loc     AS geom,
           z.feature
    FROM content.extension_polygon z
    WHERE z.tdei_dataset_id IN (src_one_tdei_dataset_id, src_two_tdei_dataset_id);
    CREATE INDEX ON ext_polygons (element_id, source);
    CREATE INDEX ON ext_polygons USING GIST (geom);

    -- Split into DS1 / DS2 working tables
    DROP TABLE IF EXISTS ds1_nodes;
    CREATE TEMP TABLE ds1_nodes ON COMMIT DROP AS
    SELECT element_id::TEXT AS element_id, geom, feature
    FROM testnodes WHERE source = src_one_tdei_dataset_id;
    CREATE INDEX ON ds1_nodes (element_id);
    CREATE INDEX ON ds1_nodes USING GIST (geom);

    DROP TABLE IF EXISTS ds2_nodes;
    CREATE TEMP TABLE ds2_nodes ON COMMIT DROP AS
    SELECT element_id::TEXT AS element_id, geom, feature
    FROM testnodes WHERE source = src_two_tdei_dataset_id;
    CREATE INDEX ON ds2_nodes (element_id);
    CREATE INDEX ON ds2_nodes USING GIST (geom);

    DROP TABLE IF EXISTS ds1_edges;
    CREATE TEMP TABLE ds1_edges ON COMMIT DROP AS
    SELECT element_id::TEXT AS element_id, geom, feature
    FROM testedges WHERE source = src_one_tdei_dataset_id;
    CREATE INDEX ON ds1_edges (element_id);
    CREATE INDEX ON ds1_edges USING GIST (geom);

    DROP TABLE IF EXISTS ds2_edges;
    CREATE TEMP TABLE ds2_edges ON COMMIT DROP AS
    SELECT element_id::TEXT AS element_id, geom, feature
    FROM testedges WHERE source = src_two_tdei_dataset_id;
    CREATE INDEX ON ds2_edges (element_id);
    CREATE INDEX ON ds2_edges USING GIST (geom);

    RAISE NOTICE 'Phase 1 complete: ds1_nodes=%, ds2_nodes=%, ds1_edges=%, ds2_edges=%',
        (SELECT COUNT(*) FROM ds1_nodes),
        (SELECT COUNT(*) FROM ds2_nodes),
        (SELECT COUNT(*) FROM ds1_edges),
        (SELECT COUNT(*) FROM ds2_edges);

    -- =========================================================================
    -- PHASE 1b: Edge & Node type-group classification (OSW schema based)
    --
    -- Type groups (from highway / footway identifying fields):
    --   'crossing'   : highway=footway AND footway IN (crossing, traffic_island)
    --   'pedestrian' : highway IN (footway, pedestrian, steps, living_street)
    --                  (footway WITHOUT crossing subtag)
    --   'road'       : highway IN (primary, secondary, tertiary, residential,
    --                              service, unclassified, trunk)
    --   'other'      : anything else
    --
    -- IMPORTANT — node typing uses SET MEMBERSHIP, not single type.
    -- A node inherits the set of groups of ALL edges incident to it.
    -- This is the critical fix that prior entity-type attempts missed:
    -- a junction node shared by footway+sidewalk+crossing has no single
    -- type, but it DOES belong to the set {pedestrian, crossing}. Snapping
    -- is allowed when two nodes share ANY group (set intersection non-empty).
    --
    -- Example:
    --   road node R          → groups {road}
    --   sidewalk node S      → groups {pedestrian}
    --   R ∩ S = ∅            → S must NOT snap to R
    --   crossing meets road at node X → X groups {road, crossing}
    --   crossing node C      → groups {crossing}
    --   C ∩ X = {crossing}   → C MAY snap to X  (schema: road+crossing share node)
    -- =========================================================================

    -- Classify every edge (both datasets) into one type group
    DROP TABLE IF EXISTS edge_type_groups;
    CREATE TEMP TABLE edge_type_groups ON COMMIT DROP AS
    SELECT
        element_id,
        'ds1'::TEXT AS src,
        geom,
        feature,
        CASE
            -- Type is determined ONLY by standard OSW identifying fields
            -- (highway, footway). Per OSW schema, anything under ext:* is
            -- optional, non-identifying metadata and MUST NOT drive typing.
            -- Crossing: highway=footway AND footway in (crossing, traffic_island)
            WHEN (feature::jsonb->'properties'->>'highway') = 'footway'
             AND (feature::jsonb->'properties'->>'footway') IN ('crossing','traffic_island')
                THEN 'crossing'
            -- Pedestrian: highway in footway/pedestrian/steps/living_street
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('footway','pedestrian','steps','living_street')
                THEN 'pedestrian'
            -- Road: highway in the road classes
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('primary','secondary','tertiary','residential',
                     'service','unclassified','trunk','motorway')
                THEN 'road'
            -- No standard identifying field → untyped. Type guards fall back
            -- to 'allow' so untyped data behaves like the pre-type baseline.
            ELSE 'other'
        END AS type_group
    FROM ds1_edges
    UNION ALL
    SELECT
        element_id,
        'ds2'::TEXT AS src,
        geom,
        feature,
        CASE
            -- Type is determined ONLY by standard OSW identifying fields
            -- (highway, footway). Per OSW schema, anything under ext:* is
            -- optional, non-identifying metadata and MUST NOT drive typing.
            -- Crossing: highway=footway AND footway in (crossing, traffic_island)
            WHEN (feature::jsonb->'properties'->>'highway') = 'footway'
             AND (feature::jsonb->'properties'->>'footway') IN ('crossing','traffic_island')
                THEN 'crossing'
            -- Pedestrian: highway in footway/pedestrian/steps/living_street
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('footway','pedestrian','steps','living_street')
                THEN 'pedestrian'
            -- Road: highway in the road classes
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('primary','secondary','tertiary','residential',
                     'service','unclassified','trunk','motorway')
                THEN 'road'
            -- No standard identifying field → untyped. Type guards fall back
            -- to 'allow' so untyped data behaves like the pre-type baseline.
            ELSE 'other'
        END AS type_group
    FROM ds2_edges;

    CREATE INDEX ON edge_type_groups (element_id, src);
    CREATE INDEX ON edge_type_groups USING GIST (geom);
    CREATE INDEX ON edge_type_groups (type_group);

    -- Node type-groups: each node carries the SET of type groups of every edge
    -- it lies ON — at an endpoint OR an interior vertex.
    --
    -- CRITICAL: many datasets register EVERY vertex of an edge as a node
    -- (e.g. a 15-vertex sidewalk has 15 nodes). Only 2 are edge endpoints;
    -- the other 13 are interior vertices. If we only grouped by endpoint
    -- incidence, those 13 interior nodes would be UNTYPED, and the type guard's
    -- 'untyped → allow' fallback would let a road node merge with them.
    --
    -- Fix: a node belongs to an edge's type group if it lies within
    -- snap_tolerance of the edge GEOMETRY (ST_DWithin on the line, GIST-indexed),
    -- not just its endpoints. This correctly types interior-vertex nodes by the
    -- edge they sit on.
    --
    -- edge_type_groups already has the line geom + type_group + src, GIST-indexed.
    -- DS1 nodes:
    DROP TABLE IF EXISTS ds1_node_groups;
    CREATE TEMP TABLE ds1_node_groups ON COMMIT DROP AS
    SELECT
        n.element_id,
        n.geom,
        COALESCE(
            ARRAY_AGG(DISTINCT etg.type_group)
                FILTER (WHERE etg.type_group IS NOT NULL),
            ARRAY[]::TEXT[]
        ) AS groups
    FROM ds1_nodes n
    LEFT JOIN edge_type_groups etg
        ON etg.src = 'ds1'
        AND ST_DWithin(n.geom, etg.geom, snap_tolerance)   -- on the line, GIST-indexed
    GROUP BY n.element_id, n.geom;

    CREATE INDEX ON ds1_node_groups (element_id);
    CREATE INDEX ON ds1_node_groups USING GIST (geom);

    -- DS2 nodes:
    DROP TABLE IF EXISTS ds2_node_groups;
    CREATE TEMP TABLE ds2_node_groups ON COMMIT DROP AS
    SELECT
        n.element_id,
        n.geom,
        COALESCE(
            ARRAY_AGG(DISTINCT etg.type_group)
                FILTER (WHERE etg.type_group IS NOT NULL),
            ARRAY[]::TEXT[]
        ) AS groups
    FROM ds2_nodes n
    LEFT JOIN edge_type_groups etg
        ON etg.src = 'ds2'
        AND ST_DWithin(n.geom, etg.geom, snap_tolerance)   -- on the line, GIST-indexed
    GROUP BY n.element_id, n.geom;

    CREATE INDEX ON ds2_node_groups (element_id);
    CREATE INDEX ON ds2_node_groups USING GIST (geom);

    RAISE NOTICE 'Phase 1b complete: edge types and node groups classified at %',
        clock_timestamp();

    -- =========================================================================
    -- PHASE 2: NodeMap — snap DS2 nodes to nearest DS1 node within proximity
    --
    -- Each DS2 node maps to either:
    --   (a) the nearest TYPE-COMPATIBLE DS1 node within proximity → snapped=TRUE
    --   (b) itself, when no DS1 node is nearby OR the only nearby DS1 node is
    --       type-incompatible (e.g. road vs sidewalk)            → snapped=FALSE
    --
    -- Output: node_map
    --   ds2_node_id  – original DS2 node element_id
    --   out_node_id  – DS1 node id if snapped, else DS2 node id
    --   out_geom     – DS1 node position if snapped, else DS2 position
    --   snapped      – TRUE if this DS2 node maps to a DS1 node
    -- =========================================================================
    RAISE NOTICE 'Phase 2: Building NodeMap at %', clock_timestamp();

    -- Rule 1 — type-aware snap guard.
    -- A DS2 node may snap to a DS1 node ONLY if their type-group sets
    -- intersect (share at least one group). This blocks a pedestrian
    -- (sidewalk/footway) node from snapping onto a pure road node, while
    -- still allowing shared junctions and the road+crossing shared-node case.
    --
    -- The && operator is PostgreSQL array-overlap: TRUE if the two arrays
    -- share any element. Empty-group nodes (no incident edges classified)
    -- fall back to allowing the snap (no type info → don't block).
    -- node_map now also captures confidence signals for snapped nodes:
    --   snap_dist  : distance between DS2 node and the DS1 node it snapped to
    --   type_match : 1.0 if type-group sets intersect (exact), 0.5 if untyped fallback
    -- These feed the node confidence score in Phase 6.
    DROP TABLE IF EXISTS node_map;
    CREATE TEMP TABLE node_map ON COMMIT DROP AS
    SELECT DISTINCT ON (n2.element_id)
        n2.element_id                           AS ds2_node_id,
        n2.geom                                 AS ds2_geom,
        n2.feature                              AS ds2_feature,
        COALESCE(d1.element_id,  n2.element_id) AS out_node_id,
        COALESCE(d1.geom,        n2.geom)       AS out_geom,
        (d1.element_id IS NOT NULL)             AS snapped,
        d1.feature                              AS ds1_feature,
        -- snap distance (NULL when not snapped)
        CASE WHEN d1.element_id IS NOT NULL
             THEN ST_Distance(n2.geom, d1.geom) END  AS snap_dist,
        -- type match quality: exact group overlap = 1.0, untyped fallback = 0.5
        CASE
            WHEN d1.element_id IS NULL THEN NULL
            WHEN COALESCE(array_length(g2.groups,1),0) = 0
              OR COALESCE(array_length(g1.groups,1),0) = 0 THEN 0.5
            WHEN g2.groups && g1.groups THEN 1.0
            ELSE 0.5
        END                                      AS type_match
    FROM ds2_nodes n2
    LEFT JOIN ds2_node_groups g2 ON g2.element_id = n2.element_id
    -- Type-aware snap candidate: the DS1 node is only offered as a snap target
    -- when it is BOTH within proximity AND type-compatible. Putting the type
    -- test in the JOIN (not a WHERE) means a type-incompatible nearby node
    -- simply yields NO candidate → the DS2 node falls through as UNSNAPPED
    -- (out_node_id = itself) and is preserved. A WHERE filter here would drop
    -- the DS2 node entirely, eliminating its edge downstream.
    LEFT JOIN LATERAL (
        SELECT d1.element_id, d1.geom, d1.feature, g1.groups AS g1_groups
        FROM ds1_nodes d1
        LEFT JOIN ds1_node_groups g1 ON g1.element_id = d1.element_id
        WHERE ST_DWithin(n2.geom, d1.geom, proximity_degrees)
          AND (
                COALESCE(array_length(g2.groups, 1), 0) = 0   -- DS2 untyped → allow
             OR COALESCE(array_length(g1.groups, 1), 0) = 0   -- DS1 untyped → allow
             OR g2.groups && g1.groups                         -- types intersect → allow
          )
        ORDER BY ST_Distance(n2.geom, d1.geom) ASC
        LIMIT 1
    ) d1 ON TRUE
    LEFT JOIN ds1_node_groups g1 ON g1.element_id = d1.element_id
    ORDER BY
        n2.element_id,
        ST_Distance(n2.geom, d1.geom) ASC NULLS LAST;

    CREATE INDEX ON node_map (ds2_node_id);
    CREATE INDEX ON node_map (out_node_id);
    CREATE INDEX ON node_map USING GIST (out_geom);

    RAISE NOTICE 'Phase 2 complete: snapped=%, new=%',
        (SELECT COUNT(*) FROM node_map WHERE snapped),
        (SELECT COUNT(*) FROM node_map WHERE NOT snapped);

    -- =========================================================================
    -- PHASE 3: Find DS1 nodes that fall on DS2 edge interiors
    --
    -- A DS1 node N may lie on the interior of a DS2 edge.
    -- That DS2 edge must be split at N so the output network connects
    -- through N properly.
    --
    -- ST_LineLocatePoint returns the fraction [0,1] along the edge.
    -- We exclude fractions at 0 or 1 (endpoints — already handled by NodeMap).
    --
    -- Example:
    --   DS2 edge: X ──────────────── Z
    --   DS1 node: N  (projects onto interior at fraction 0.4)
    --   Result: X → N → Z  (DS2 edge split into two sub-edges)
    -- =========================================================================
    RAISE NOTICE 'Phase 3: Finding DS1 nodes on DS2 edge interiors at %', clock_timestamp();

    -- ST_LineLocatePoint computed once in subquery, filtered in outer WHERE.
    --
    -- GUARD against double node assignment (the "lost path" bug):
    -- A DS1 node may sit on a DS2 edge's interior AND also be the snap target
    -- of one of that edge's endpoints (when the sidewalk has a vertex coincident
    -- with the crossing node near its end). If we split the interior at that node
    -- AND the endpoint also resolves to the same node, the sub-edge between them
    -- becomes node→same-node (same_uv) and gets dropped — severing the path.
    --
    -- Fix: exclude an interior split when the same DS1 node is already the
    -- NodeMap snap target of either endpoint of this edge. The endpoint snap
    -- already creates the shared node; the interior split is redundant.
    --
    -- Example (test case): sidewalk 7803 endpoint snaps to crossing node 39698221,
    -- and 39698221 also projects to interior frac 0.9975 → without this guard the
    -- 0.9975→1.0 stub becomes 39698221→39698221 and is dropped.
    --
    -- TYPE GUARD (same logic as Phase 2 node snap): a DS1 node may split a
    -- DS2 edge interior ONLY if their type groups are compatible. A 'road'
    -- node must not split a 'pedestrian' sidewalk edge — they are different
    -- networks that should connect only via crossings, never by direct split.
    -- Compatible = the DS1 node's group set intersects the DS2 edge's group,
    -- OR either side is untyped/'other' (fall back to allow).
    DROP TABLE IF EXISTS ds1_node_on_ds2_edge;
    CREATE TEMP TABLE ds1_node_on_ds2_edge ON COMMIT DROP AS
    SELECT edge_id, ds1_node_id, split_geom, fraction
    FROM (
        SELECT
            e.element_id                        AS edge_id,
            n.element_id                        AS ds1_node_id,
            n.geom                              AS split_geom,
            ST_LineLocatePoint(e.geom, n.geom)  AS fraction
        FROM ds2_edges e
        JOIN ds1_nodes n
            ON ST_DWithin(e.geom, n.geom, proximity_degrees)
        -- DS2 edge type group
        LEFT JOIN edge_type_groups et2
            ON et2.src = 'ds2' AND et2.element_id = e.element_id
        -- DS1 node type-group set
        LEFT JOIN ds1_node_groups g1
            ON g1.element_id = n.element_id
        WHERE
        -- Type compatibility guard:
        (
            et2.type_group IS NULL
            OR et2.type_group = 'other'
            OR COALESCE(array_length(g1.groups,1),0) = 0   -- DS1 node untyped → allow
            OR et2.type_group = ANY(g1.groups)             -- DS2 edge type in DS1 node's groups
        )
        -- Suppress if this DS1 node is the snap target of either endpoint
        -- of this same edge (it will already be an endpoint node via NodeMap).
        AND NOT EXISTS (
            SELECT 1
            FROM ds2_nodes en
            JOIN node_map nm ON nm.ds2_node_id = en.element_id
            WHERE nm.out_node_id = n.element_id          -- same DS1 node
              AND (ST_DWithin(en.geom, ST_StartPoint(e.geom), proximity_degrees)
                OR ST_DWithin(en.geom, ST_EndPoint(e.geom),   proximity_degrees))
        )
    ) located
    WHERE fraction > snap_tolerance
      AND fraction < (1.0 - snap_tolerance);

    CREATE INDEX ON ds1_node_on_ds2_edge (edge_id);

    -- =========================================================================
    -- Rule 3 — Road × Crossing shared intersection node.
    --
    -- OSW schema: a road and a crossing that intersect MUST share a Node;
    -- both must be split so endpoints are shared. This is the ONE place
    -- DS1 is modified — a DS1 road is split where a crossing crosses it.
    --
    -- Gated strictly to avoid the false-positive problem that disabled this
    -- before: only fires when one edge is 'road' group and the other is
    -- 'crossing' group AND they intersect at a point. Two parallel sidewalks
    -- (both 'pedestrian') never trigger it.
    --
    -- Direction: both ways —
    --   DS2 crossing × DS1 road   → split DS1 road (DS1 exception) + DS2 crossing
    --   DS2 road     × DS1 crossing → split DS1 crossing + DS2 road
    --   plus same-dataset road×crossing where they cross without a shared node
    --
    -- ds2_edge_crossings stores the split points to feed Phase 4 fraction logic
    -- for DS2 edges. DS1 edge splits are stored separately in ds1_edge_splits
    -- and applied in Phase 6 when building ds1_out.
    --
    -- Example:
    --   DS1 road A━━━━━━━━B   DS2 crossing C┃D  cross at point N
    --   Output: road A→N, N→B   crossing C→N, N→D   N shared by all four
    -- =========================================================================
    RAISE NOTICE 'Phase 3: Road×Crossing intersection detection at %', clock_timestamp();

    -- All road×crossing intersection points across both datasets.
    -- Each row: the two edges and the intersection point geometry.
    -- ST_Intersects (GIST-indexed) pre-filters candidate pairs cheaply.
    -- ST_Intersection is computed ONCE per surviving pair in the subquery,
    -- then ST_Dump expands it. Avoids recomputing the intersection geometry.
    DROP TABLE IF EXISTS road_crossing_points;
    CREATE TEMP TABLE road_crossing_points ON COMMIT DROP AS
    SELECT
        road_id, road_src, crossing_id, crossing_src,
        (ST_Dump(inter_geom)).geom AS ipoint
    FROM (
        SELECT
            r.element_id                       AS road_id,
            r.src                              AS road_src,
            c.element_id                       AS crossing_id,
            c.src                              AS crossing_src,
            ST_Intersection(r.geom, c.geom)    AS inter_geom   -- computed once
        FROM edge_type_groups r
        JOIN edge_type_groups c
            ON  r.type_group = 'road'
            AND c.type_group = 'crossing'
            AND ST_Intersects(r.geom, c.geom)  -- GIST-indexed pre-filter
    ) pairs;

    -- Keep only POINT intersections (genuine crossings). Lines (collinear
    -- overlap) or empty rows discarded — not valid shared-node crossings.
    DELETE FROM road_crossing_points
    WHERE ipoint IS NULL
       OR GeometryType(ipoint) <> 'POINT';

    CREATE INDEX ON road_crossing_points (road_id, road_src);
    CREATE INDEX ON road_crossing_points (crossing_id, crossing_src);
    CREATE INDEX ON road_crossing_points USING GIST (ipoint);

    -- Shared node per distinct intersection point.
    --
    -- REUSE-EXISTING-NODE RULE: a road×crossing intersection often lands on a
    -- node that ALREADY exists (e.g. the crossing's own endpoint sitting on the
    -- road). Creating a brand-new ixn- node a fraction of a mm away from it
    -- produces a degenerate micro-edge (the ixn node → existing node sub-edge
    -- collapses to zero length when trimmed to 7dp → invalid geometry).
    --
    -- Fix: if an EXISTING node lies within reuse_tolerance of the intersection
    -- point, REUSE it (its id + exact position) as the shared node. Only when
    -- no existing node is nearby do we mint a new ixn- node (with provenance).
    --
    --   is_new = FALSE → reused existing node (id = real node id, no ixn tags)
    --   is_new = TRUE  → freshly created ixn- node (gets ext:osw_/ext:road_ tags)
    --
    -- Tolerance ~0.1 m: catches coincident-but-different-precision nodes without
    -- grabbing unrelated nearby nodes.
    DROP TABLE IF EXISTS all_existing_nodes;
    CREATE TEMP TABLE all_existing_nodes ON COMMIT DROP AS
    SELECT element_id::TEXT AS node_id, geom FROM ds1_nodes
    UNION ALL
    SELECT element_id::TEXT, geom FROM ds2_nodes;
    CREATE INDEX ON all_existing_nodes USING GIST (geom);

    DROP TABLE IF EXISTS crossing_shared_nodes;
    CREATE TEMP TABLE crossing_shared_nodes ON COMMIT DROP AS
    SELECT DISTINCT ON (ST_AsText(ST_SnapToGrid(ipoint, snap_tolerance)))
        -- reuse existing node id if one is within tolerance, else mint ixn-
        COALESCE(nn.node_id, 'ixn-' || road_id || '-' || crossing_id) AS node_id,
        -- reuse existing node's EXACT position if reusing, else the intersection point
        COALESCE(nn.geom, ipoint)                                     AS geom,
        (nn.node_id IS NULL)                                          AS is_new,
        road_id,
        road_src,
        crossing_id,
        crossing_src
    FROM road_crossing_points rcp
    -- nearest existing node within reuse tolerance (0.1 m ≈ 0.1/111111 degrees)
    LEFT JOIN LATERAL (
        SELECT aen.node_id, aen.geom
        FROM all_existing_nodes aen
        WHERE ST_DWithin(aen.geom, rcp.ipoint, 0.1 / 111111.0)
        ORDER BY ST_Distance(aen.geom, rcp.ipoint) ASC
        LIMIT 1
    ) nn ON TRUE
    ORDER BY ST_AsText(ST_SnapToGrid(ipoint, snap_tolerance));

    CREATE INDEX ON crossing_shared_nodes (node_id);
    CREATE INDEX ON crossing_shared_nodes USING GIST (geom);

    -- DS2 edge crossing splits — fed into Phase 4 split fractions.
    -- For every DS2 edge (road or crossing) that participates in an intersection,
    -- record the split point with its shared node id and fraction along the edge.
    DROP TABLE IF EXISTS ds2_edge_crossings;
    CREATE TEMP TABLE ds2_edge_crossings ON COMMIT DROP AS
    SELECT edge_id, ds1_node_id, split_geom, fraction
    FROM (
        -- DS2 road split by any crossing
        SELECT
            rcp.road_id                              AS edge_id,
            csn.node_id                              AS ds1_node_id,
            csn.geom                                 AS split_geom,
            ST_LineLocatePoint(e.geom, csn.geom)     AS fraction
        FROM road_crossing_points rcp
        JOIN crossing_shared_nodes csn
            ON ST_DWithin(csn.geom, rcp.ipoint, snap_tolerance)
        JOIN ds2_edges e ON e.element_id = rcp.road_id
        WHERE rcp.road_src = 'ds2'

        UNION ALL

        -- DS2 crossing split by any road
        SELECT
            rcp.crossing_id                          AS edge_id,
            csn.node_id                              AS ds1_node_id,
            csn.geom                                 AS split_geom,
            ST_LineLocatePoint(e.geom, csn.geom)     AS fraction
        FROM road_crossing_points rcp
        JOIN crossing_shared_nodes csn
            ON ST_DWithin(csn.geom, rcp.ipoint, snap_tolerance)
        JOIN ds2_edges e ON e.element_id = rcp.crossing_id
        WHERE rcp.crossing_src = 'ds2'
    ) splits
    WHERE fraction > snap_tolerance
      AND fraction < (1.0 - snap_tolerance);

    CREATE INDEX ON ds2_edge_crossings (edge_id);

    -- DS1 edge crossing splits — the DS1-immutability EXCEPTION.
    -- DS1 road or crossing edges that must be split at a shared intersection node.
    -- Applied in Phase 6 when building ds1_out.
    DROP TABLE IF EXISTS ds1_edge_splits;
    CREATE TEMP TABLE ds1_edge_splits ON COMMIT DROP AS
    SELECT edge_id, node_id, split_geom, fraction
    FROM (
        -- DS1 road split by any crossing
        SELECT
            rcp.road_id                              AS edge_id,
            csn.node_id                              AS node_id,
            csn.geom                                 AS split_geom,
            ST_LineLocatePoint(e.geom, csn.geom)     AS fraction
        FROM road_crossing_points rcp
        JOIN crossing_shared_nodes csn
            ON ST_DWithin(csn.geom, rcp.ipoint, snap_tolerance)
        JOIN ds1_edges e ON e.element_id = rcp.road_id
        WHERE rcp.road_src = 'ds1'

        UNION ALL

        -- DS1 crossing split by any road
        SELECT
            rcp.crossing_id                          AS edge_id,
            csn.node_id                              AS node_id,
            csn.geom                                 AS split_geom,
            ST_LineLocatePoint(e.geom, csn.geom)     AS fraction
        FROM road_crossing_points rcp
        JOIN crossing_shared_nodes csn
            ON ST_DWithin(csn.geom, rcp.ipoint, snap_tolerance)
        JOIN ds1_edges e ON e.element_id = rcp.crossing_id
        WHERE rcp.crossing_src = 'ds1'
    ) splits
    WHERE fraction > snap_tolerance
      AND fraction < (1.0 - snap_tolerance);

    CREATE INDEX ON ds1_edge_splits (edge_id);

    RAISE NOTICE 'Phase 3 complete: interior splits=%, road×crossing points=%, ds1 splits=%',
        (SELECT COUNT(*) FROM ds1_node_on_ds2_edge),
        (SELECT COUNT(*) FROM crossing_shared_nodes),
        (SELECT COUNT(*) FROM ds1_edge_splits);

    -- =========================================================================
    -- PHASE 4: Build split fractions for each DS2 edge
    --
    -- For each DS2 edge we collect all fractions where it must be split:
    --   • fraction=0.0 → start endpoint (from NodeMap)
    --   • fraction=1.0 → end endpoint   (from NodeMap)
    --   • interior fractions from ds1_node_on_ds2_edge
    --
    -- CRITICAL — sentinel geometry must use NodeMap out_geom (DS1-snapped
    -- position), NOT the raw DS2 node position. Using raw DS2 geom would
    -- create a node at the DS2 position instead of the DS1 position, causing
    -- two separate nodes at what should be one junction.
    --
    -- Example:
    --   DS2 node A' is at (0.001, 0.001), DS1 node A is at (0.0, 0.0).
    --   NodeMap: A' → A (out_geom = A position).
    --   Sentinel split_geom = A position  ← correct
    --   If we used A' position instead, the sub-edge would start at A'
    --   not A, creating a dangling 1mm stub edge. ✗
    --
    -- Two-step build (main → fallback) avoids self-reference during CREATE.
    -- =========================================================================
    RAISE NOTICE 'Phase 4: Building split fractions at %', clock_timestamp();

    -- Step 4a: main fractions (endpoints via NodeMap + interior + crossings)
    DROP TABLE IF EXISTS ds2_split_fractions_main;
    CREATE TEMP TABLE ds2_split_fractions_main ON COMMIT DROP AS

    -- Start sentinel (fraction=0) via NodeMap
    SELECT edge_id, split_node_id, split_geom, fraction FROM (
        SELECT DISTINCT ON (e.element_id)
            e.element_id         AS edge_id,
            nm.out_node_id       AS split_node_id,
            nm.out_geom          AS split_geom,   -- DS1-snapped position
            0.0::FLOAT8          AS fraction
        FROM ds2_edges e
        JOIN ds2_nodes ns
            ON ST_DWithin(ns.geom, ST_StartPoint(e.geom), proximity_degrees)
        JOIN node_map nm ON nm.ds2_node_id = ns.element_id
        ORDER BY e.element_id, ST_Distance(ns.geom, ST_StartPoint(e.geom))
    ) sent_start

    UNION ALL

    -- End sentinel (fraction=1) via NodeMap
    SELECT edge_id, split_node_id, split_geom, fraction FROM (
        SELECT DISTINCT ON (e.element_id)
            e.element_id         AS edge_id,
            nm.out_node_id       AS split_node_id,
            nm.out_geom          AS split_geom,   -- DS1-snapped position
            1.0::FLOAT8          AS fraction
        FROM ds2_edges e
        JOIN ds2_nodes ne
            ON ST_DWithin(ne.geom, ST_EndPoint(e.geom), proximity_degrees)
        JOIN node_map nm ON nm.ds2_node_id = ne.element_id
        ORDER BY e.element_id, ST_Distance(ne.geom, ST_EndPoint(e.geom))
    ) sent_end

    UNION ALL

    -- Interior splits from DS1 nodes on DS2 edge interiors
    SELECT edge_id, ds1_node_id, split_geom, fraction::FLOAT8
    FROM ds1_node_on_ds2_edge

    UNION ALL

    -- Road×crossing splits (Rule 3): split points where a DS2 road or
    -- crossing edge is cut at a shared intersection node. Empty when the
    -- datasets contain no road×crossing intersections.
    SELECT edge_id, NULL::TEXT, split_geom, fraction::FLOAT8
    FROM ds2_edge_crossings;

    CREATE INDEX ON ds2_split_fractions_main (edge_id);
    -- Index on fraction enables fast NOT EXISTS filter in fallback step
    CREATE INDEX ON ds2_split_fractions_main (edge_id, fraction);

    -- Step 4b: fallback sentinels for edges that got no sentinel in step 4a.
    -- NOT EXISTS replaces NOT IN — stops at first match, uses (edge_id,fraction) index.
    DROP TABLE IF EXISTS ds2_split_fractions;
    CREATE TEMP TABLE ds2_split_fractions ON COMMIT DROP AS
    SELECT * FROM ds2_split_fractions_main

    UNION ALL

    -- Fallback start sentinels for edges missing fraction=0
    SELECT edge_id, split_node_id, split_geom, fraction FROM (
        SELECT DISTINCT ON (e.element_id)
            e.element_id    AS edge_id,
            nm.out_node_id  AS split_node_id,
            nm.out_geom     AS split_geom,
            0.0::FLOAT8     AS fraction
        FROM ds2_edges e
        JOIN ds2_nodes ns
            ON ST_DWithin(ns.geom, ST_StartPoint(e.geom), proximity_degrees)
        JOIN node_map nm ON nm.ds2_node_id = ns.element_id
        WHERE NOT EXISTS (
            SELECT 1 FROM ds2_split_fractions_main m
            WHERE m.edge_id = e.element_id AND m.fraction = 0.0
        )
        ORDER BY e.element_id, ST_Distance(ns.geom, ST_StartPoint(e.geom))
    ) fb_start

    UNION ALL

    -- Fallback end sentinels for edges missing fraction=1
    SELECT edge_id, split_node_id, split_geom, fraction FROM (
        SELECT DISTINCT ON (e.element_id)
            e.element_id    AS edge_id,
            nm.out_node_id  AS split_node_id,
            nm.out_geom     AS split_geom,
            1.0::FLOAT8     AS fraction
        FROM ds2_edges e
        JOIN ds2_nodes ne
            ON ST_DWithin(ne.geom, ST_EndPoint(e.geom), proximity_degrees)
        JOIN node_map nm ON nm.ds2_node_id = ne.element_id
        WHERE NOT EXISTS (
            SELECT 1 FROM ds2_split_fractions_main m
            WHERE m.edge_id = e.element_id AND m.fraction = 1.0
        )
        ORDER BY e.element_id, ST_Distance(ne.geom, ST_EndPoint(e.geom))
    ) fb_end;

    -- Deduplicate near-identical fractions (within 7 decimal places)
    -- Prefer rows that have a known DS1 node id
    DROP TABLE IF EXISTS dedup_ds2_fractions;
    CREATE TEMP TABLE dedup_ds2_fractions ON COMMIT DROP AS
    SELECT DISTINCT ON (edge_id, ROUND(fraction::NUMERIC, 7))
        edge_id,
        split_node_id,
        split_geom,
        fraction
    FROM ds2_split_fractions
    ORDER BY
        edge_id,
        ROUND(fraction::NUMERIC, 7),
        CASE WHEN split_node_id IS NOT NULL THEN 0 ELSE 1 END,
        fraction;

    CREATE INDEX ON dedup_ds2_fractions (edge_id);

    RAISE NOTICE 'Phase 4 complete: % fractions across % edges',
        (SELECT COUNT(*) FROM dedup_ds2_fractions),
        (SELECT COUNT(DISTINCT edge_id) FROM dedup_ds2_fractions);

    -- =========================================================================
    -- PHASE 5: Reconstruct DS2 sub-edges with snapped endpoints
    --
    -- For each consecutive fraction pair on each DS2 edge:
    --   • start_geom = exact DS1 node position (from NodeMap)
    --   • end_geom   = exact DS1 node position (from NodeMap)
    --   • middle     = original DS2 intermediate points (geometry preserved)
    --
    -- Two-point sub-edge: ST_MakeLine(start, end)
    -- Multi-point sub-edge: start + intermediates extracted via ST_DumpPoints
    --                       + end, assembled with ST_MakeLine(ARRAY[...])
    --
    -- Example (multi-point):
    --   DS2 edge has points: A'  p1  p2  p3  B'
    --   After snapping A'→A, B'→B:
    --   Output sub-edge:     A   p1  p2  p3  B
    --   ↑ shape preserved, only endpoints corrected to DS1 positions
    -- =========================================================================
    RAISE NOTICE 'Phase 5: Reconstructing DS2 sub-edges at %', clock_timestamp();

    -- Step 5a: ordered consecutive fraction pairs per edge
    DROP TABLE IF EXISTS ds2_frac_pairs;
    -- Materialise the row-numbered fractions ONCE into an indexed temp table,
    -- then self-join it for consecutive (start,end) pairing. Avoids computing
    -- the ROW_NUMBER() window twice (it was duplicated across two identical
    -- inline subqueries) and gives the self-join an explicit (edge_id, rn) index.
    DROP TABLE IF EXISTS ds2_frac_numbered;
    CREATE TEMP TABLE ds2_frac_numbered ON COMMIT DROP AS
    SELECT edge_id, split_node_id, split_geom, fraction,
           ROW_NUMBER() OVER (PARTITION BY edge_id ORDER BY fraction) AS rn
    FROM dedup_ds2_fractions;
    CREATE INDEX ON ds2_frac_numbered (edge_id, rn);

    CREATE TEMP TABLE ds2_frac_pairs ON COMMIT DROP AS
    SELECT
        f1.edge_id,
        f1.fraction      AS frac_start,
        f2.fraction      AS frac_end,
        f1.split_geom    AS start_geom,
        f2.split_geom    AS end_geom,
        f1.split_node_id AS u_node_id,
        f2.split_node_id AS v_node_id
    FROM ds2_frac_numbered f1
    JOIN ds2_frac_numbered f2
        ON f1.edge_id = f2.edge_id AND f2.rn = f1.rn + 1
    WHERE f2.fraction > f1.fraction;

    CREATE INDEX ON ds2_frac_pairs (edge_id);

    -- Step 5b-i: materialise ST_LineSubstring once per fraction pair.
    -- Previously called 3× per row (CASE condition, ST_NPoints, ST_DumpPoints).
    -- Now computed once and stored — subsequent steps reference sub_geom directly.
    DROP TABLE IF EXISTS ds2_substrings;
    CREATE TEMP TABLE ds2_substrings ON COMMIT DROP AS
    SELECT
        fp.edge_id,
        fp.u_node_id,
        fp.v_node_id,
        fp.start_geom,
        fp.end_geom,
        fp.frac_start,
        fp.frac_end,
        e.feature,
        e.element_id || '_' ||
            ROUND(fp.frac_start::NUMERIC, 7)::TEXT || '_' ||
            ROUND(fp.frac_end::NUMERIC,   7)::TEXT  AS sub_edge_id,
        ST_LineSubstring(e.geom, fp.frac_start, fp.frac_end) AS sub_geom
    FROM ds2_frac_pairs fp
    JOIN ds2_edges e ON e.element_id = fp.edge_id
    WHERE fp.frac_start < fp.frac_end;

    CREATE INDEX ON ds2_substrings (edge_id);

    -- Step 5b-ii: build final sub-edge geometry using pre-computed sub_geom.
    -- ST_NPoints and ST_DumpPoints now reference sub_geom — computed once above.
    DROP TABLE IF EXISTS ds2_sub_edges;
    CREATE TEMP TABLE ds2_sub_edges ON COMMIT DROP AS
    SELECT
        edge_id,
        u_node_id,
        v_node_id,
        start_geom,
        end_geom,
        feature,
        sub_edge_id,
        CASE
            WHEN ST_NPoints(sub_geom) <= 2
            THEN ST_MakeLine(start_geom, end_geom)
            ELSE ST_MakeLine(
                    ARRAY[start_geom] ||
                    ARRAY(
                        SELECT g.geom
                        FROM ST_DumpPoints(sub_geom) g
                        WHERE g.path[1] > 1
                          AND g.path[1] < ST_NPoints(sub_geom)
                        ORDER BY g.path[1]
                    ) ||
                    ARRAY[end_geom]
                 )
        END AS geom
    FROM ds2_substrings
    WHERE ST_NPoints(sub_geom) >= 2;

    CREATE INDEX ON ds2_sub_edges (edge_id);
    CREATE INDEX ON ds2_sub_edges USING GIST (geom);

    -- Filter degenerate geometries after rebuild
    DELETE FROM ds2_sub_edges
    WHERE ST_NPoints(geom) < 2 OR ST_Length(geom) = 0;

    RAISE NOTICE 'Phase 5 complete: % DS2 sub-edges reconstructed',
        (SELECT COUNT(*) FROM ds2_sub_edges);

    -- =========================================================================
    -- PHASE 6: Build output — DS1 unchanged + DS2 stitched & deduped
    --
    -- NODES:
    --   All DS1 nodes (authoritative, unchanged).
    --   Properties from snapped DS2 nodes are merged in — keys that do NOT
    --   exist on DS1 are added; keys that already exist are NOT overridden.
    --   DS2 nodes that did not snap to any DS1 node are added as new.
    --
    -- EDGES (two-pass dedup):
    --   Pass 1 (node-pair): DS2 sub-edges whose (u,v) pair matches a DS1
    --                       edge are dropped (exact semantic duplicate).
    --   Pass 2 (geometry):  DS2 sub-edges whose geometry is ≥80% covered
    --                       by the ST_Buffer of DS1 edges are dropped
    --                       (geometric duplicate, e.g. DS2 splits a DS1 edge).
    -- =========================================================================
    RAISE NOTICE 'Phase 6: Building output at %', clock_timestamp();

    -- ── Crossing shared nodes → output nodes ─────────────────────────────────
    -- New shared nodes created at road×crossing intersections (Rule 3).
    -- These become real network nodes shared by the split road and crossing edges.
    --
    -- The node carries provenance of the two contributing edges (no invented
    -- attributes like barrier=kerb):
    --   crossing edge tags → prefixed ext:osw_<key>
    --   road edge tags     → prefixed ext:road_<key>
    -- Internal keys (_id, _u_id, _v_id) are stripped before prefixing.
    DROP TABLE IF EXISTS crossing_new_nodes;
    CREATE TEMP TABLE crossing_new_nodes ON COMMIT DROP AS
    SELECT
        csn.node_id AS element_id,
        csn.geom,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(csn.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', csn.node_id)
                -- crossing edge tags → ext:osw_<key>
                -- (strip any existing 'ext:' prefix first to avoid ext:osw_ext:name)
                || COALESCE((
                    SELECT jsonb_object_agg(
                        'ext:osw_' || regexp_replace(kv.key, '^ext:', ''),
                        kv.value)
                    FROM jsonb_each(
                        (ce.feature::jsonb->'properties') - '_id' - '_u_id' - '_v_id'
                    ) kv
                ), '{}'::jsonb)
                -- road edge tags → ext:road_<key>
                || COALESCE((
                    SELECT jsonb_object_agg(
                        'ext:road_' || regexp_replace(kv.key, '^ext:', ''),
                        kv.value)
                    FROM jsonb_each(
                        (re.feature::jsonb->'properties') - '_id' - '_u_id' - '_v_id'
                    ) kv
                ), '{}'::jsonb)
        ) AS feature
    FROM crossing_shared_nodes csn
    LEFT JOIN edge_type_groups ce
        ON ce.src = csn.crossing_src AND ce.element_id = csn.crossing_id
    LEFT JOIN edge_type_groups re
        ON re.src = csn.road_src AND re.element_id = csn.road_id
    -- Only NEW ixn- nodes become new output nodes with provenance tags.
    -- Reused existing nodes are already emitted via the normal node pipeline;
    -- emitting them here too would duplicate them.
    WHERE csn.is_new;

    -- GIST for the spatial LATERAL probe in ds2_resolved (fallback node lookup).
    CREATE INDEX ON crossing_new_nodes USING GIST (geom);
    CREATE INDEX ON crossing_new_nodes (element_id);

    -- ── DS1 node property merge ───────────────────────────────────────────────
    --
    -- For each DS1 node that had a DS2 node snapped onto it:
    --   Take DS2 properties and REMOVE any keys that already exist in DS1.
    --   Merge the remainder into DS1 properties (new keys only, no override).
    --
    -- Example:
    --   DS1: { "barrier":"kerb", "surface":"asphalt" }
    --   DS2: { "barrier":"kerb", "surface":"concrete", "tactile_paving":"yes" }
    --   DS2 new keys = DS2 - DS1 keys = { "tactile_paving":"yes" }
    --   Output: { "barrier":"kerb", "surface":"asphalt", "tactile_paving":"yes" }
    --
    -- Implementation note:
    --   jsonb subtraction operator (-) removes a key from the left operand.
    --   We build a set of DS2 keys to remove (those already in DS1) and
    --   apply them, leaving only genuinely new DS2 properties to merge in.

    -- Step 1: collect all new DS2 properties per DS1 node.
    -- Multiple DS2 nodes may snap to the same DS1 node (many-to-one).
    -- We must aggregate all their new properties before joining to DS1,
    -- otherwise the LEFT JOIN produces one row per DS2 node → duplicate _ids.
    --
    -- Example:
    --   DS1 node A ← snapped by DS2 node Y (adds "tactile_paving":"yes")
    --   DS1 node A ← snapped by DS2 node Z (adds "surface_color":"red")
    --   Naive JOIN → two rows for A ✗
    --   Aggregated → one row for A with both new keys ✓

    -- ds2_props_for_ds1: aggregate all DS2 properties per DS1 node.
    -- Carries both property values (for merge) and per-key DS2 node ids (for audit).
    -- audit_props: jsonb where each key maps to "<ds2_id>-<value>".
    -- When multiple DS2 nodes snap to same DS1 node and contribute the same key,
    -- values are comma-concatenated: "<ds2_id_1>-<val1>,<ds2_id_2>-<val2>".
    --
    -- Example (two DS2 nodes snap to DS1 node A):
    --   Y (id=ds2_456): { "surface":"concrete", "tactile_paving":"yes" }
    --   Z (id=ds2_789): { "surface":"asphalt" }
    --   aggregated_ds2_props: { "surface":"asphalt", "tactile_paving":"yes" }
    --   audit_props:          { "surface":     "ds2_456-concrete,ds2_789-asphalt",
    --                           "tactile_paving":"ds2_456-yes" }
    -- Build per-(node,key) aggregates first — PostgreSQL forbids nesting
    -- aggregate functions (jsonb_object_agg(STRING_AGG(...)) is illegal).
    -- Step A: one row per (ds1_node, key) with:
    --   val      = last DS2 value for that key (for the property merge)
    --   audit_str= "<ds2_id>-<value>" comma-joined across all DS2 nodes
    --              that snapped to this DS1 node and carried this key.
    DROP TABLE IF EXISTS ds2_props_per_key;
    CREATE TEMP TABLE ds2_props_per_key ON COMMIT DROP AS
    SELECT
        nm.out_node_id                              AS ds1_node_id,
        kv.key                                      AS prop_key,
        -- representative value for merge (last by ds2 id ordering)
        (ARRAY_AGG(kv.value ORDER BY nm.ds2_node_id))[
            array_upper(ARRAY_AGG(kv.value ORDER BY nm.ds2_node_id), 1)
        ]                                           AS prop_value,
        -- audit string: "<ds2_id>-<value>" joined across all contributing DS2 nodes
        STRING_AGG(
            nm.ds2_node_id || '-' || (kv.value #>> '{}'),
            ',' ORDER BY nm.ds2_node_id
        )                                           AS audit_str
    FROM node_map nm,
         jsonb_each((nm.ds2_feature::jsonb->'properties') - '_id') kv
    WHERE nm.snapped
    GROUP BY nm.out_node_id, kv.key;

    CREATE INDEX ON ds2_props_per_key (ds1_node_id);

    -- Step B: collapse per-key rows into per-node JSONB objects.
    --   aggregated_ds2_props : { key: value }            (for merge)
    --   audit_props          : { key: "<id>-<val>,..." } (for ext:union_audit_)
    DROP TABLE IF EXISTS ds2_props_for_ds1;
    CREATE TEMP TABLE ds2_props_for_ds1 ON COMMIT DROP AS
    SELECT
        ds1_node_id,
        jsonb_object_agg(prop_key, prop_value)      AS aggregated_ds2_props,
        jsonb_object_agg(prop_key, to_jsonb(audit_str)) AS audit_props
    FROM ds2_props_per_key
    GROUP BY ds1_node_id;

    CREATE INDEX ON ds2_props_for_ds1 (ds1_node_id);

    -- Node confidence (Interpretation A): per DS1 node that had DS2 nodes snapped,
    -- blend proximity and type_match. When multiple DS2 nodes snapped to one DS1
    -- node, use the BEST (highest-confidence) snap as the representative.
    --   proximity  = 1 - (snap_dist / proximity_degrees)   [clamped 0..1]
    --   type_match = 1.0 exact group overlap, 0.5 untyped fallback
    --   blend = 0.7*proximity + 0.3*type_match
    DROP TABLE IF EXISTS ds1_node_confidence;
    CREATE TEMP TABLE ds1_node_confidence ON COMMIT DROP AS
    SELECT DISTINCT ON (out_node_id)
        out_node_id                                         AS ds1_node_id,
        GREATEST(0.0, LEAST(1.0, 1.0 - (snap_dist / NULLIF(proximity_degrees,0)))) AS proximity_score,
        COALESCE(type_match, 0.5)                           AS type_match_score,
        ROUND((
            0.7 * GREATEST(0.0, LEAST(1.0, 1.0 - (snap_dist / NULLIF(proximity_degrees,0))))
          + 0.3 * COALESCE(type_match, 0.5)
        )::NUMERIC, 3)                                      AS confidence
    FROM node_map
    WHERE snapped
    ORDER BY out_node_id,
             -- best snap first (smallest distance, highest type match)
             (0.7 * GREATEST(0.0, LEAST(1.0, 1.0 - (snap_dist / NULLIF(proximity_degrees,0))))
            + 0.3 * COALESCE(type_match, 0.5)) DESC;

    CREATE INDEX ON ds1_node_confidence (ds1_node_id);

    DROP TABLE IF EXISTS ds1_node_merged_props;
    CREATE TEMP TABLE ds1_node_merged_props ON COMMIT DROP AS
    SELECT
        n.element_id::TEXT                          AS node_id,
        n.geom,
        n.feature,
        (n.feature::jsonb->'properties') - '_id'    AS ds1_props,
        -- Confidence block:
        --   snapped here ('merged') → fresh score + components, source=this union
        --   not snapped but had prior confidence → 'carried', preserve old values
        --   never had confidence → no keys
        CASE
            WHEN c.ds1_node_id IS NOT NULL THEN
                jsonb_build_object(
                    'ext:union_confidence',            c.confidence,
                    'ext:union_confidence_source',     union_label,
                    'ext:union_confidence_status',     'merged',
                    'ext:union_confidence_proximity',  ROUND(c.proximity_score::NUMERIC,3),
                    'ext:union_confidence_type_match', ROUND(c.type_match_score::NUMERIC,3)
                )
            WHEN (n.feature::jsonb->'properties') ? 'ext:union_confidence' THEN
                -- carried: preserve prior score + source, mark not re-evaluated
                jsonb_build_object(
                    'ext:union_confidence',
                        (n.feature::jsonb->'properties'->'ext:union_confidence'),
                    'ext:union_confidence_source',
                        COALESCE(n.feature::jsonb->'properties'->>'ext:union_confidence_source','prior'),
                    'ext:union_confidence_status',     'carried'
                )
            ELSE '{}'::jsonb
        END                                         AS confidence_props,
        -- New DS2 properties: keys NOT present in DS1 — added as-is
        COALESCE(
            (SELECT jsonb_object_agg(kv.key, kv.value)
             FROM jsonb_each(d2p.aggregated_ds2_props) kv
             WHERE NOT (n.feature::jsonb->'properties') ? kv.key),
            '{}'::jsonb
        )                                           AS new_ds2_props,
        -- Audit tags: prefixed ext:union_audit_<key> = "<ds2_node_id>-<value>"
        -- Covers ALL DS2 properties (matched and new) for full audit trail.
        -- When multiple DS2 nodes snapped to this DS1 node and contributed
        -- the same key, entries are comma-separated: "<id1>-<val1>,<id2>-<val2>".
        --
        -- Example:
        --   DS1 node A:   { "barrier":"kerb", "surface":"asphalt" }
        --   DS2 node Y (ds2_456): { "barrier":"kerb", "surface":"concrete", "tactile_paving":"yes" }
        --   DS2 node Z (ds2_789): { "surface":"asphalt" }
        --
        --   ext:union_audit_barrier:        "ds2_456-kerb"
        --   ext:union_audit_surface:        "ds2_456-concrete,ds2_789-asphalt"
        --   ext:union_audit_tactile_paving: "ds2_456-yes"
        COALESCE(
            (SELECT jsonb_object_agg('ext:union_audit_' || kv.key, kv.value)
             FROM jsonb_each(d2p.audit_props) kv),
            '{}'::jsonb
        )                                           AS audit_ds2_props
    FROM ds1_nodes n
    LEFT JOIN ds2_props_for_ds1 d2p
        ON d2p.ds1_node_id = n.element_id
    LEFT JOIN ds1_node_confidence c
        ON c.ds1_node_id = n.element_id;

    CREATE INDEX ON ds1_node_merged_props (node_id);

    -- ── Output nodes ──────────────────────────────────────────────────────────
    DROP TABLE IF EXISTS new_export_nodes;
    CREATE TEMP TABLE new_export_nodes ON COMMIT DROP AS

    -- DS1 nodes: original properties + new DS2 keys + ext:audit_ DS2 snapshot
    SELECT
        p.node_id  AS id,
        p.geom     AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', p.node_id) ||
                p.ds1_props        ||   -- DS1 authoritative properties
                p.new_ds2_props    ||   -- DS2 keys absent from DS1 (merged in)
                p.audit_ds2_props  ||   -- ext:union_audit_* full DS2 snapshot for audit
                p.confidence_props      -- ext:union_confidence* (merged or carried)
        ) AS feature
    FROM ds1_node_merged_props p

    UNION ALL

    -- DS2 nodes that did NOT snap to any DS1 node — genuinely new
    SELECT
        nm.out_node_id  AS id,
        nm.out_geom     AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(nm.out_geom, 15)::json,
            'properties',
                jsonb_build_object('_id', nm.out_node_id::TEXT) ||
                ((nm.ds2_feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM node_map nm
    WHERE NOT nm.snapped

    UNION ALL

    -- Road×crossing shared nodes (Rule 3): new nodes created where a road
    -- and crossing intersect. Empty when no such intersections exist.
    SELECT element_id AS id, geom AS loc, feature
    FROM crossing_new_nodes;

    CREATE INDEX ON new_export_nodes (id);
    CREATE INDEX ON new_export_nodes USING GIST (loc);

    RAISE NOTICE 'Phase 6: % output nodes', (SELECT COUNT(*) FROM new_export_nodes);

    -- ── Pre-materialise DS1 edge endpoints ───────────────────────────────────
    -- ST_StartPoint/ST_EndPoint were computed twice per edge (once for ds1_edge_pairs,
    -- once for ds1_out) and twice per LATERAL (condition + ORDER BY).
    -- Materialise once here — both ds1_edge_pairs and ds1_out join against this.
    DROP TABLE IF EXISTS ds1_edge_endpoints;
    CREATE TEMP TABLE ds1_edge_endpoints ON COMMIT DROP AS
    SELECT
        e.element_id::TEXT      AS edge_id,
        e.geom                  AS loc,
        e.feature,
        ST_StartPoint(e.geom)   AS start_pt,
        ST_EndPoint(e.geom)     AS end_pt
    FROM ds1_edges e;
    CREATE INDEX ON ds1_edge_endpoints (edge_id);
    CREATE INDEX ON ds1_edge_endpoints USING GIST (start_pt);
    CREATE INDEX ON ds1_edge_endpoints USING GIST (end_pt);

    -- ── DS1 edge node-pair index for Pass 1 dedup ─────────────────────────────
    DROP TABLE IF EXISTS ds1_edge_pairs;
    CREATE TEMP TABLE ds1_edge_pairs ON COMMIT DROP AS
    SELECT
        LEAST(nu.element_id,    nv.element_id)    AS pair_a,
        GREATEST(nu.element_id, nv.element_id)    AS pair_b
    FROM ds1_edge_endpoints e
    LEFT JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.start_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.start_pt) LIMIT 1
    ) nu ON TRUE
    LEFT JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.end_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.end_pt) LIMIT 1
    ) nv ON TRUE
    WHERE nu.element_id IS NOT NULL
      AND nv.element_id IS NOT NULL
      AND nu.element_id != nv.element_id;

    CREATE INDEX ON ds1_edge_pairs (pair_a, pair_b);

    -- ── DS1 output edges ──────────────────────────────────────────────────────
    -- DS1-immutability EXCEPTION (Rule 3): DS1 edges listed in ds1_edge_splits
    -- are split at road×crossing shared nodes. All other DS1 edges pass through
    -- unchanged (DS1 remains authoritative everywhere else).
    --
    -- Step A: DS1 edges that are NOT split — pass through unchanged.
    DROP TABLE IF EXISTS ds1_out;
    CREATE TEMP TABLE ds1_out ON COMMIT DROP AS
    SELECT
        e.edge_id           AS sub_edge_id,
        e.loc,
        nu.element_id::TEXT AS u_id,
        nv.element_id::TEXT AS v_id,
        e.feature
    FROM ds1_edge_endpoints e
    LEFT JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.start_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.start_pt) LIMIT 1
    ) nu ON TRUE
    LEFT JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.end_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.end_pt) LIMIT 1
    ) nv ON TRUE
    WHERE nu.element_id IS NOT NULL
      AND nv.element_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM ds1_edge_splits s WHERE s.edge_id = e.edge_id
      );

    -- Step B: DS1 edges that ARE split at road×crossing nodes.
    -- Build fraction list per edge: 0.0 (start), 1.0 (end), + interior splits.
    -- Resolve start/end node ids the same way unsplit edges do.
    DROP TABLE IF EXISTS ds1_split_fractions;
    CREATE TEMP TABLE ds1_split_fractions ON COMMIT DROP AS
    -- start sentinel
    SELECT
        e.edge_id,
        nu.element_id::TEXT AS node_id,
        e.start_pt          AS pt_geom,
        0.0::FLOAT8         AS fraction
    FROM ds1_edge_endpoints e
    JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.start_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.start_pt) LIMIT 1
    ) nu ON TRUE
    WHERE EXISTS (SELECT 1 FROM ds1_edge_splits s WHERE s.edge_id = e.edge_id)
    UNION ALL
    -- end sentinel
    SELECT
        e.edge_id,
        nv.element_id::TEXT,
        e.end_pt,
        1.0::FLOAT8
    FROM ds1_edge_endpoints e
    JOIN LATERAL (
        SELECT element_id FROM ds1_nodes n
        WHERE ST_DWithin(n.geom, e.end_pt, proximity_degrees)
        ORDER BY ST_Distance(n.geom, e.end_pt) LIMIT 1
    ) nv ON TRUE
    WHERE EXISTS (SELECT 1 FROM ds1_edge_splits s WHERE s.edge_id = e.edge_id)
    UNION ALL
    -- interior split points (shared crossing nodes)
    SELECT edge_id, node_id, split_geom, fraction
    FROM ds1_edge_splits;

    CREATE INDEX ON ds1_split_fractions (edge_id);

    -- Dedup fractions per edge, order them
    DROP TABLE IF EXISTS ds1_split_dedup;
    CREATE TEMP TABLE ds1_split_dedup ON COMMIT DROP AS
    SELECT DISTINCT ON (edge_id, ROUND(fraction::NUMERIC, 7))
        edge_id, node_id, pt_geom, fraction
    FROM ds1_split_fractions
    ORDER BY edge_id, ROUND(fraction::NUMERIC, 7),
             CASE WHEN node_id IS NOT NULL THEN 0 ELSE 1 END;

    CREATE INDEX ON ds1_split_dedup (edge_id);

    -- Consecutive fraction pairs → sub-edges
    -- Step: materialise the substring ONCE per split sub-edge (sub_geom), then
    -- override its endpoints with the exact split-node coordinates. Computing
    -- ST_LineSubstring a single time (not 2-3×) matters at production scale.
    -- Materialise the LEAD-window fraction pairs ONCE into an indexed temp
    -- table, then join to edge endpoints. Keeps the window computation out of
    -- an inline subquery and gives the join an explicit edge_id index.
    DROP TABLE IF EXISTS ds1_split_pairs;
    CREATE TEMP TABLE ds1_split_pairs ON COMMIT DROP AS
    SELECT
        edge_id,
        fraction AS frac_start,
        LEAD(fraction) OVER (PARTITION BY edge_id ORDER BY fraction) AS frac_end,
        node_id AS u_node_id,
        LEAD(node_id) OVER (PARTITION BY edge_id ORDER BY fraction) AS v_node_id,
        pt_geom AS u_pt,
        LEAD(pt_geom) OVER (PARTITION BY edge_id ORDER BY fraction) AS v_pt
    FROM ds1_split_dedup;
    CREATE INDEX ON ds1_split_pairs (edge_id);

    DROP TABLE IF EXISTS ds1_split_substrings;
    CREATE TEMP TABLE ds1_split_substrings ON COMMIT DROP AS
    SELECT
        fp.edge_id,
        fp.frac_start,
        fp.frac_end,
        fp.u_node_id,
        fp.v_node_id,
        fp.u_pt,
        fp.v_pt,
        ee.feature,
        ST_LineSubstring(ee.loc, fp.frac_start, fp.frac_end) AS sub_geom
    FROM ds1_split_pairs fp
    JOIN ds1_edge_endpoints ee ON ee.edge_id = fp.edge_id
    WHERE fp.frac_end IS NOT NULL
      AND fp.frac_end > fp.frac_start
      AND fp.u_node_id IS NOT NULL
      AND fp.v_node_id IS NOT NULL;

    DROP TABLE IF EXISTS ds1_split_out;
    CREATE TEMP TABLE ds1_split_out ON COMMIT DROP AS
    SELECT
        edge_id || '_' ||
            ROUND(frac_start::NUMERIC,7)::TEXT || '_' ||
            ROUND(frac_end::NUMERIC,7)::TEXT    AS sub_edge_id,
        -- Override first/last vertex of the (already-computed) substring with
        -- the exact split-node geometry so edge endpoints == node coords.
        -- sub_geom is computed once above; ST_NPoints reads it, no recompute.
        CASE
            WHEN u_pt IS NOT NULL AND v_pt IS NOT NULL THEN
                ST_SetPoint(ST_SetPoint(sub_geom, 0, u_pt),
                            ST_NPoints(sub_geom) - 1, v_pt)
            WHEN u_pt IS NOT NULL THEN
                ST_SetPoint(sub_geom, 0, u_pt)
            WHEN v_pt IS NOT NULL THEN
                ST_SetPoint(sub_geom, ST_NPoints(sub_geom) - 1, v_pt)
            ELSE sub_geom
        END AS loc,
        u_node_id AS u_id,
        v_node_id AS v_id,
        feature
    FROM ds1_split_substrings;

    -- Append split DS1 sub-edges to ds1_out
    INSERT INTO ds1_out (sub_edge_id, loc, u_id, v_id, feature)
    SELECT sub_edge_id, loc, u_id, v_id, feature
    FROM ds1_split_out
    WHERE ST_NPoints(loc) >= 2 AND ST_Length(loc) > 0;

    CREATE INDEX ON ds1_out (sub_edge_id);
    CREATE INDEX ON ds1_out USING GIST (loc);

    RAISE NOTICE 'Phase 6: ds1_out has % edges (incl % split DS1 sub-edges)',
        (SELECT COUNT(*) FROM ds1_out),
        (SELECT COUNT(*) FROM ds1_split_out);

    -- ── DS2 sub-edges with resolved node ids ──────────────────────────────────
    -- ds2_resolved: resolve u_out/v_out node ids for each DS2 sub-edge.
    -- Previously used 4 correlated subqueries per row — each triggers a
    -- separate ST_DWithin scan against node_map even when u_node_id is already known.
    -- Replace with LEFT JOIN LATERAL — executes only when needed (se.u_node_id IS NULL),
    -- uses node_map GIST index, and runs once per row not once per subquery.
    DROP TABLE IF EXISTS ds2_resolved;
    CREATE TEMP TABLE ds2_resolved ON COMMIT DROP AS
    SELECT
        se.sub_edge_id,
        se.geom                                             AS loc,
        se.feature,
        COALESCE(se.u_node_id, lu.out_node_id, lcu.element_id) AS u_out,
        COALESCE(se.v_node_id, lv.out_node_id, lcv.element_id) AS v_out
    FROM ds2_sub_edges se
    -- u_out: nearest node_map entry to start_geom (only when u_node_id unknown)
    LEFT JOIN LATERAL (
        SELECT nm.out_node_id
        FROM node_map nm
        WHERE se.u_node_id IS NULL
          AND ST_DWithin(nm.out_geom, se.start_geom, proximity_degrees)
        ORDER BY ST_Distance(nm.out_geom, se.start_geom) LIMIT 1
    ) lu ON TRUE
    -- u_out fallback: road×crossing shared node coincident with the start
    -- (Rule 3). Empty when no road×crossing intersections exist.
    LEFT JOIN LATERAL (
        SELECT cn.element_id
        FROM crossing_new_nodes cn
        WHERE se.u_node_id IS NULL AND lu.out_node_id IS NULL
          AND ST_DWithin(cn.geom, se.start_geom, snap_tolerance * 100)
        LIMIT 1
    ) lcu ON TRUE
    -- v_out: nearest node_map entry to end_geom (only when v_node_id unknown)
    LEFT JOIN LATERAL (
        SELECT nm.out_node_id
        FROM node_map nm
        WHERE se.v_node_id IS NULL
          AND ST_DWithin(nm.out_geom, se.end_geom, proximity_degrees)
        ORDER BY ST_Distance(nm.out_geom, se.end_geom) LIMIT 1
    ) lv ON TRUE
    -- v_out fallback: crossing node at end
    LEFT JOIN LATERAL (
        SELECT cn.element_id
        FROM crossing_new_nodes cn
        WHERE se.v_node_id IS NULL AND lv.out_node_id IS NULL
          AND ST_DWithin(cn.geom, se.end_geom, snap_tolerance * 100)
        LIMIT 1
    ) lcv ON TRUE;

    CREATE INDEX ON ds2_resolved (sub_edge_id);
    CREATE INDEX ON ds2_resolved USING GIST (loc);

    -- ── Pass 1: node-pair dedup — drop DS2 edges duplicating DS1 (u,v) pairs ─
    DROP TABLE IF EXISTS ds2_out;
    CREATE TEMP TABLE ds2_out ON COMMIT DROP AS
    SELECT DISTINCT ON (LEAST(u_out, v_out), GREATEST(u_out, v_out))
        sub_edge_id, loc, u_out, v_out, feature
    FROM ds2_resolved
    WHERE u_out IS NOT NULL
      AND v_out IS NOT NULL
      AND u_out != v_out
      AND NOT EXISTS (
          SELECT 1 FROM ds1_edge_pairs p
          WHERE p.pair_a = LEAST(u_out, v_out)
            AND p.pair_b = GREATEST(u_out, v_out)
      )
    ORDER BY LEAST(u_out, v_out), GREATEST(u_out, v_out), sub_edge_id;

    CREATE INDEX ON ds2_out (sub_edge_id);
    CREATE INDEX ON ds2_out USING GIST (loc);

    RAISE NOTICE 'Phase 6: ds2_out has % rows (after node-pair dedup)', (SELECT COUNT(*) FROM ds2_out);

    -- ── Pass 2: geometry dedup — drop DS2 edges ≥80% covered by DS1 buffer ───
    --
    -- Handles diverging-edge scenario:
    --   DS1: A ──────────────── C
    --   DS2: A → B,  B → C  (same path, midpoint B added)
    --   Node-pair dedup misses these (different pairs: A-B, B-C vs A-C).
    --   But A→B and B→C each lie almost entirely inside buffer(A→C).
    --
    -- Performance design (90K+ DS2 edges):
    --   WRONG: ST_Union all DS1 edges → one giant polygon → CROSS JOIN → no index use.
    --   RIGHT: Keep DS1 edges individual and buffered. For each DS2 edge, use
    --          ST_DWithin to find only nearby DS1 edges (spatial index), union
    --          just those local buffers, then compute coverage ratio.
    --
    -- This reduces ST_Intersection work from (90K × giant_polygon) to
    -- (90K × small_local_union), with spatial index eliminating most pairs.
    --
    -- Step 1: pre-buffer each DS1 edge individually and index.
    --   Buffering done once here — not repeated per DS2 edge.

    -- Buffer DS1 edges, carrying their type_group so Rule 2 can restrict
    -- dedup to same-type edges only. type_group looked up from edge_type_groups
    -- by matching the original DS1 edge id (sub_edge_id prefix before any '_' split).
    DROP TABLE IF EXISTS ds1_edge_buffers;
    CREATE TEMP TABLE ds1_edge_buffers ON COMMIT DROP AS
    SELECT
        o.sub_edge_id,
        COALESCE(etg.type_group, 'other') AS type_group,
        ST_Buffer(o.loc, proximity_degrees) AS buf
    FROM ds1_out o
    LEFT JOIN edge_type_groups etg
        ON etg.src = 'ds1'
        -- sub_edge_id is either the raw DS1 edge id, or '<id>_<f1>_<f2>' for splits.
        AND etg.element_id = split_part(o.sub_edge_id, '_', 1);
    CREATE INDEX ON ds1_edge_buffers USING GIST (buf);
    CREATE INDEX ON ds1_edge_buffers (type_group);

    -- Step 2: for each DS2 edge, compute coverage ratio against nearby DS1 buffers only.
    --   ST_DWithin on the buf column uses the GIST index → only nearby DS1 edges
    --   are considered. ST_Union of just those few local buffers is cheap.
    --   ST_CollectionExtract(...,2) extracts linestrings from intersection result
    --   which may be GEOMETRYCOLLECTION when edge dips in/out of buffer.

    -- Rule 2 — type-aware geometry dedup.
    -- A DS2 edge is only deduped against DS1 buffers of the SAME type group.
    -- A DS2 sidewalk running parallel to a DS1 road is therefore never dropped:
    -- the road buffer is a different type group and excluded from the union.
    -- DS2 edge type group resolved from its originating edge id (prefix of sub_edge_id).
    DROP TABLE IF EXISTS ds2_coverage_ratio;
    CREATE TEMP TABLE ds2_coverage_ratio ON COMMIT DROP AS
    SELECT
        d.sub_edge_id,
        COALESCE(
            ST_Length(
                ST_CollectionExtract(
                    ST_Intersection(
                        d.loc,
                        (SELECT ST_Union(b.buf)
                         FROM ds1_edge_buffers b
                         WHERE ST_DWithin(d.loc, b.buf, 0)        -- spatial index filter
                           AND b.type_group = COALESCE(dt.type_group, 'other')  -- same type only
                        )
                    ), 2
                )
            ) / NULLIF(ST_Length(d.loc), 0),
            0.0   -- no nearby same-type DS1 edges → 0% covered → keep
        ) AS covered_pct
    FROM ds2_out d
    LEFT JOIN edge_type_groups dt
        ON dt.src = 'ds2'
        AND dt.element_id = split_part(d.sub_edge_id, '_', 1);

    CREATE INDEX ON ds2_coverage_ratio (sub_edge_id);

    -- Connectivity guard for geometry dedup:
    -- A DS2 edge is dropped as a geometric duplicate ONLY if removing it does
    -- not sever connectivity. An edge whose BOTH endpoints are shared/snapped
    -- nodes (nodes that also belong to DS1 or are crossing-shared nodes) is a
    -- real connector between two output nodes — dropping it breaks the graph.
    --
    -- Failure case this fixes:
    --   A short sidewalk segment between two crossing connection points runs
    --   near both crossing edges. Combined crossing buffers cover it ~100%, so
    --   the raw 80% rule drops it — but it is the ONLY link between those two
    --   shared nodes. Result: a missing edge / broken path.
    --
    -- An output node is "shared" if it appears as a u/v in ds1_out (DS1 node)
    -- or is a crossing_shared_node. We keep any DS2 edge whose both endpoints
    -- are shared, regardless of coverage. Pass 1 (node-pair dedup) already
    -- removed true duplicates that share a DS1 (u,v) pair, so kept edges here
    -- are genuine distinct connectors.
    DROP TABLE IF EXISTS shared_out_nodes;
    CREATE TEMP TABLE shared_out_nodes ON COMMIT DROP AS
    SELECT u_id AS node_id FROM ds1_out
    UNION
    SELECT v_id FROM ds1_out
    UNION
    SELECT element_id FROM crossing_new_nodes;
    CREATE INDEX ON shared_out_nodes (node_id);

    DROP TABLE IF EXISTS ds2_out_filtered;
    CREATE TEMP TABLE ds2_out_filtered ON COMMIT DROP AS
    SELECT d.*
    FROM ds2_out d
    JOIN ds2_coverage_ratio r ON r.sub_edge_id = d.sub_edge_id
    WHERE r.covered_pct < 0.80
       OR (
            -- connectivity guard: keep if both endpoints are shared nodes
            EXISTS (SELECT 1 FROM shared_out_nodes s WHERE s.node_id = d.u_out)
        AND EXISTS (SELECT 1 FROM shared_out_nodes s WHERE s.node_id = d.v_out)
       );

    CREATE INDEX ON ds2_out_filtered (sub_edge_id);
    CREATE INDEX ON ds2_out_filtered USING GIST (loc);

    RAISE NOTICE 'Phase 6: ds2_out_filtered has % rows (geometry dedup dropped %)',
        (SELECT COUNT(*) FROM ds2_out_filtered),
        (SELECT COUNT(*) FROM ds2_out) - (SELECT COUNT(*) FROM ds2_out_filtered);

    -- ── Final output edges: DS1 + filtered DS2 ───────────────────────────────
    DROP TABLE IF EXISTS new_export_edges;
    CREATE TEMP TABLE new_export_edges ON COMMIT DROP AS
    SELECT
        sub_edge_id,
        loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(loc, 15)::json,
            'properties',
                jsonb_build_object(
                    '_id',   ROW_NUMBER() OVER (ORDER BY sub_edge_id)::TEXT,
                    '_u_id', u::TEXT,
                    '_v_id', v::TEXT
                ) ||
                (COALESCE(feature::jsonb->'properties', '{}'::jsonb)
                    - '_id' - '_u_id' - '_v_id')
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY sub_edge_id) AS seq_id
    FROM (
        SELECT sub_edge_id, loc, u_id AS u, v_id AS v, feature FROM ds1_out
        WHERE ST_NPoints(loc) >= 2 AND ST_Length(loc) > 0
        UNION ALL
        SELECT sub_edge_id, loc, u_out, v_out, feature FROM ds2_out_filtered
        WHERE ST_NPoints(loc) >= 2 AND ST_Length(loc) > 0
    ) all_edges;

    CREATE INDEX ON new_export_edges (sub_edge_id);
    CREATE INDEX ON new_export_edges (seq_id);

    RAISE NOTICE 'Phase 6 complete: % total output edges', (SELECT COUNT(*) FROM new_export_edges);

    -- =========================================================================
    -- PHASE 7: Zones and extension types
    --
    -- Zones are polygon entities — no network cutting applies.
    -- Zones from DS1 and DS2 that overlap ≥70% are the same real-world zone;
    -- keep one representative (the DS2 geometry, as it may be more recent).
    -- Zones unique to one dataset are kept as-is.
    -- =========================================================================
    RAISE NOTICE 'Phase 7: Zone processing at %', clock_timestamp();

    -- Step 1: rebuild ring geometry from zone vertex points.
    -- node_ids in _w_id must reference output node ids (after NodeMap snapping),
    -- not original element_ids from the source dataset.
    --
    -- For DS1 zone nodes: element_id is already the output id.
    -- For DS2 zone nodes: element_id must be mapped through node_map to out_node_id.
    --   If a DS2 zone node snapped to DS1 → use DS1 node id (out_node_id).
    --   If a DS2 zone node is new (not snapped) → use DS2 node id as-is.
    --
    -- Example:
    --   DS2 zone has ring node ids: [101, 102, 103]
    --   NodeMap: 101→A, 102→B, 103→103 (new)
    --   Output _w_id: [A, B, 103]  ← all present in new_export_nodes ✓

    DROP TABLE IF EXISTS zone_ring_lines;
    CREATE TEMP TABLE zone_ring_lines ON COMMIT DROP AS
    SELECT
        zp.source,
        zp.element_id,
        zp.element_sub_id,
        ST_MakeLine(zp.geom ORDER BY zp.element_sub_sub_id) AS ring_geom,
        ARRAY_AGG(
            CASE
                -- DS1 zone: node id is already the output id
                WHEN zp.source = src_one_tdei_dataset_id THEN n.element_id::TEXT
                -- DS2 zone: map through NodeMap to get output node id
                ELSE COALESCE(nm.out_node_id, n.element_id::TEXT)
            END
            ORDER BY zp.element_sub_sub_id
        ) FILTER (WHERE n.element_id IS NOT NULL) AS node_ids
    FROM testzonepoints zp
    LEFT JOIN testnodes n
        ON ST_DWithin(n.geom, zp.geom, snap_tolerance)  -- uses GIST index
        AND n.source = zp.source
    LEFT JOIN node_map nm
        ON nm.ds2_node_id = n.element_id::TEXT
        AND zp.source = src_two_tdei_dataset_id
    GROUP BY zp.source, zp.element_id, zp.element_sub_id;

    CREATE INDEX ON zone_ring_lines (element_id, source);

    -- Step 2: separate outer ring (sub_id=1) from inner rings (holes).
    --
    -- Group by (source, element_id) ONLY — not node_ids.
    -- node_ids varies per ring row; including it in GROUP BY would create
    -- one row per ring instead of one row per zone, breaking inner ring aggregation.
    --
    -- node_ids: concatenate all ring node_ids arrays into one flat array,
    -- preserving outer-first ordering (sub_id=1 first, then inner rings).
    DROP TABLE IF EXISTS zone_outer_and_inners;
    CREATE TEMP TABLE zone_outer_and_inners ON COMMIT DROP AS
    SELECT
        source,
        element_id,
        (ARRAY_AGG(ring_geom ORDER BY element_sub_id)
            FILTER (WHERE element_sub_id = 1))[1]       AS new_outer_ring,
        ARRAY_AGG(ring_geom ORDER BY element_sub_id)
            FILTER (WHERE element_sub_id > 1)            AS new_inner_rings,
        -- Flatten all ring node_ids into one array, outer ring first
        (SELECT ARRAY_AGG(nid ORDER BY sub_id, pos)
         FROM (
             SELECT element_sub_id AS sub_id,
                    UNNEST(node_ids) AS nid,
                    GENERATE_SUBSCRIPTS(node_ids, 1) AS pos
             FROM zone_ring_lines zrl2
             WHERE zrl2.source    = zrl.source
               AND zrl2.element_id = zrl.element_id
         ) flat
        )                                                AS node_ids
    FROM zone_ring_lines zrl
    GROUP BY source, element_id;

    -- Step 3: build valid polygons.
    --
    -- ST_MakePolygon(ring, holes) returns NULL when holes is NULL.
    -- Simple polygons (no inner rings) have new_inner_rings = NULL,
    -- so they must use the single-argument form ST_MakePolygon(ring).
    DROP TABLE IF EXISTS zone_polygons;
    CREATE TEMP TABLE zone_polygons ON COMMIT DROP AS
    SELECT
        source,
        element_id,
        node_ids,
        CASE
            WHEN new_inner_rings IS NOT NULL AND array_length(new_inner_rings, 1) > 0
            THEN ST_MakePolygon(new_outer_ring, new_inner_rings)  -- polygon with holes
            ELSE ST_MakePolygon(new_outer_ring)                   -- simple polygon
        END AS newgeom
    FROM zone_outer_and_inners
    WHERE new_outer_ring IS NOT NULL
      AND ST_NPoints(new_outer_ring) >= 4
      AND ST_IsClosed(new_outer_ring)
      AND ST_IsValid(ST_MakeValid(new_outer_ring));

    CREATE INDEX ON zone_polygons (element_id, source);
    CREATE INDEX ON zone_polygons USING GIST (newgeom);

    -- Step 4: match cross-dataset zones by 70% area overlap.
    --
    -- DS1 is always p1, DS2 is always p2 — enforced by source filter.
    -- This ensures:
    --   • Each matched zone appears exactly once (as the DS1 record)
    --   • DS1 geometry (with holes) is always preserved
    --   • DS2 zones that matched are tracked via ds2_id so they are
    --     excluded from the singletons in Step 5
    --
    -- Without this constraint, both DS1→DS2 and DS2→DS1 matches appear,
    -- causing matched zones to be excluded from singletons on both sides
    -- and disappear entirely from the output.
    DROP TABLE IF EXISTS zone_witnesspolygon;
    CREATE TEMP TABLE zone_witnesspolygon ON COMMIT DROP AS
    SELECT DISTINCT ON (p1.element_id)
        p1.element_id   AS id,       -- DS1 zone id
        p2.element_id   AS ds2_id,   -- DS2 zone id (to exclude from singletons)
        p1.newgeom,                  -- DS1 geometry preserved (with holes)
        p1.node_ids                  -- DS1 node_ids preserved
    FROM zone_polygons p1
    JOIN zone_polygons p2
        ON  p1.source  = src_one_tdei_dataset_id   -- p1 always DS1
        AND p2.source  = src_two_tdei_dataset_id   -- p2 always DS2
        AND ST_IsValid(p1.newgeom)
        AND ST_IsValid(p2.newgeom)
        AND ST_Intersects(p1.newgeom, p2.newgeom)
        AND (
            ST_Area(ST_Intersection(p1.newgeom, p2.newgeom)) /
            NULLIF(ST_Area(p1.newgeom), 0)   -- DS1-relative, avoids ST_Union recompute
        ) > 0.7
    ORDER BY p1.element_id,
             ST_Area(ST_Intersection(p1.newgeom, p2.newgeom)) /
             NULLIF(ST_Area(p1.newgeom), 0) DESC;

    CREATE INDEX ON zone_witnesspolygon (id);
    CREATE INDEX ON zone_witnesspolygon (ds2_id);

    -- Step 5: union — matched zones (DS1 geometry) + unmatched singletons.
    --
    -- Matched DS1 zones: taken from zone_witnesspolygon (DS1 geometry, with holes).
    -- Unmatched DS1 zones: DS1 zones with no DS2 match — kept as-is.
    -- Unmatched DS2 zones: DS2 zones not matched to any DS1 zone — kept as-is.
    -- Matched DS2 zones: excluded (already represented by their DS1 counterpart).
    DROP TABLE IF EXISTS union_zones;
    CREATE TEMP TABLE union_zones ON COMMIT DROP AS

    -- Matched: DS1 geometry (authoritative, with holes)
    SELECT id, newgeom, node_ids
    FROM zone_witnesspolygon
    WHERE ST_IsValid(newgeom)

    UNION ALL

    -- Unmatched DS1 zones (no DS2 counterpart)
    SELECT p.element_id AS id, p.newgeom, p.node_ids
    FROM zone_polygons p
    WHERE p.source = src_one_tdei_dataset_id
      AND ST_IsValid(p.newgeom)
      AND NOT EXISTS (
          SELECT 1 FROM zone_witnesspolygon w WHERE w.id = p.element_id
      )

    UNION ALL

    -- Unmatched DS2 zones (no DS1 counterpart)
    SELECT p.element_id AS id, p.newgeom, p.node_ids
    FROM zone_polygons p
    WHERE p.source = src_two_tdei_dataset_id
      AND ST_IsValid(p.newgeom)
      AND NOT EXISTS (
          SELECT 1 FROM zone_witnesspolygon w WHERE w.ds2_id = p.element_id
      );

    CREATE INDEX ON union_zones (id);

    DROP TABLE IF EXISTS witness_zones;
    CREATE TEMP TABLE witness_zones ON COMMIT DROP AS
    SELECT DISTINCT ON (newgeom) newgeom, node_ids, id
    FROM union_zones ORDER BY newgeom;
    CREATE INDEX ON witness_zones (id);

    DROP TABLE IF EXISTS final_zones;
    CREATE TEMP TABLE final_zones ON COMMIT DROP AS
    SELECT wz.newgeom AS loc, wz.id, z.feature,
           -- Inline dedup_consecutive: remove adjacent duplicate node ids.
           -- Walks the node_ids array, keeping an element only if it differs
           -- from the previous element. Non-adjacent duplicates are preserved.
           -- e.g. [A, A, B, C, C, A] → [A, B, C, A]
           ARRAY(
               SELECT val FROM (
                   SELECT
                       val,
                       LAG(val) OVER (ORDER BY idx) AS prev_val,
                       idx
                   FROM UNNEST(wz.node_ids) WITH ORDINALITY AS t(val, idx)
               ) deduped
               WHERE prev_val IS DISTINCT FROM val
               ORDER BY idx
           ) AS node_ids
    FROM witness_zones wz
    JOIN testzones z ON wz.id = z.element_id;
    CREATE INDEX ON final_zones (node_ids);

    DROP TABLE IF EXISTS new_export_zones;
    CREATE TEMP TABLE new_export_zones ON COMMIT DROP AS
    SELECT DISTINCT ON (fz.id)
        fz.id,
        fz.loc AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(fz.loc, 15)::json,
            'properties',
                jsonb_build_object('_id', fz.id::TEXT) ||
                ((fz.feature::jsonb->'properties') - '_w_id' - '_id') ||
                jsonb_build_object('_w_id', fz.node_ids)
        ) AS feature
    FROM final_zones fz;

    CREATE INDEX ON new_export_zones (id);
    CREATE INDEX ON new_export_zones USING GIST (loc);

    -- ── Extension points: geometry dedup by snapped position ─────────────────
    -- =========================================================================
    -- Extension Points
    --
    -- Points are single lat/lng features adjacent to (not part of) the pedestrian
    -- network: power_pole, fire_hydrant, bench, bollard, manhole, street_lamp,
    -- waste_basket, tree. Each is identified by an OSW tag (power=pole,
    -- amenity=bench, …) → point_type, classified in ext_points.
    --
    -- Dedup rule: a DS2 point within proximity_degrees of a SAME-TYPE DS1 point
    -- is the same real-world feature (a pole merges with a pole, never a bench).
    -- Keep DS1 position (authoritative). Add DS2-only properties (keys not on
    -- DS1) — no override. Untyped ('other') on either side falls back to allow.
    --
    -- Steps:
    --   pt_matched  – DS2 points with a SAME-TYPE DS1 neighbour within proximity.
    --                 One DS1 match per DS2 point (nearest). Merged props built.
    --   pt_ds1_merged – DS1 points with merged DS2-only props.
    --                   Aggregated to avoid duplicates when multiple DS2 points
    --                   snap to the same DS1 point.
    --   pt_unmatched – DS2 points with no DS1 neighbour → genuinely new.
    --   new_export_points = pt_ds1_merged UNION ALL pt_unmatched
    -- =========================================================================

    -- Step 1: find nearest DS1 point for each DS2 point within proximity
    DROP TABLE IF EXISTS pt_matched;
    CREATE TEMP TABLE pt_matched ON COMMIT DROP AS
    SELECT DISTINCT ON (p2.element_id)
        p2.element_id                               AS ds2_id,
        p1.element_id                               AS ds1_id,
        p1.geom                                     AS ds1_geom,
        p1.feature                                  AS ds1_feature,
        (p2.feature::jsonb->'properties') - '_id'   AS ds2_props
    FROM ext_points p2
    JOIN ext_points p1
        ON  p1.source = src_one_tdei_dataset_id
        AND p2.source = src_two_tdei_dataset_id
        AND ST_DWithin(p2.geom, p1.geom, proximity_degrees)
        -- TYPE GUARD: only merge points of the SAME identifying type.
        -- A pole merges with a pole, never with a bench. Untyped ('other')
        -- on either side falls back to allow (no identifying field to separate on).
        AND (
              p1.point_type = 'other'
           OR p2.point_type = 'other'
           OR p1.point_type = p2.point_type
        )
    ORDER BY p2.element_id,
             ST_Distance(p2.geom, p1.geom) ASC;

    CREATE INDEX ON pt_matched (ds1_id);
    CREATE INDEX ON pt_matched (ds2_id);

    -- Step 2: aggregate all DS2-only props per DS1 point (many DS2 → one DS1)
    DROP TABLE IF EXISTS pt_ds2_agg;
    CREATE TEMP TABLE pt_ds2_agg ON COMMIT DROP AS
    SELECT
        ds1_id,
        jsonb_object_agg(kv.key, kv.value) AS new_props
    FROM pt_matched,
         jsonb_each(ds2_props) kv
    GROUP BY ds1_id;

    CREATE INDEX ON pt_ds2_agg (ds1_id);

    -- Step 3: DS1 points with merged DS2-only properties
    DROP TABLE IF EXISTS pt_ds1_merged;
    CREATE TEMP TABLE pt_ds1_merged ON COMMIT DROP AS
    SELECT
        p1.element_id::TEXT AS id,
        p1.geom             AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p1.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', p1.element_id::TEXT) ||
                ((p1.feature::jsonb->'properties') - '_id') ||
                -- Add DS2-only keys (those not already on DS1)
                COALESCE(
                    (SELECT jsonb_object_agg(kv.key, kv.value)
                     FROM jsonb_each(agg.new_props) kv
                     WHERE NOT (p1.feature::jsonb->'properties') ? kv.key),
                    '{}'::jsonb
                )
        ) AS feature
    FROM ext_points p1
    LEFT JOIN pt_ds2_agg agg ON agg.ds1_id = p1.element_id
    WHERE p1.source = src_one_tdei_dataset_id;

    CREATE INDEX ON pt_ds1_merged (id);
    CREATE INDEX ON pt_ds1_merged USING GIST (loc);

    -- Step 4: DS2 points with no DS1 match → new points
    DROP TABLE IF EXISTS pt_unmatched;
    CREATE TEMP TABLE pt_unmatched ON COMMIT DROP AS
    SELECT
        p2.element_id::TEXT AS id,
        p2.geom             AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p2.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', p2.element_id::TEXT) ||
                ((p2.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM ext_points p2
    WHERE p2.source = src_two_tdei_dataset_id
      AND NOT EXISTS (
          SELECT 1 FROM pt_matched pm WHERE pm.ds2_id = p2.element_id
      );

    CREATE INDEX ON pt_unmatched (id);
    CREATE INDEX ON pt_unmatched USING GIST (loc);

    -- Step 5: final output points
    DROP TABLE IF EXISTS new_export_points;
    CREATE TEMP TABLE new_export_points ON COMMIT DROP AS
    SELECT id, loc, feature FROM pt_ds1_merged
    UNION ALL
    SELECT id, loc, feature FROM pt_unmatched;

    CREATE INDEX ON new_export_points (id);
    CREATE INDEX ON new_export_points USING GIST (loc);

    RAISE NOTICE 'Phase 7: points — ds1=%, new_ds2=%',
        (SELECT COUNT(*) FROM pt_ds1_merged),
        (SELECT COUNT(*) FROM pt_unmatched);

    -- =========================================================================
    -- Extension Lines
    --
    -- Dedup rule: DS2 lines within proximity of a DS1 line by Hausdorff distance
    -- are the same real-world feature. Keep DS1 geometry (authoritative).
    -- Add DS2-only properties — no override.
    --
    -- ST_HausdorffDistance measures shape similarity end-to-end.
    -- Two lines are the same if their Hausdorff distance < proximity_degrees.
    -- Falls back: if no DS1 match within proximity → new line, keep as-is.
    -- =========================================================================

    -- Step 1a: pre-buffer DS1 lines once, materialise and index.
    -- For 45M records ST_Buffer(l1.geom) was computed 3× per (DS2,DS1) pair
    -- (SELECT, WHERE, ORDER BY). Pre-buffering computes it once per DS1 line.
    -- GIST index on buf column enables ST_DWithin spatial filter.
    DROP TABLE IF EXISTS ds1_line_buffers;
    CREATE TEMP TABLE ds1_line_buffers ON COMMIT DROP AS
    SELECT
        element_id,
        geom,
        feature,
        ST_Buffer(geom, proximity_degrees) AS buf
    FROM ext_lines
    WHERE source = src_one_tdei_dataset_id;
    CREATE INDEX ON ds1_line_buffers USING GIST (buf);
    CREATE INDEX ON ds1_line_buffers (element_id);

    -- Step 1b: match DS2 lines to DS1 lines by buffer overlap ratio.
    -- ST_DWithin(l2.geom, b.buf, 0) uses GIST index on buf → spatial filter first.
    -- ST_Buffer already materialised — only ST_Intersection+ST_Length per candidate.
    -- overlap_ratio computed once in subquery, reused in WHERE and ORDER BY.
    --
    -- Example (long offset fence lines):
    --   DS1 fence: 500m inner edge,  DS2 fence: 480m outer edge, offset 3m
    --   ST_Buffer(DS1, proximity) covers ~460m of DS2 → overlap 96% → matched ✓
    DROP TABLE IF EXISTS ln_matched;
    CREATE TEMP TABLE ln_matched ON COMMIT DROP AS
    SELECT DISTINCT ON (ds2_id)
        ds2_id, ds1_id, ds1_geom, ds1_feature, ds2_props, overlap_ratio
    FROM (
        SELECT
            l2.element_id                               AS ds2_id,
            b.element_id                                AS ds1_id,
            b.geom                                      AS ds1_geom,
            b.feature                                   AS ds1_feature,
            (l2.feature::jsonb->'properties') - '_id'   AS ds2_props,
            ST_Length(
                ST_CollectionExtract(
                    ST_Intersection(l2.geom, b.buf), 2  -- buf pre-computed
                )
            ) / NULLIF(ST_Length(l2.geom), 0)           AS overlap_ratio
        FROM ext_lines l2
        JOIN ds1_line_buffers b
            ON  l2.source = src_two_tdei_dataset_id
            AND ST_DWithin(l2.geom, b.buf, 0)           -- uses GIST on buf
    ) candidates
    WHERE overlap_ratio >= 0.70
    ORDER BY ds2_id, overlap_ratio DESC;

    CREATE INDEX ON ln_matched (ds1_id);
    CREATE INDEX ON ln_matched (ds2_id);

    -- Step 2: aggregate DS2-only props per DS1 line
    DROP TABLE IF EXISTS ln_ds2_agg;
    CREATE TEMP TABLE ln_ds2_agg ON COMMIT DROP AS
    SELECT
        ds1_id,
        jsonb_object_agg(kv.key, kv.value) AS new_props
    FROM ln_matched,
         jsonb_each(ds2_props) kv
    GROUP BY ds1_id;

    CREATE INDEX ON ln_ds2_agg (ds1_id);

    -- Step 3: DS1 lines with merged DS2-only properties
    DROP TABLE IF EXISTS ln_ds1_merged;
    CREATE TEMP TABLE ln_ds1_merged ON COMMIT DROP AS
    SELECT
        l1.element_id::TEXT AS id,
        l1.geom             AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(l1.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', l1.element_id::TEXT) ||
                ((l1.feature::jsonb->'properties') - '_id') ||
                COALESCE(
                    (SELECT jsonb_object_agg(kv.key, kv.value)
                     FROM jsonb_each(agg.new_props) kv
                     WHERE NOT (l1.feature::jsonb->'properties') ? kv.key),
                    '{}'::jsonb
                )
        ) AS feature
    FROM ext_lines l1
    LEFT JOIN ln_ds2_agg agg ON agg.ds1_id = l1.element_id
    WHERE l1.source = src_one_tdei_dataset_id;

    CREATE INDEX ON ln_ds1_merged (id);

    -- Step 4: DS2 lines with no DS1 match → new lines
    DROP TABLE IF EXISTS ln_unmatched;
    CREATE TEMP TABLE ln_unmatched ON COMMIT DROP AS
    SELECT
        l2.element_id::TEXT AS id,
        l2.geom             AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(l2.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', l2.element_id::TEXT) ||
                ((l2.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM ext_lines l2
    WHERE l2.source = src_two_tdei_dataset_id
      AND NOT EXISTS (
          SELECT 1 FROM ln_matched lm WHERE lm.ds2_id = l2.element_id
      );

    CREATE INDEX ON ln_unmatched (id);

    -- Step 5: final output lines with seq_id
    DROP TABLE IF EXISTS new_export_lines;
    CREATE TEMP TABLE new_export_lines ON COMMIT DROP AS
    SELECT id, loc, feature,
           ROW_NUMBER() OVER (ORDER BY id) AS seq_id
    FROM (
        SELECT id, loc, feature FROM ln_ds1_merged
        UNION ALL
        SELECT id, loc, feature FROM ln_unmatched
    ) all_lines;

    CREATE INDEX ON new_export_lines (id);

    RAISE NOTICE 'Phase 7: lines — ds1=%, new_ds2=%',
        (SELECT COUNT(*) FROM ln_ds1_merged),
        (SELECT COUNT(*) FROM ln_unmatched);

    -- =========================================================================
    -- Extension Polygons
    --
    -- Three cases based on cross-dataset overlap ratio
    -- (intersection area / union area):
    --
    --   >70% overlap  → same real-world polygon. Keep DS1 geometry (authoritative).
    --                   Merge DS2-only properties in (no override).
    --
    --   <70% but intersecting → different but related polygons. Merge geometry
    --                   with ST_Union. Properties: DS1 authoritative + DS2 new keys.
    --
    --   No intersection → unique to one dataset. Keep as-is.
    --
    -- Implementation: three materialised temp tables (poly_high, poly_low,
    -- poly_unmatched) then union. Avoids repeating the expensive self-join.
    -- =========================================================================

    -- Step 1: materialise all valid polygons from both datasets once
    DROP TABLE IF EXISTS poly_valid;
    CREATE TEMP TABLE poly_valid ON COMMIT DROP AS
    SELECT element_id::TEXT AS id, source, geom AS loc, feature
    FROM ext_polygons
    WHERE ST_IsValid(geom);

    CREATE INDEX ON poly_valid (id, source);
    CREATE INDEX ON poly_valid USING GIST (loc);

    -- Step 2: find all cross-dataset intersecting pairs with overlap ratio.
    --
    -- Overlap ratio = intersection area / DS1 area (not Jaccard / union area).
    --
    -- Why not Jaccard (intersection/union):
    --   Two polygons sharing 80% of DS1's area but slightly offset:
    --   Jaccard = 0.8X / 1.2X = 0.67 → fires poly_low (ST_Union) ✗
    --   DS1-relative = 0.8X / X  = 0.80 → fires poly_high (keep DS1) ✓
    --
    -- Using DS1 area as denominator answers the right question:
    -- "How much of DS1 is covered by DS2?" — if the answer is >70%,
    -- they are the same real-world polygon and DS1 is kept as-is.
    DROP TABLE IF EXISTS poly_pairs;
    CREATE TEMP TABLE poly_pairs ON COMMIT DROP AS
    SELECT DISTINCT ON (p1.id)
        p1.id                                           AS ds1_id,
        p2.id                                           AS ds2_id,
        p1.loc                                          AS ds1_loc,
        p2.loc                                          AS ds2_loc,
        p1.feature                                      AS ds1_feature,
        p2.feature                                      AS ds2_feature,
        ST_Area(ST_Intersection(p1.loc, p2.loc)) /
            NULLIF(ST_Area(p1.loc), 0)                  AS overlap_ratio
    FROM poly_valid p1
    JOIN poly_valid p2
        ON  p1.source = src_one_tdei_dataset_id
        AND p2.source = src_two_tdei_dataset_id
        AND ST_Intersects(p1.loc, p2.loc)
    ORDER BY p1.id,
             ST_Area(ST_Intersection(p1.loc, p2.loc)) /
             NULLIF(ST_Area(p1.loc), 0) DESC;

    CREATE INDEX ON poly_pairs (ds1_id);
    CREATE INDEX ON poly_pairs (ds2_id);

    -- Step 3a: high overlap (>70%) → DS1 geometry, merge DS2-only props
    DROP TABLE IF EXISTS poly_high;
    CREATE TEMP TABLE poly_high ON COMMIT DROP AS
    SELECT
        pp.ds1_id AS id,
        pp.ds1_loc AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(pp.ds1_loc, 15)::json,
            'properties',
                jsonb_build_object('_id', pp.ds1_id) ||
                ((pp.ds1_feature::jsonb->'properties') - '_id') ||
                COALESCE(
                    (SELECT jsonb_object_agg(kv.key, kv.value)
                     FROM jsonb_each(
                         (pp.ds2_feature::jsonb->'properties') - '_id'
                     ) kv
                     WHERE NOT (pp.ds1_feature::jsonb->'properties') ? kv.key),
                    '{}'::jsonb
                )
        ) AS feature
    FROM poly_pairs pp
    WHERE pp.overlap_ratio > 0.7;

    CREATE INDEX ON poly_high (id);

    -- Step 3b: low overlap (intersecting but <=70%) → ST_Union geometry, DS1 props + DS2 new keys
    DROP TABLE IF EXISTS poly_low;
    CREATE TEMP TABLE poly_low ON COMMIT DROP AS
    SELECT
        pp.ds1_id AS id,
        ST_Union(pp.ds1_loc, pp.ds2_loc) AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Union(pp.ds1_loc, pp.ds2_loc), 15)::json,
            'properties',
                jsonb_build_object('_id', pp.ds1_id) ||
                ((pp.ds1_feature::jsonb->'properties') - '_id') ||
                COALESCE(
                    (SELECT jsonb_object_agg(kv.key, kv.value)
                     FROM jsonb_each(
                         (pp.ds2_feature::jsonb->'properties') - '_id'
                     ) kv
                     WHERE NOT (pp.ds1_feature::jsonb->'properties') ? kv.key),
                    '{}'::jsonb
                )
        ) AS feature
    FROM poly_pairs pp
    WHERE pp.overlap_ratio <= 0.7;

    CREATE INDEX ON poly_low (id);

    -- Step 3c: unmatched polygons (no cross-dataset intersection) → keep as-is
    DROP TABLE IF EXISTS poly_unmatched;
    CREATE TEMP TABLE poly_unmatched ON COMMIT DROP AS
    SELECT
        p.id,
        p.loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.loc, 15)::json,
            'properties',
                jsonb_build_object('_id', p.id) ||
                ((p.feature::jsonb->'properties') - '_id')
        ) AS feature
    FROM poly_valid p
    WHERE NOT EXISTS (
        SELECT 1 FROM poly_pairs pp
        WHERE (p.source = src_one_tdei_dataset_id AND pp.ds1_id = p.id)
           OR (p.source = src_two_tdei_dataset_id AND pp.ds2_id = p.id)
    );

    CREATE INDEX ON poly_unmatched (id);

    -- Step 4: final output polygons
    DROP TABLE IF EXISTS new_export_polygons;
    CREATE TEMP TABLE new_export_polygons ON COMMIT DROP AS
    SELECT id, loc::geometry, feature FROM poly_high
    UNION ALL
    SELECT id, loc::geometry, feature FROM poly_low
    UNION ALL
    SELECT id, loc,           feature FROM poly_unmatched;

    CREATE INDEX ON new_export_polygons (id);

    RAISE NOTICE 'Phase 7: polygons — high_overlap=%, merged=%, unmatched=%',
        (SELECT COUNT(*) FROM poly_high),
        (SELECT COUNT(*) FROM poly_low),
        (SELECT COUNT(*) FROM poly_unmatched);

    RAISE NOTICE 'Phase 7 complete at %', clock_timestamp();

    -- =========================================================================
    -- PHASE 8: Mixed-type property normalisation + export cursors
    --
    -- ext:* properties must have consistent JSONB types across all rows.
    -- If a key appears as both string and non-string, cast all values to TEXT.
    -- Then open one ref cursor per entity type.
    -- =========================================================================

    -- ── Nodes ─────────────────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Nodes at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO node_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_nodes e,
             jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    IF node_mixed_type_keys IS NOT NULL THEN
        UPDATE new_export_nodes
        SET feature = jsonb_set(feature, '{properties}',
            (SELECT jsonb_object_agg(key,
                CASE WHEN node_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                     THEN to_jsonb(value::TEXT) ELSE value END)
             FROM jsonb_each(feature::jsonb->'properties')))
        WHERE EXISTS (
            SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');
    END IF;

    fname := 'node'; result_cursor := 'node_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_nodes WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    -- ── Edges ─────────────────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Edges at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO edge_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_edges e,
             jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    IF edge_mixed_type_keys IS NOT NULL THEN
        UPDATE new_export_edges
        SET feature = jsonb_set(feature, '{properties}',
            (SELECT jsonb_object_agg(key,
                CASE WHEN edge_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                     THEN to_jsonb(value::TEXT) ELSE value END)
             FROM jsonb_each(feature::jsonb->'properties')))
        WHERE EXISTS (
            SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');
    END IF;

    fname := 'edge'; result_cursor := 'edge_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_edges WHERE feature IS NOT NULL ORDER BY seq_id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    -- ── Zones ─────────────────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Zones at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO zone_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_zones e
        LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb))
            AS prop(key, value) ON TRUE
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

    UPDATE new_export_zones
    SET feature = jsonb_set(feature::jsonb, '{properties}',
        (SELECT jsonb_object_agg(key,
            CASE WHEN zone_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::TEXT) ELSE value END)
         FROM jsonb_each(feature::jsonb->'properties')))
    WHERE feature::jsonb ? 'properties'
      AND EXISTS (SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');

    fname := 'zone'; result_cursor := 'zone_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_zones WHERE feature IS NOT NULL ORDER BY id ASC;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    -- ── Extension Points ──────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Extension Points at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO point_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_points e,
             jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    IF point_mixed_type_keys IS NOT NULL THEN
        UPDATE new_export_points
        SET feature = jsonb_set(feature, '{properties}',
            (SELECT jsonb_object_agg(key,
                CASE WHEN point_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                     THEN to_jsonb(value::TEXT) ELSE value END)
             FROM jsonb_each(feature::jsonb->'properties')))
        WHERE EXISTS (
            SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');
    END IF;

    fname := 'point'; result_cursor := 'point_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_points WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    -- ── Extension Lines ───────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Extension Lines at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO line_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_lines e,
             jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb)) prop
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) sub;

    IF line_mixed_type_keys IS NOT NULL THEN
        UPDATE new_export_lines
        SET feature = jsonb_set(feature, '{properties}',
            (SELECT jsonb_object_agg(key,
                CASE WHEN line_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                     THEN to_jsonb(value::TEXT) ELSE value END)
             FROM jsonb_each(feature::jsonb->'properties')))
        WHERE EXISTS (
            SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');
    END IF;

    fname := 'line'; result_cursor := 'line_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_lines WHERE feature IS NOT NULL ORDER BY seq_id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    -- ── Extension Polygons ────────────────────────────────────────────────────
    RAISE NOTICE 'Phase 8: Export Extension Polygons at %', clock_timestamp();

    SELECT jsonb_object_agg(key, TRUE) INTO polygon_mixed_type_keys
    FROM (
        SELECT DISTINCT key
        FROM new_export_polygons e
        LEFT JOIN LATERAL jsonb_each(COALESCE(e.feature::jsonb->'properties', '{}'::jsonb))
            AS prop(key, value) ON TRUE
        WHERE key LIKE 'ext:%'
        GROUP BY key
        HAVING COUNT(DISTINCT jsonb_typeof(value)) > 1
    ) subquery;

    UPDATE new_export_polygons
    SET feature = jsonb_set(feature::jsonb, '{properties}',
        (SELECT jsonb_object_agg(key,
            CASE WHEN polygon_mixed_type_keys ? key AND jsonb_typeof(value) != 'string'
                 THEN to_jsonb(value::TEXT) ELSE value END)
         FROM jsonb_each(feature::jsonb->'properties')))
    WHERE feature::jsonb ? 'properties'
      AND EXISTS (SELECT 1 FROM jsonb_each(feature::jsonb->'properties') WHERE key LIKE 'ext:%');

    fname := 'polygon'; result_cursor := 'polygon_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_polygons WHERE feature IS NOT NULL ORDER BY id ASC;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    RETURN;
END;
$BODY$;

ALTER FUNCTION content.tdei_union_dataset(CHARACTER VARYING, CHARACTER VARYING, REAL)
    OWNER TO tdeiadmin;