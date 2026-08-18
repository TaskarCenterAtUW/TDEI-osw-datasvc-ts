-- =============================================================================
-- content.tdei_self_merge_dataset
-- Version: v0.1
--
-- SCOPE (first cut):
--   S1 only — collapse the nodes referenced as an edge's start/end (_u_id/_v_id)
--   when two DISTINCT-edge endpoints fall within `proximity`. Plus union-style
--   self-dedup of zones, points, lines and polygons WITHIN the single dataset.
--
--   Deferred: S2 (endpoint↔interior / T-junction) and S3 (interior↔interior /
--   geometric crossings). No interior-vertex noding in this cut.
--
-- WITNESS SELECTION:
--   Nodes  : barrier=kerb wins; else lowest node_id (numeric-aware sort_key).
--   Z/P/L/G: lowest element_id. Witness keeps geometry; absorbed feature's
--            unique (non-conflicting) properties are folded in, no override.
--
-- KEY DECISIONS:
--   1. Same-edge endpoint pairs excluded (an edge's own _u/_v never collapse).
--   2. Coincident duplicates (dist 0) collapse; degenerate edges dropped.
--   3. Kerb priority = barrier=kerb only; conflicting kerb=* → lower-id wins,
--      loser recorded in audit only.
--   4. Extension witness = lowest element_id (union's DS1-authoritative merge).
--   5. Overlap thresholds carried from the union: zones/polygons area ≥70%,
--      lines buffer ≥70%, points identical standard tags within proximity.
--
-- POINT MATCHING (deliberate divergence from union_v5.1):
--   Two points merge only when their standard tags are IDENTICAL (match_key
--   equality), excluding '_*' (identity) and 'ext:*' (non-identifying by
--   project rule). No type vocabulary is enumerated anywhere, so nothing goes
--   stale when the OSW schema grows.
--
--   In OSW v0.3 a point carries exactly ONE standard key=value (amenity=bench,
--   power=pole, …) and all remaining detail as ext:* tags. So match_key
--   resolves to that single identifying pair — the type test, derived rather
--   than enumerated. Detail lives in ext:*, is excluded from the match, and
--   never blocks a merge; the absorbed point's ext:* keys fold into the witness.
--     {amenity=bench, ext:backrest=yes} + {amenity=bench, ext:material=wood}
--       → both match_key {amenity: bench} → merge; both ext:* keys retained.
--     {amenity=bench} + {amenity=drinking_fountain}  → no match → both kept.
--
-- OPEN: lines/polygons still dedup on GEOMETRY OVERLAP ONLY (union parity) —
--   no tag check, so barrier=fence and barrier=wall at 70% overlap will merge.
--   The points match_key rule drops straight in if wanted.
-- =============================================================================

CREATE OR REPLACE FUNCTION content.tdei_self_merge_dataset(
    src_tdei_dataset_id  CHARACTER VARYING,
    proximity            REAL DEFAULT 0.5
)
RETURNS TABLE(file_name TEXT, cursor_ref REFCURSOR)
LANGUAGE plpgsql
COST 100
VOLATILE PARALLEL UNSAFE
ROWS 1000
AS $BODY$
DECLARE
    result_cursor      REFCURSOR;
    fname              TEXT;
    proximity_degrees  REAL;
    -- snap_tolerance is used ONLY for node-on-EDGE-LINE containment (type-group
    -- tagging in Phase 1b), where a node may sit on an edge's INTERIOR and its
    -- coordinate legitimately won't equal any stored vertex. It is NOT used for
    -- vertex↔node identity: edge/zone vertices bind to nodes by EXACT coordinate
    -- equality (geom_key), no tolerance, no snapping — per the source-of-truth
    -- rule that emitted vertex lat/lon must exactly match the node's.
    snap_tolerance     FLOAT8 := 1e-8;
    sm_label           TEXT;
    v_round            INT := 0;
    v_committed        BIGINT;
BEGIN
    -- 1° latitude ≈ 111,111 m
    proximity_degrees := proximity / 111111.0;
    sm_label          := src_tdei_dataset_id || '(self)';

    -- =========================================================================
    -- PHASE 1: Load the single dataset
    --   sort_key: numeric-aware id ordering, computed ONCE here so no later
    --   step pays a regex + LPAD per row comparison.
    -- =========================================================================
    RAISE NOTICE 'Phase 1: Loading % at %', src_tdei_dataset_id, clock_timestamp();

    DROP TABLE IF EXISTS self_nodes;
    CREATE TEMP TABLE self_nodes ON COMMIT DROP AS
    SELECT n.id::TEXT AS element_id,
           n.node_loc  AS geom,
           n.feature,
           -- COALESCE is required: a node with NO 'barrier' key yields
           -- NULL = 'kerb' → NULL, not false. NULL then poisons the witness
           -- reason downstream ((nbr_kerb AND NOT node_kerb) → true AND NULL
           -- → NULL → labelled 'min_node_id'), even though kerb priority
           -- correctly won the election.
           COALESCE((n.feature::jsonb->'properties'->>'barrier') = 'kerb', FALSE) AS is_kerb,
           -- kerb=* value (raised/lowered/flush/…), NULL when absent. Carried
           -- for provenance/inspection only — it does NOT affect matching. The
           -- kerb rule is value-independent: ANY two barrier=kerb nodes within
           -- proximity are kept separate (see the kerb exception in Phase 3).
           (n.feature::jsonb->'properties'->>'kerb') AS kerb_value,
           CASE WHEN n.id::TEXT ~ '^[0-9]+$'
                THEN LPAD(n.id::TEXT, 20, '0') ELSE n.id::TEXT END AS sort_key,
           -- Exact coordinate key for EQUALITY association (no tolerance, no
           -- snapping). ST_AsBinary is the full-precision byte image of the
           -- coordinate, so an edge/zone vertex binds to a node ONLY when their
           -- lat/lon are byte-identical — the source-of-truth rule. Btree
           -- equality on this is faster than ST_Equals and needs no GIST.
           ST_AsBinary(n.node_loc) AS geom_key
    FROM content.node n
    WHERE n.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON self_nodes (element_id);
    CREATE INDEX ON self_nodes USING GIST (geom);
    CREATE INDEX ON self_nodes (geom_key);
    ANALYZE self_nodes;

    DROP TABLE IF EXISTS self_edges;
    CREATE TEMP TABLE self_edges ON COMMIT DROP AS
    SELECT e.id::TEXT AS element_id,
           e.edge_loc  AS geom,
           e.feature,
           ST_StartPoint(e.edge_loc) AS start_pt,   -- computed once, not per join
           ST_EndPoint(e.edge_loc)   AS end_pt,
           ST_AsBinary(ST_StartPoint(e.edge_loc)) AS start_key,  -- exact-equality keys
           ST_AsBinary(ST_EndPoint(e.edge_loc))   AS end_key
    FROM content.edge e
    WHERE e.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON self_edges (element_id);
    CREATE INDEX ON self_edges USING GIST (geom);
    CREATE INDEX ON self_edges USING GIST (start_pt);
    CREATE INDEX ON self_edges USING GIST (end_pt);
    ANALYZE self_edges;

    DROP TABLE IF EXISTS self_zones;
    CREATE TEMP TABLE self_zones ON COMMIT DROP AS
    SELECT z.id::TEXT AS element_id,
           z.zone_loc  AS geom,
           z.feature,
           CASE WHEN z.id::TEXT ~ '^[0-9]+$'
                THEN LPAD(z.id::TEXT, 20, '0') ELSE z.id::TEXT END AS sort_key
    FROM content.zone z
    WHERE z.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON self_zones (element_id);
    CREATE INDEX ON self_zones USING GIST (geom);

    DROP TABLE IF EXISTS self_zonepoints;
    CREATE TEMP TABLE self_zonepoints ON COMMIT DROP AS
    SELECT z.element_id,
           p.path[1] AS element_sub_id,
           p.path[2] AS element_sub_sub_id,
           p.geom,
           ST_AsBinary(p.geom) AS geom_key
    FROM self_zones z, LATERAL ST_DumpPoints(z.geom) p;
    CREATE INDEX ON self_zonepoints (element_id);
    CREATE INDEX ON self_zonepoints (geom_key);
    CREATE INDEX ON self_zonepoints USING GIST (geom);
    ANALYZE self_zonepoints;

    DROP TABLE IF EXISTS ext_points;
    CREATE TEMP TABLE ext_points ON COMMIT DROP AS
    SELECT n.id::TEXT AS element_id,
           n.point_loc AS geom,
           n.feature,
           CASE WHEN n.id::TEXT ~ '^[0-9]+$'
                THEN LPAD(n.id::TEXT, 20, '0') ELSE n.id::TEXT END AS sort_key,
           -- match_key: the point's standard tags, verbatim. Two points merge
           -- only when these are EQUAL — no type vocabulary, no enumeration.
           --   • '_*'   excluded — identity, not description.
           --   • 'ext:*' excluded — non-identifying by project rule, so they
           --     never block a match; absorbed ext:* keys fold into the witness.
           -- OSW points carry exactly one standard key=value, so this resolves
           -- to that single pair (e.g. {"amenity":"bench"}). Written generically
           -- so a second standard key would still work correctly.
           COALESCE((
               SELECT jsonb_object_agg(kv.key, kv.value)
               FROM jsonb_each(n.feature::jsonb->'properties') kv
               WHERE kv.key NOT LIKE '\_%'
                 AND kv.key NOT LIKE 'ext:%'
           ), '{}'::jsonb) AS match_key
    FROM content.extension_point n
    WHERE n.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON ext_points (element_id);
    CREATE INDEX ON ext_points (match_key);
    CREATE INDEX ON ext_points USING GIST (geom);
    ANALYZE ext_points;

    DROP TABLE IF EXISTS ext_lines;
    CREATE TEMP TABLE ext_lines ON COMMIT DROP AS
    SELECT e.id::TEXT AS element_id, e.line_loc AS geom, e.feature,
           ST_Length(e.line_loc) AS len,                 -- computed once
           CASE WHEN e.id::TEXT ~ '^[0-9]+$'
                THEN LPAD(e.id::TEXT, 20, '0') ELSE e.id::TEXT END AS sort_key
    FROM content.extension_line e
    WHERE e.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON ext_lines (element_id);
    CREATE INDEX ON ext_lines USING GIST (geom);
    ANALYZE ext_lines;

    DROP TABLE IF EXISTS ext_polygons;
    CREATE TEMP TABLE ext_polygons ON COMMIT DROP AS
    SELECT z.id::TEXT AS element_id, z.polygon_loc AS geom, z.feature,
           ST_Area(z.polygon_loc) AS area,               -- computed once
           CASE WHEN z.id::TEXT ~ '^[0-9]+$'
                THEN LPAD(z.id::TEXT, 20, '0') ELSE z.id::TEXT END AS sort_key
    FROM content.extension_polygon z
    WHERE z.tdei_dataset_id = src_tdei_dataset_id;
    CREATE INDEX ON ext_polygons (element_id);
    CREATE INDEX ON ext_polygons USING GIST (geom);
    ANALYZE ext_polygons;

    RAISE NOTICE 'Phase 1 complete: nodes=%, edges=%, zones=%, points=%, lines=%, polygons=%',
        (SELECT COUNT(*) FROM self_nodes),  (SELECT COUNT(*) FROM self_edges),
        (SELECT COUNT(*) FROM self_zones),  (SELECT COUNT(*) FROM ext_points),
        (SELECT COUNT(*) FROM ext_lines),   (SELECT COUNT(*) FROM ext_polygons);

    -- =========================================================================
    -- PHASE 1b: Edge type-group classification + node group sets
    --   Type read ONLY from standard OSW identifying fields (highway/footway).
    --   A node carries the SET of type groups of every edge it lies ON
    --   (endpoint OR interior) — ST_DWithin against full edge geometry.
    -- =========================================================================
    DROP TABLE IF EXISTS sm_edge_type_groups;
    CREATE TEMP TABLE sm_edge_type_groups ON COMMIT DROP AS
    SELECT element_id, geom,
        -- NOTE: CASE stops at the first match, so a value may appear in exactly
        -- ONE list. 'living_street' was previously in the 'pedestrian' list and
        -- has been removed from it — leaving it in both would make the 'bike'
        -- branch unreachable dead code.
        CASE
            WHEN (feature::jsonb->'properties'->>'highway') = 'footway'
             AND (feature::jsonb->'properties'->>'footway') IN ('crossing','traffic_island')
                THEN 'crossing'
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('living_street')
                THEN 'bike'
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('footway','pedestrian','steps')
                THEN 'pedestrian'
            WHEN (feature::jsonb->'properties'->>'highway')
                 IN ('primary','secondary','tertiary','residential',
                     'service','unclassified','trunk','motorway')
                THEN 'road'
            ELSE 'other'
        END AS type_group
    FROM self_edges;
    CREATE INDEX ON sm_edge_type_groups (element_id);
    CREATE INDEX ON sm_edge_type_groups USING GIST (geom);
    ANALYZE sm_edge_type_groups;

    -- Flat node×edge incidence, then aggregate. Two indexed steps instead of a
    -- per-node correlated aggregate.
    DROP TABLE IF EXISTS sm_node_edge_inc;
    CREATE TEMP TABLE sm_node_edge_inc ON COMMIT DROP AS
    SELECT n.element_id AS node_id, etg.type_group
    FROM self_nodes n
    JOIN sm_edge_type_groups etg
      ON ST_DWithin(n.geom, etg.geom, snap_tolerance);   -- GIST-indexed
    CREATE INDEX ON sm_node_edge_inc (node_id);
    ANALYZE sm_node_edge_inc;

    DROP TABLE IF EXISTS sm_node_groups;
    CREATE TEMP TABLE sm_node_groups ON COMMIT DROP AS
    SELECT node_id, ARRAY_AGG(DISTINCT type_group) AS groups
    FROM sm_node_edge_inc
    GROUP BY node_id;
    CREATE INDEX ON sm_node_groups (node_id);
    ANALYZE sm_node_groups;

    RAISE NOTICE 'Phase 1b complete: edge types + node groups classified';

    -- =========================================================================
    -- PHASE 2: Endpoint identification — EXACT coordinate equality, no tolerance.
    --   An edge endpoint binds to the node with the byte-identical lat/lon.
    --   Rule: edge vertex lat/lon must EXACTLY equal its node's — so the match
    --   is equality, not ST_DWithin. Clean data has exactly one such node; a
    --   btree join on the WKB key, no GIST distance scan, no ORDER BY distance.
    --   (DISTINCT ON kept only to stay single-valued if the source ever holds
    --   two coincident nodes; tie-break by sort_key is then deterministic.)
    -- =========================================================================
    DROP TABLE IF EXISTS sm_edge_u;
    CREATE TEMP TABLE sm_edge_u ON COMMIT DROP AS
    SELECT DISTINCT ON (e.element_id)
           e.element_id AS edge_id, n.element_id AS u_node_id
    FROM self_edges e
    JOIN self_nodes n ON n.geom_key = e.start_key       -- exact equality (btree)
    ORDER BY e.element_id, n.sort_key;
    CREATE INDEX ON sm_edge_u (edge_id);
    ANALYZE sm_edge_u;

    DROP TABLE IF EXISTS sm_edge_v;
    CREATE TEMP TABLE sm_edge_v ON COMMIT DROP AS
    SELECT DISTINCT ON (e.element_id)
           e.element_id AS edge_id, n.element_id AS v_node_id
    FROM self_edges e
    JOIN self_nodes n ON n.geom_key = e.end_key         -- exact equality (btree)
    ORDER BY e.element_id, n.sort_key;
    CREATE INDEX ON sm_edge_v (edge_id);
    ANALYZE sm_edge_v;

    DROP TABLE IF EXISTS sm_edge_ends;
    CREATE TEMP TABLE sm_edge_ends ON COMMIT DROP AS
    SELECT e.element_id AS edge_id, e.geom, e.feature,
           u.u_node_id, v.v_node_id
    FROM self_edges e
    LEFT JOIN sm_edge_u u ON u.edge_id = e.element_id
    LEFT JOIN sm_edge_v v ON v.edge_id = e.element_id;
    CREATE INDEX ON sm_edge_ends (edge_id);
    CREATE INDEX ON sm_edge_ends (u_node_id);
    CREATE INDEX ON sm_edge_ends (v_node_id);
    ANALYZE sm_edge_ends;

    -- The set of nodes that are an edge _u/_v, with kerb flag and type groups.
    DROP TABLE IF EXISTS sm_endpoint_ids;
    CREATE TEMP TABLE sm_endpoint_ids ON COMMIT DROP AS
    SELECT u_node_id AS node_id FROM sm_edge_ends WHERE u_node_id IS NOT NULL
    UNION
    SELECT v_node_id          FROM sm_edge_ends WHERE v_node_id IS NOT NULL;
    CREATE INDEX ON sm_endpoint_ids (node_id);

    DROP TABLE IF EXISTS sm_endpoint_nodes;
    CREATE TEMP TABLE sm_endpoint_nodes ON COMMIT DROP AS
    SELECT sn.element_id, sn.geom, sn.is_kerb, sn.kerb_value, sn.sort_key,
           -- rank_key: the witness priority, precomputed as ONE sortable string.
           -- '0'||sort_key for kerb, '1'||sort_key otherwise ⇒ LOWER rank_key
           -- wins, which is exactly "barrier=kerb first, then lowest node_id".
           (CASE WHEN sn.is_kerb THEN '0' ELSE '1' END) || sn.sort_key AS rank_key,
           COALESCE(g.groups, ARRAY[]::TEXT[]) AS groups
    FROM self_nodes sn
    JOIN sm_endpoint_ids ep ON ep.node_id = sn.element_id
    LEFT JOIN sm_node_groups g ON g.node_id = sn.element_id;
    CREATE INDEX ON sm_endpoint_nodes (element_id);
    CREATE INDEX ON sm_endpoint_nodes (rank_key);
    CREATE INDEX ON sm_endpoint_nodes USING GIST (geom);
    ANALYZE sm_endpoint_nodes;

    -- Same-edge pair keys (excluded from S1 so a short edge never self-collapses)
    DROP TABLE IF EXISTS sm_same_edge_pairs;
    CREATE TEMP TABLE sm_same_edge_pairs ON COMMIT DROP AS
    SELECT DISTINCT
        LEAST(u_node_id, v_node_id)    AS a,
        GREATEST(u_node_id, v_node_id) AS b
    FROM sm_edge_ends
    WHERE u_node_id IS NOT NULL AND v_node_id IS NOT NULL
      AND u_node_id <> v_node_id;
    CREATE INDEX ON sm_same_edge_pairs (a, b);
    ANALYZE sm_same_edge_pairs;

    -- =========================================================================
    -- PHASE 3 (S1): candidate pairs → STAR CLUSTERING → witness_map
    --
    -- Witness = kerb-priority, then lowest node_id (precomputed as rank_key).
    --
    -- WHY NOT PAIRWISE MATCHING:
    --   Pairwise consume-once produces a MATCHING (disjoint pairs), which
    --   commits at most floor(N/2) pairs and therefore always leaves ceil(N/2)
    --   survivors. A 4-endpoint junction can never go below 2 nodes, and those
    --   2 survivors are both consumed so they can never merge with each other —
    --   the junction stays split no matter how large `proximity` is. Observed
    --   in Albany: 4 endpoints → 2 witnesses ~1m apart at 5m proximity.
    --
    -- STAR (LEADER) CLUSTERING — what this does instead:
    --   A node is a LEADER if no still-available neighbour outranks it. Every
    --   non-leader with a leader neighbour attaches to its NEAREST leader.
    --   A leader may therefore absorb MANY nodes, so an N-way junction
    --   collapses to 1 node in a single round.
    --
    --   Leaders form an independent set (two adjacent nodes can't both be
    --   leaders — one outranks the other), so no leader is ever absorbed and
    --   a leader's whole neighbourhood resolves in one round.
    --
    -- BOUNDED — this is NOT the transitive clustering we rejected:
    --   Every absorbed node is within `proximity` of ITS LEADER, and the leader
    --   keeps its own coordinate and never moves. Max displacement is therefore
    --   exactly `proximity`, by construction. Transitive clustering follows
    --   chains (A~B~C at 0.4 each collapses points 0.8 apart); star clustering
    --   cannot chain, because a follower attaches only to a leader, and leaders
    --   are never adjacent to each other.
    --
    -- UNIQUE-EDGE GUARD (essential at large proximity):
    --   A leader absorbs AT MOST ONE ENDPOINT OF ANY GIVEN EDGE. Without this,
    --   a leader could swallow both ends of a short edge, collapsing it to zero
    --   length and destroying a real feature (at 5m proximity any edge under
    --   ~10m is at risk). The farther endpoint is released and stays free for a
    --   later round. Same-edge pairs are already excluded from candidacy, so an
    --   edge can never collapse directly onto its own other end.
    --
    --   Terminates: while the graph is non-empty its best-ranked node is always
    --   a leader, and leaders are removed each round.
    -- =========================================================================
    -- TYPE GUARD — full spec table, not just same-type.
    --   pedestrian↔pedestrian  YES   (same network)
    --   road↔road              YES   (real junction)
    --   crossing↔crossing      YES   (same network)
    --   road↔crossing          YES   (SANCTIONED cross-type — Rule-3 connection)
    --   crossing↔pedestrian    YES   (SANCTIONED — crossing joins the sidewalk net)
    --   road↔pedestrian        NO    (different networks; only via a crossing)
    --   other/untyped ↔ any    ALLOW (pre-type baseline)
    --
    -- NOTE: a bare `a.groups && b.groups` implements ONLY same-type. It silently
    -- blocks the two sanctioned cross-type pairs above — e.g. a footway=crossing
    -- endpoint would refuse to merge with an adjacent footway=sidewalk endpoint,
    -- leaving the network unrouted at exactly the junctions that matter most.
    -- Nodes carry SETS of groups, so compatibility = "∃ ga∈a, gb∈b that is an
    -- allowed combination", i.e. everything except road×pedestrian alone.
    DROP TABLE IF EXISTS sm_cand_pairs;
    CREATE TEMP TABLE sm_cand_pairs ON COMMIT DROP AS
    SELECT
        a.element_id AS a_id, b.element_id AS b_id,
        a.is_kerb    AS a_kerb, b.is_kerb  AS b_kerb,
        a.rank_key   AS a_rank, b.rank_key AS b_rank,
        ST_Distance(a.geom, b.geom) AS dist,
        CASE
            WHEN COALESCE(array_length(a.groups,1),0)=0
              OR COALESCE(array_length(b.groups,1),0)=0        THEN 0.5  -- untyped
            WHEN 'other' = ANY(a.groups) OR 'other' = ANY(b.groups) THEN 0.5
            WHEN a.groups && b.groups                          THEN 1.0  -- same network
            ELSE 0.75                                                    -- sanctioned cross-type
        END AS type_match
    FROM sm_endpoint_nodes a
    JOIN sm_endpoint_nodes b
        ON a.element_id < b.element_id                    -- canonical unordered pair
       AND ST_DWithin(a.geom, b.geom, proximity_degrees)  -- GIST-indexed
       -- KERB EXCEPTION (client rule): two barrier=kerb nodes within proximity
       -- are NEVER merged — full stop, regardless of their kerb=* values. Two
       -- kerbs ~2 m apart are valid ground truth (opposite sides of a crossing,
       -- a kerb and a ramp); collapsing them invents a junction that does not
       -- exist. Merging is for connecting the network, not for resolving two
       -- real kerbs into one through logic that can't be right on the ground.
       -- (A kerb vs a bare node is unaffected — only kerb-vs-kerb is excluded.)
       AND NOT (a.is_kerb AND b.is_kerb)
       AND (
             -- untyped / other → allow (pre-type baseline)
             COALESCE(array_length(a.groups,1),0)=0
          OR COALESCE(array_length(b.groups,1),0)=0
          OR 'other' = ANY(a.groups)
          OR 'other' = ANY(b.groups)
             -- same network
          OR a.groups && b.groups
             -- SANCTIONED cross-type: a crossing bridges road and pedestrian
          OR (a.groups && ARRAY['crossing']::TEXT[]
              AND b.groups && ARRAY['road','pedestrian']::TEXT[])
          OR (b.groups && ARRAY['crossing']::TEXT[]
              AND a.groups && ARRAY['road','pedestrian']::TEXT[])
             -- (road × pedestrian with no crossing involved falls through → blocked)
       )
    -- anti-join replaces NOT EXISTS: exclude an edge's own two endpoints
    LEFT JOIN sm_same_edge_pairs sep
        ON sep.a = a.element_id AND sep.b = b.element_id
    WHERE sep.a IS NULL;
    ANALYZE sm_cand_pairs;

    -- Adjacency over the candidate graph, both directions (so a node's whole
    -- neighbourhood is one indexed lookup on node_id).
    DROP TABLE IF EXISTS sm_adj;
    CREATE TEMP TABLE sm_adj ON COMMIT DROP AS
    SELECT a_id AS node_id, a_rank AS node_rank,
           b_id AS nbr_id,  b_rank AS nbr_rank, dist, type_match, b_kerb AS nbr_kerb, a_kerb AS node_kerb
    FROM sm_cand_pairs
    UNION ALL
    SELECT b_id, b_rank, a_id, a_rank, dist, type_match, a_kerb, b_kerb
    FROM sm_cand_pairs;
    CREATE INDEX ON sm_adj (node_id);
    CREATE INDEX ON sm_adj (nbr_id);
    ANALYZE sm_adj;

    RAISE NOTICE 'Phase 3: % candidate pairs at %',
        (SELECT COUNT(*) FROM sm_cand_pairs), clock_timestamp();

    -- Round tables (created once; TRUNCATEd per round)
    DROP TABLE IF EXISTS sm_leaders;
    CREATE TEMP TABLE sm_leaders (node_id TEXT PRIMARY KEY) ON COMMIT DROP;

    DROP TABLE IF EXISTS sm_attach;
    CREATE TEMP TABLE sm_attach (
        follower_id TEXT PRIMARY KEY,
        leader_id   TEXT,
        dist        FLOAT8,
        type_match  FLOAT8,
        by_kerb     BOOLEAN
    ) ON COMMIT DROP;

    DROP TABLE IF EXISTS sm_round_nodes;
    CREATE TEMP TABLE sm_round_nodes (node_id TEXT PRIMARY KEY) ON COMMIT DROP;

    DROP TABLE IF EXISTS witness_map;
    CREATE TEMP TABLE witness_map (
        absorbed_id TEXT PRIMARY KEY,
        witness_id  TEXT,
        dist        FLOAT8,
        type_match  FLOAT8,
        by_kerb     BOOLEAN
    ) ON COMMIT DROP;

    LOOP
        v_round := v_round + 1;

        -- LEADER ELECTION: a node still in the graph that no available
        -- neighbour outranks. rank_key already encodes kerb-priority then
        -- lowest node_id, so this is a single indexed aggregate.
        TRUNCATE sm_leaders;
        INSERT INTO sm_leaders (node_id)
        SELECT node_id
        FROM sm_adj
        GROUP BY node_id, node_rank
        HAVING MIN(nbr_rank) > node_rank;

        GET DIAGNOSTICS v_committed = ROW_COUNT;
        EXIT WHEN v_committed = 0;
        ANALYZE sm_leaders;

        -- ATTACH: every non-leader with a leader neighbour joins its NEAREST
        -- leader (tiebreak: better-ranked leader). Leaders are an independent
        -- set, so a leader is never itself a follower.
        TRUNCATE sm_attach;
        INSERT INTO sm_attach (follower_id, leader_id, dist, type_match, by_kerb)
        SELECT DISTINCT ON (a.node_id)
               a.node_id, a.nbr_id, a.dist, a.type_match,
               COALESCE(a.nbr_kerb, FALSE) AND NOT COALESCE(a.node_kerb, FALSE)
        FROM sm_adj a
        JOIN sm_leaders l       ON l.node_id  = a.nbr_id      -- neighbour is a leader
        LEFT JOIN sm_leaders ls ON ls.node_id = a.node_id     -- self is not
        WHERE ls.node_id IS NULL
        ORDER BY a.node_id, a.dist, a.nbr_rank;
        ANALYZE sm_attach;

        -- UNIQUE-EDGE GUARD: a leader may absorb at most ONE endpoint of any
        -- given edge. Absorbing both collapses that edge to zero length and
        -- destroys it. Keep the closer endpoint; release the farther one (it
        -- stays free and may attach to a different leader in a later round).
        --
        -- Driven off sm_same_edge_pairs, which is NORMALISED (a < b). Matching
        -- on ee.u_node_id/ee.v_node_id directly would only catch the case where
        -- the farther node happens to be the edge's u endpoint — the guard would
        -- silently miss the reversed orientation and let the edge vanish.
        DELETE FROM sm_attach f
        USING sm_same_edge_pairs sep, sm_attach fa, sm_attach fb
        WHERE fa.follower_id = sep.a
          AND fb.follower_id = sep.b
          AND fa.leader_id   = fb.leader_id          -- both ends → same leader
          AND f.follower_id  = CASE
                                 WHEN fa.dist > fb.dist
                                   OR (fa.dist = fb.dist
                                       AND fa.follower_id > fb.follower_id)
                                 THEN fa.follower_id
                                 ELSE fb.follower_id
                               END;                  -- release the farther

        INSERT INTO witness_map (absorbed_id, witness_id, dist, type_match, by_kerb)
        SELECT follower_id, leader_id, dist, type_match, by_kerb FROM sm_attach;

        -- Retire leaders and everything they absorbed
        TRUNCATE sm_round_nodes;
        INSERT INTO sm_round_nodes (node_id)
        SELECT node_id FROM sm_leaders
        UNION
        SELECT follower_id FROM sm_attach;
        ANALYZE sm_round_nodes;

        -- Two indexed DELETEs rather than one OR-ed predicate
        DELETE FROM sm_adj a USING sm_round_nodes c WHERE a.node_id = c.node_id;
        DELETE FROM sm_adj a USING sm_round_nodes c WHERE a.nbr_id  = c.node_id;
        ANALYZE sm_adj;

        RAISE NOTICE 'Phase 3: round % — % leaders, % absorbed (% adj rows remain)',
            v_round, v_committed,
            (SELECT COUNT(*) FROM sm_attach),
            (SELECT COUNT(*) FROM sm_adj);
    END LOOP;

    CREATE INDEX ON witness_map (witness_id);
    ANALYZE witness_map;

    RAISE NOTICE 'Phase 3 (S1) complete: % nodes absorbed into % witnesses in % rounds',
        (SELECT COUNT(*) FROM witness_map),
        (SELECT COUNT(DISTINCT witness_id) FROM witness_map), v_round;

    -- =========================================================================
    -- PHASE 3b: NO-VANISH SAFETY NET  (invariant: self-merge NEVER deletes an edge)
    --
    --   Self-merge exists to CONNECT gaps. Eliminating a real edge is always a
    --   defect, never an acceptable trade. An edge dies iff both of its
    --   endpoints resolve to the SAME witness.
    --
    --   The Phase 3 unique-edge guard prevents that within a round. This is a
    --   final backstop over the COMPLETED witness_map: it re-derives the
    --   resolved endpoints and reverts any absorption that would still kill an
    --   edge — catching every path, including a bug in the round guard.
    --
    --   Revert = drop that node's witness_map row, so the node stays itself and
    --   the edge survives with non-zero length. The FARTHER absorption is
    --   reverted, keeping the closer merge. Loops because one revert can expose
    --   another conflict; each pass deletes at least one witness_map row, so it
    --   terminates.
    -- =========================================================================
    v_round := 0;
    LOOP
        v_round := v_round + 1;

        -- Edges whose two ends resolve to the same witness. COALESCE covers the
        -- unabsorbed case, so this also catches "u absorbed into the node that
        -- IS v" — not just "both absorbed into a third node".
        DROP TABLE IF EXISTS sm_degen;
        CREATE TEMP TABLE sm_degen ON COMMIT DROP AS
        SELECT ee.edge_id, ee.u_node_id, ee.v_node_id,
               wu.dist AS u_dist, wv.dist AS v_dist
        FROM sm_edge_ends ee
        LEFT JOIN witness_map wu ON wu.absorbed_id = ee.u_node_id
        LEFT JOIN witness_map wv ON wv.absorbed_id = ee.v_node_id
        WHERE ee.u_node_id IS NOT NULL
          AND ee.v_node_id IS NOT NULL
          AND ee.u_node_id <> ee.v_node_id                  -- ignore source loops
          AND (wu.absorbed_id IS NOT NULL OR wv.absorbed_id IS NOT NULL)
          AND COALESCE(wu.witness_id, ee.u_node_id)
            = COALESCE(wv.witness_id, ee.v_node_id);

        GET DIAGNOSTICS v_committed = ROW_COUNT;
        EXIT WHEN v_committed = 0;

        DROP TABLE IF EXISTS sm_revert;
        CREATE TEMP TABLE sm_revert ON COMMIT DROP AS
        SELECT DISTINCT
            CASE
                WHEN u_dist IS NULL          THEN v_node_id   -- only v absorbed
                WHEN v_dist IS NULL          THEN u_node_id   -- only u absorbed
                WHEN u_dist > v_dist         THEN u_node_id   -- revert the farther
                WHEN v_dist > u_dist         THEN v_node_id
                WHEN u_node_id > v_node_id   THEN u_node_id   -- deterministic tiebreak
                ELSE v_node_id
            END AS absorbed_id
        FROM sm_degen;
        CREATE INDEX ON sm_revert (absorbed_id);

        DELETE FROM witness_map wm
        USING sm_revert r
        WHERE wm.absorbed_id = r.absorbed_id;

        RAISE WARNING 'Phase 3b: pass % — % edges would have been destroyed; reverted % absorptions to save them',
            v_round, v_committed, (SELECT COUNT(*) FROM sm_revert);
    END LOOP;

    ANALYZE witness_map;
    RAISE NOTICE 'Phase 3b complete: no-vanish invariant holds after % pass(es)', v_round;

    -- =========================================================================
    -- PHASE 4: Output nodes + edges
    -- =========================================================================
    -- Per-witness rollup. A witness may now absorb MANY nodes (star clustering),
    -- so aggregate rather than assume one. Confidence uses the FARTHEST absorbed
    -- node (worst case) and the weakest type_match — deliberately conservative.
    DROP TABLE IF EXISTS sm_witness_info;
    CREATE TEMP TABLE sm_witness_info ON COMMIT DROP AS
    SELECT wm.witness_id,
           string_agg(wm.absorbed_id, ',' ORDER BY wm.absorbed_id) AS absorbed_ids,
           COUNT(*)            AS absorbed_count,
           MAX(wm.dist)        AS max_dist,
           MIN(wm.type_match)  AS min_type_match,
           BOOL_OR(wm.by_kerb) AS by_kerb,
           ROUND((0.7 * GREATEST(0.0, LEAST(1.0, 1.0 - (MAX(wm.dist) / NULLIF(proximity_degrees,0))))
                + 0.3 * MIN(wm.type_match))::NUMERIC, 3) AS confidence
    FROM witness_map wm
    GROUP BY wm.witness_id;
    CREATE INDEX ON sm_witness_info (witness_id);
    ANALYZE sm_witness_info;

    -- Absorbed node properties, flattened → deduped per key → aggregated.
    -- (Indexed steps replace a nested per-row jsonb_object_agg subquery.)
    -- Dedup is required now that a witness can absorb several nodes: two
    -- absorbed nodes may carry the same key, and jsonb_object_agg would error
    -- on a duplicate. Nearest absorbed node wins.
    DROP TABLE IF EXISTS sm_node_absorbed_kv;
    CREATE TEMP TABLE sm_node_absorbed_kv ON COMMIT DROP AS
    SELECT wm.witness_id, wm.absorbed_id, wm.dist, kv.key, kv.value
    FROM witness_map wm
    JOIN self_nodes a ON a.element_id = wm.absorbed_id,
         LATERAL jsonb_each((a.feature::jsonb->'properties') - '_id') kv;
    CREATE INDEX ON sm_node_absorbed_kv (witness_id, key);
    ANALYZE sm_node_absorbed_kv;

    DROP TABLE IF EXISTS sm_node_kv_dedup;
    CREATE TEMP TABLE sm_node_kv_dedup ON COMMIT DROP AS
    SELECT DISTINCT ON (k.witness_id, k.key) k.witness_id, k.key, k.value
    FROM sm_node_absorbed_kv k
    JOIN self_nodes w ON w.element_id = k.witness_id
    WHERE NOT (w.feature::jsonb->'properties') ? k.key   -- witness authoritative
    ORDER BY k.witness_id, k.key, k.dist, k.absorbed_id; -- nearest absorbed wins
    ANALYZE sm_node_kv_dedup;

    DROP TABLE IF EXISTS sm_node_new_props;
    CREATE TEMP TABLE sm_node_new_props ON COMMIT DROP AS
    SELECT witness_id, jsonb_object_agg(key, value) AS new_props
    FROM sm_node_kv_dedup
    GROUP BY witness_id;
    CREATE INDEX ON sm_node_new_props (witness_id);
    ANALYZE sm_node_new_props;

    -- ── Nodes: drop absorbed; witnesses get merged props + provenance ─────────
    DROP TABLE IF EXISTS new_export_nodes;
    CREATE TEMP TABLE new_export_nodes ON COMMIT DROP AS
    SELECT
        sn.element_id AS id,
        sn.geom       AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(sn.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', sn.element_id) ||
                ((sn.feature::jsonb->'properties') - '_id') ||
                COALESCE(np.new_props, '{}'::jsonb) ||
                CASE WHEN wi.witness_id IS NOT NULL THEN
                    jsonb_build_object(
                        'ext:selfmerge_status',         'merged',
                        'ext:selfmerge_audit_absorbed', wi.absorbed_ids,
                        'ext:selfmerge_absorbed_count', wi.absorbed_count,
                        'ext:selfmerge_confidence',     wi.confidence,
                        'ext:selfmerge_witness_reason',
                            CASE WHEN wi.by_kerb THEN 'kerb' ELSE 'min_node_id' END,
                        'ext:selfmerge_source',         sm_label
                    )
                ELSE '{}'::jsonb END
        ) AS feature
    FROM self_nodes sn
    LEFT JOIN sm_witness_info  wi ON wi.witness_id = sn.element_id
    LEFT JOIN sm_node_new_props np ON np.witness_id = sn.element_id
    LEFT JOIN witness_map     drop_wm ON drop_wm.absorbed_id = sn.element_id
    WHERE drop_wm.absorbed_id IS NULL;                   -- anti-join: absorbed removed
    CREATE INDEX ON new_export_nodes (id);

    -- ── Edges: re-point _u_id/_v_id to witnesses, align vertices, drop degenerate
    DROP TABLE IF EXISTS sm_edges_resolved;
    CREATE TEMP TABLE sm_edges_resolved ON COMMIT DROP AS
    SELECT ee.edge_id, ee.geom, ee.feature,
           COALESCE(wmu.witness_id, ee.u_node_id) AS u_out,
           COALESCE(wmv.witness_id, ee.v_node_id) AS v_out
    FROM sm_edge_ends ee
    LEFT JOIN witness_map wmu ON wmu.absorbed_id = ee.u_node_id
    LEFT JOIN witness_map wmv ON wmv.absorbed_id = ee.v_node_id;
    CREATE INDEX ON sm_edges_resolved (edge_id);
    CREATE INDEX ON sm_edges_resolved (u_out);
    CREATE INDEX ON sm_edges_resolved (v_out);
    ANALYZE sm_edges_resolved;

    -- Degenerate check. After Phase 3b this can ONLY be a source edge that was
    -- already a loop (u = v in the input) — self-merge can no longer create one.
    -- Anything else here is a defect, so it is reported loudly, not swallowed.
    RAISE NOTICE 'Phase 4: % degenerate edges (source loops only; self-merge created 0)',
        (SELECT COUNT(*) FROM sm_edges_resolved WHERE u_out IS NOT DISTINCT FROM v_out);

    -- Align endpoints to the (possibly witness) node coordinates so emitted
    -- vertices are byte-identical to the nodes they reference.
    DROP TABLE IF EXISTS sm_edges_aligned;
    CREATE TEMP TABLE sm_edges_aligned ON COMMIT DROP AS
    SELECT
        er.edge_id AS sub_edge_id,
        er.u_out, er.v_out, er.feature,
        ST_SetPoint(
            ST_SetPoint(er.geom, 0, COALESCE(un.geom, ST_StartPoint(er.geom))),
            ST_NPoints(er.geom) - 1, COALESCE(vn.geom, ST_EndPoint(er.geom))
        ) AS loc
    FROM sm_edges_resolved er
    LEFT JOIN self_nodes un ON un.element_id = er.u_out
    LEFT JOIN self_nodes vn ON vn.element_id = er.v_out
    WHERE er.u_out IS DISTINCT FROM er.v_out;            -- drop degenerate
    CREATE INDEX ON sm_edges_aligned (sub_edge_id);
    ANALYZE sm_edges_aligned;

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
                    '_u_id', u_out,
                    '_v_id', v_out
                ) ||
                (COALESCE(feature::jsonb->'properties', '{}'::jsonb) - '_id' - '_u_id' - '_v_id')
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY sub_edge_id) AS seq_id
    FROM sm_edges_aligned
    WHERE ST_NPoints(loc) >= 2 AND ST_Length(loc) > 0;
    CREATE INDEX ON new_export_edges (seq_id);

    RAISE NOTICE 'Phase 4 complete: nodes=%, edges=% (input edges=% — must match unless source loops exist)',
        (SELECT COUNT(*) FROM new_export_nodes),
        (SELECT COUNT(*) FROM new_export_edges),
        (SELECT COUNT(*) FROM self_edges);

    -- =========================================================================
    -- PHASE 5a: Zones — ring node remap, then ≥70% area-overlap self-dedup
    -- =========================================================================
    -- Resolve each ring vertex to its source node by EXACT equality (no
    -- tolerance). A ring vertex that coincides with a node binds to it; one
    -- that doesn't (a shape vertex that was never a node) keeps its own
    -- coordinate verbatim downstream. No snapping either way.
    DROP TABLE IF EXISTS sm_zone_ring_nodes;
    CREATE TEMP TABLE sm_zone_ring_nodes ON COMMIT DROP AS
    SELECT DISTINCT ON (zp.element_id, zp.element_sub_id, zp.element_sub_sub_id)
           zp.element_id, zp.element_sub_id, zp.element_sub_sub_id,
           zp.geom AS src_geom, n.element_id AS src_node_id
    FROM self_zonepoints zp
    LEFT JOIN self_nodes n ON n.geom_key = zp.geom_key   -- exact equality (btree)
    ORDER BY zp.element_id, zp.element_sub_id, zp.element_sub_sub_id,
             n.sort_key NULLS LAST;
    CREATE INDEX ON sm_zone_ring_nodes (src_node_id);
    ANALYZE sm_zone_ring_nodes;

    -- Remap absorbed → witness (id AND coordinate)
    DROP TABLE IF EXISTS sm_zone_ring_resolved;
    CREATE TEMP TABLE sm_zone_ring_resolved ON COMMIT DROP AS
    SELECT r.element_id, r.element_sub_id, r.element_sub_sub_id,
           COALESCE(wm.witness_id, r.src_node_id)         AS out_node_id,
           COALESCE(wn.geom,       r.src_geom)            AS out_geom,
           LAG(COALESCE(wm.witness_id, r.src_node_id))
               OVER (PARTITION BY r.element_id
                     ORDER BY r.element_sub_id, r.element_sub_sub_id) AS prev_node_id
    FROM sm_zone_ring_nodes r
    LEFT JOIN witness_map wm ON wm.absorbed_id = r.src_node_id
    LEFT JOIN self_nodes  wn ON wn.element_id  = wm.witness_id;
    CREATE INDEX ON sm_zone_ring_resolved (element_id, element_sub_id);
    ANALYZE sm_zone_ring_resolved;

    -- Ring geometry per (zone, ring)
    DROP TABLE IF EXISTS sm_zone_rings;
    CREATE TEMP TABLE sm_zone_rings ON COMMIT DROP AS
    SELECT element_id, element_sub_id,
           ST_MakeLine(out_geom ORDER BY element_sub_sub_id) AS ring_geom
    FROM sm_zone_ring_resolved
    GROUP BY element_id, element_sub_id;
    CREATE INDEX ON sm_zone_rings (element_id);
    ANALYZE sm_zone_rings;

    -- _w_id list per zone, outer ring first, with the union's
    -- dedup_consecutive behaviour (adjacent duplicates removed — collapsing
    -- two adjacent ring nodes onto one witness would otherwise repeat an id).
    DROP TABLE IF EXISTS sm_zone_node_ids;
    CREATE TEMP TABLE sm_zone_node_ids ON COMMIT DROP AS
    SELECT element_id,
           ARRAY_AGG(out_node_id ORDER BY element_sub_id, element_sub_sub_id) AS node_ids
    FROM sm_zone_ring_resolved
    WHERE out_node_id IS NOT NULL
      AND prev_node_id IS DISTINCT FROM out_node_id
    GROUP BY element_id;
    CREATE INDEX ON sm_zone_node_ids (element_id);
    ANALYZE sm_zone_node_ids;

    DROP TABLE IF EXISTS sm_zone_outer_inners;
    CREATE TEMP TABLE sm_zone_outer_inners ON COMMIT DROP AS
    SELECT element_id,
           (ARRAY_AGG(ring_geom ORDER BY element_sub_id)
               FILTER (WHERE element_sub_id = 1))[1]  AS outer_ring,
           ARRAY_AGG(ring_geom ORDER BY element_sub_id)
               FILTER (WHERE element_sub_id > 1)      AS inner_rings
    FROM sm_zone_rings
    GROUP BY element_id;
    CREATE INDEX ON sm_zone_outer_inners (element_id);

    DROP TABLE IF EXISTS sm_zone_polygons;
    CREATE TEMP TABLE sm_zone_polygons ON COMMIT DROP AS
    SELECT
        oi.element_id,
        ni.node_ids,
        z.sort_key,
        CASE
            WHEN oi.inner_rings IS NOT NULL AND array_length(oi.inner_rings,1) > 0
                THEN ST_MakePolygon(oi.outer_ring, oi.inner_rings)
            ELSE ST_MakePolygon(oi.outer_ring)
        END AS newgeom
    FROM sm_zone_outer_inners oi
    JOIN self_zones z        ON z.element_id  = oi.element_id
    LEFT JOIN sm_zone_node_ids ni ON ni.element_id = oi.element_id
    WHERE oi.outer_ring IS NOT NULL
      AND ST_NPoints(oi.outer_ring) >= 4
      AND ST_IsClosed(oi.outer_ring)
      AND ST_IsValid(ST_MakeValid(oi.outer_ring));
    CREATE INDEX ON sm_zone_polygons (element_id);
    CREATE INDEX ON sm_zone_polygons USING GIST (newgeom);
    ANALYZE sm_zone_polygons;

    -- Area computed ONCE per zone, not per candidate pair
    DROP TABLE IF EXISTS sm_zone_areas;
    CREATE TEMP TABLE sm_zone_areas ON COMMIT DROP AS
    SELECT element_id, ST_Area(newgeom) AS area FROM sm_zone_polygons;
    CREATE INDEX ON sm_zone_areas (element_id);
    ANALYZE sm_zone_areas;

    DROP TABLE IF EXISTS sm_zone_pairs;
    CREATE TEMP TABLE sm_zone_pairs ON COMMIT DROP AS
    SELECT p.element_id AS zone_id, q.element_id AS cand_id, q.sort_key AS cand_sort
    FROM sm_zone_polygons p
    JOIN sm_zone_areas    pa ON pa.element_id = p.element_id
    JOIN sm_zone_polygons q  ON ST_Intersects(p.newgeom, q.newgeom)   -- GIST
    WHERE q.element_id = p.element_id
       OR ST_Area(ST_Intersection(p.newgeom, q.newgeom)) / NULLIF(pa.area,0) >= 0.70;
    CREATE INDEX ON sm_zone_pairs (zone_id);
    ANALYZE sm_zone_pairs;

    DROP TABLE IF EXISTS sm_zone_witness;
    CREATE TEMP TABLE sm_zone_witness ON COMMIT DROP AS
    SELECT DISTINCT ON (zone_id) zone_id, cand_id AS witness_id
    FROM sm_zone_pairs
    ORDER BY zone_id, cand_sort;
    CREATE INDEX ON sm_zone_witness (zone_id);
    CREATE INDEX ON sm_zone_witness (witness_id);
    ANALYZE sm_zone_witness;

    DROP TABLE IF EXISTS sm_zone_audit;
    CREATE TEMP TABLE sm_zone_audit ON COMMIT DROP AS
    SELECT witness_id, string_agg(zone_id, ',' ORDER BY zone_id) AS absorbed_ids
    FROM sm_zone_witness
    WHERE witness_id <> zone_id
    GROUP BY witness_id;
    CREATE INDEX ON sm_zone_audit (witness_id);

    DROP TABLE IF EXISTS new_export_zones;
    CREATE TEMP TABLE new_export_zones ON COMMIT DROP AS
    SELECT
        zp.element_id AS id,
        zp.newgeom    AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(zp.newgeom, 15)::json,
            'properties',
                jsonb_build_object('_id', zp.element_id) ||
                ((z.feature::jsonb->'properties') - '_w_id' - '_id') ||
                jsonb_build_object('_w_id', zp.node_ids) ||
                CASE WHEN za.witness_id IS NOT NULL THEN
                    jsonb_build_object(
                        'ext:selfmerge_status',         'merged',
                        'ext:selfmerge_audit_absorbed', za.absorbed_ids,
                        'ext:selfmerge_source',         sm_label)
                ELSE '{}'::jsonb END
        ) AS feature
    FROM sm_zone_polygons zp
    JOIN self_zones       z  ON z.element_id  = zp.element_id
    JOIN sm_zone_witness  sw ON sw.zone_id    = zp.element_id
    LEFT JOIN sm_zone_audit za ON za.witness_id = zp.element_id
    WHERE sw.witness_id = zp.element_id;                 -- keep only witnesses
    CREATE INDEX ON new_export_zones (id);

    -- =========================================================================
    -- PHASE 5b: Extension points — identical standard tags within proximity
    -- =========================================================================
    DROP TABLE IF EXISTS sm_pt_pairs;
    CREATE TEMP TABLE sm_pt_pairs ON COMMIT DROP AS
    SELECT p.element_id AS pt_id, q.element_id AS cand_id, q.sort_key AS cand_sort
    FROM ext_points p
    JOIN ext_points q
      ON ST_DWithin(p.geom, q.geom, proximity_degrees)   -- GIST
     AND q.match_key = p.match_key;                      -- type test, btree
    CREATE INDEX ON sm_pt_pairs (pt_id);
    ANALYZE sm_pt_pairs;

    DROP TABLE IF EXISTS sm_pt_witness;
    CREATE TEMP TABLE sm_pt_witness ON COMMIT DROP AS
    SELECT DISTINCT ON (pt_id) pt_id, cand_id AS witness_id
    FROM sm_pt_pairs
    ORDER BY pt_id, cand_sort;
    CREATE INDEX ON sm_pt_witness (pt_id);
    CREATE INDEX ON sm_pt_witness (witness_id);
    ANALYZE sm_pt_witness;

    DROP TABLE IF EXISTS sm_pt_absorbed;
    CREATE TEMP TABLE sm_pt_absorbed ON COMMIT DROP AS
    SELECT pt_id AS absorbed_id, witness_id
    FROM sm_pt_witness WHERE witness_id <> pt_id;
    CREATE INDEX ON sm_pt_absorbed (witness_id);
    CREATE INDEX ON sm_pt_absorbed (absorbed_id);
    ANALYZE sm_pt_absorbed;

    -- flatten → dedup per key → aggregate (indexed steps, no nested subquery)
    DROP TABLE IF EXISTS sm_pt_absorbed_kv;
    CREATE TEMP TABLE sm_pt_absorbed_kv ON COMMIT DROP AS
    SELECT a.witness_id, a.absorbed_id, kv.key, kv.value
    FROM sm_pt_absorbed a
    JOIN ext_points p ON p.element_id = a.absorbed_id,
         LATERAL jsonb_each((p.feature::jsonb->'properties') - '_id') kv;
    CREATE INDEX ON sm_pt_absorbed_kv (witness_id, key);
    ANALYZE sm_pt_absorbed_kv;

    DROP TABLE IF EXISTS sm_pt_kv_dedup;
    CREATE TEMP TABLE sm_pt_kv_dedup ON COMMIT DROP AS
    SELECT DISTINCT ON (k.witness_id, k.key) k.witness_id, k.key, k.value
    FROM sm_pt_absorbed_kv k
    JOIN ext_points w ON w.element_id = k.witness_id
    WHERE NOT (w.feature::jsonb->'properties') ? k.key   -- witness authoritative
    ORDER BY k.witness_id, k.key, k.absorbed_id;
    ANALYZE sm_pt_kv_dedup;

    DROP TABLE IF EXISTS sm_pt_new_props;
    CREATE TEMP TABLE sm_pt_new_props ON COMMIT DROP AS
    SELECT witness_id, jsonb_object_agg(key, value) AS new_props
    FROM sm_pt_kv_dedup GROUP BY witness_id;
    CREATE INDEX ON sm_pt_new_props (witness_id);

    DROP TABLE IF EXISTS sm_pt_audit;
    CREATE TEMP TABLE sm_pt_audit ON COMMIT DROP AS
    SELECT witness_id, string_agg(absorbed_id, ',' ORDER BY absorbed_id) AS absorbed_ids
    FROM sm_pt_absorbed GROUP BY witness_id;
    CREATE INDEX ON sm_pt_audit (witness_id);

    DROP TABLE IF EXISTS new_export_points;
    CREATE TEMP TABLE new_export_points ON COMMIT DROP AS
    SELECT
        p.element_id AS id, p.geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(p.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', p.element_id) ||
                ((p.feature::jsonb->'properties') - '_id') ||
                COALESCE(np.new_props, '{}'::jsonb) ||
                CASE WHEN au.witness_id IS NOT NULL THEN
                    jsonb_build_object(
                        'ext:selfmerge_status',         'merged',
                        'ext:selfmerge_audit_absorbed', au.absorbed_ids,
                        'ext:selfmerge_source',         sm_label)
                ELSE '{}'::jsonb END
        ) AS feature
    FROM ext_points p
    JOIN sm_pt_witness w      ON w.pt_id      = p.element_id
    LEFT JOIN sm_pt_new_props np ON np.witness_id = p.element_id
    LEFT JOIN sm_pt_audit     au ON au.witness_id = p.element_id
    WHERE w.witness_id = w.pt_id;                        -- keep only witnesses
    CREATE INDEX ON new_export_points (id);

    -- =========================================================================
    -- PHASE 5c: Extension lines — ≥70% buffer overlap
    --   Buffers pre-materialised ONCE and GIST-indexed. (Previously ST_Buffer
    --   was inside a correlated subquery → rebuilt per candidate pair.)
    -- =========================================================================
    DROP TABLE IF EXISTS sm_line_buffers;
    CREATE TEMP TABLE sm_line_buffers ON COMMIT DROP AS
    SELECT element_id, sort_key, ST_Buffer(geom, proximity_degrees) AS buf
    FROM ext_lines;
    CREATE INDEX ON sm_line_buffers USING GIST (buf);
    CREATE INDEX ON sm_line_buffers (element_id);
    ANALYZE sm_line_buffers;

    DROP TABLE IF EXISTS sm_ln_pairs;
    CREATE TEMP TABLE sm_ln_pairs ON COMMIT DROP AS
    SELECT l.element_id AS ln_id, b.element_id AS cand_id, b.sort_key AS cand_sort
    FROM ext_lines l
    JOIN sm_line_buffers b ON ST_DWithin(l.geom, b.buf, 0)            -- GIST on buf
    WHERE b.element_id = l.element_id
       OR ST_Length(ST_CollectionExtract(ST_Intersection(l.geom, b.buf), 2))
          / NULLIF(l.len, 0) >= 0.70;
    CREATE INDEX ON sm_ln_pairs (ln_id);
    ANALYZE sm_ln_pairs;

    DROP TABLE IF EXISTS sm_ln_witness;
    CREATE TEMP TABLE sm_ln_witness ON COMMIT DROP AS
    SELECT DISTINCT ON (ln_id) ln_id, cand_id AS witness_id
    FROM sm_ln_pairs ORDER BY ln_id, cand_sort;
    CREATE INDEX ON sm_ln_witness (ln_id);
    CREATE INDEX ON sm_ln_witness (witness_id);
    ANALYZE sm_ln_witness;

    DROP TABLE IF EXISTS sm_ln_absorbed;
    CREATE TEMP TABLE sm_ln_absorbed ON COMMIT DROP AS
    SELECT ln_id AS absorbed_id, witness_id FROM sm_ln_witness WHERE witness_id <> ln_id;
    CREATE INDEX ON sm_ln_absorbed (witness_id);
    ANALYZE sm_ln_absorbed;

    DROP TABLE IF EXISTS sm_ln_absorbed_kv;
    CREATE TEMP TABLE sm_ln_absorbed_kv ON COMMIT DROP AS
    SELECT a.witness_id, a.absorbed_id, kv.key, kv.value
    FROM sm_ln_absorbed a
    JOIN ext_lines l ON l.element_id = a.absorbed_id,
         LATERAL jsonb_each((l.feature::jsonb->'properties') - '_id') kv;
    CREATE INDEX ON sm_ln_absorbed_kv (witness_id, key);
    ANALYZE sm_ln_absorbed_kv;

    DROP TABLE IF EXISTS sm_ln_kv_dedup;
    CREATE TEMP TABLE sm_ln_kv_dedup ON COMMIT DROP AS
    SELECT DISTINCT ON (k.witness_id, k.key) k.witness_id, k.key, k.value
    FROM sm_ln_absorbed_kv k
    JOIN ext_lines w ON w.element_id = k.witness_id
    WHERE NOT (w.feature::jsonb->'properties') ? k.key
    ORDER BY k.witness_id, k.key, k.absorbed_id;

    DROP TABLE IF EXISTS sm_ln_new_props;
    CREATE TEMP TABLE sm_ln_new_props ON COMMIT DROP AS
    SELECT witness_id, jsonb_object_agg(key, value) AS new_props
    FROM sm_ln_kv_dedup GROUP BY witness_id;
    CREATE INDEX ON sm_ln_new_props (witness_id);

    DROP TABLE IF EXISTS sm_ln_audit;
    CREATE TEMP TABLE sm_ln_audit ON COMMIT DROP AS
    SELECT witness_id, string_agg(absorbed_id, ',' ORDER BY absorbed_id) AS absorbed_ids
    FROM sm_ln_absorbed GROUP BY witness_id;
    CREATE INDEX ON sm_ln_audit (witness_id);

    DROP TABLE IF EXISTS new_export_lines;
    CREATE TEMP TABLE new_export_lines ON COMMIT DROP AS
    SELECT
        l.element_id AS id, l.geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(l.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', l.element_id) ||
                ((l.feature::jsonb->'properties') - '_id') ||
                COALESCE(np.new_props, '{}'::jsonb) ||
                CASE WHEN au.witness_id IS NOT NULL THEN
                    jsonb_build_object(
                        'ext:selfmerge_status',         'merged',
                        'ext:selfmerge_audit_absorbed', au.absorbed_ids,
                        'ext:selfmerge_source',         sm_label)
                ELSE '{}'::jsonb END
        ) AS feature,
        ROW_NUMBER() OVER (ORDER BY l.element_id) AS seq_id
    FROM ext_lines l
    JOIN sm_ln_witness w      ON w.ln_id      = l.element_id
    LEFT JOIN sm_ln_new_props np ON np.witness_id = l.element_id
    LEFT JOIN sm_ln_audit     au ON au.witness_id = l.element_id
    WHERE w.witness_id = w.ln_id;
    CREATE INDEX ON new_export_lines (seq_id);

    -- =========================================================================
    -- PHASE 5d: Extension polygons — ≥70% area overlap
    -- =========================================================================
    DROP TABLE IF EXISTS sm_pg_pairs;
    CREATE TEMP TABLE sm_pg_pairs ON COMMIT DROP AS
    SELECT g.element_id AS pg_id, m.element_id AS cand_id, m.sort_key AS cand_sort
    FROM ext_polygons g
    JOIN ext_polygons m ON ST_Intersects(g.geom, m.geom)              -- GIST
    WHERE m.element_id = g.element_id
       OR ST_Area(ST_Intersection(g.geom, m.geom)) / NULLIF(g.area, 0) >= 0.70;
    CREATE INDEX ON sm_pg_pairs (pg_id);
    ANALYZE sm_pg_pairs;

    DROP TABLE IF EXISTS sm_pg_witness;
    CREATE TEMP TABLE sm_pg_witness ON COMMIT DROP AS
    SELECT DISTINCT ON (pg_id) pg_id, cand_id AS witness_id
    FROM sm_pg_pairs ORDER BY pg_id, cand_sort;
    CREATE INDEX ON sm_pg_witness (pg_id);
    CREATE INDEX ON sm_pg_witness (witness_id);
    ANALYZE sm_pg_witness;

    DROP TABLE IF EXISTS sm_pg_absorbed;
    CREATE TEMP TABLE sm_pg_absorbed ON COMMIT DROP AS
    SELECT pg_id AS absorbed_id, witness_id FROM sm_pg_witness WHERE witness_id <> pg_id;
    CREATE INDEX ON sm_pg_absorbed (witness_id);
    ANALYZE sm_pg_absorbed;

    DROP TABLE IF EXISTS sm_pg_absorbed_kv;
    CREATE TEMP TABLE sm_pg_absorbed_kv ON COMMIT DROP AS
    SELECT a.witness_id, a.absorbed_id, kv.key, kv.value
    FROM sm_pg_absorbed a
    JOIN ext_polygons g ON g.element_id = a.absorbed_id,
         LATERAL jsonb_each((g.feature::jsonb->'properties') - '_id') kv;
    CREATE INDEX ON sm_pg_absorbed_kv (witness_id, key);
    ANALYZE sm_pg_absorbed_kv;

    DROP TABLE IF EXISTS sm_pg_kv_dedup;
    CREATE TEMP TABLE sm_pg_kv_dedup ON COMMIT DROP AS
    SELECT DISTINCT ON (k.witness_id, k.key) k.witness_id, k.key, k.value
    FROM sm_pg_absorbed_kv k
    JOIN ext_polygons w ON w.element_id = k.witness_id
    WHERE NOT (w.feature::jsonb->'properties') ? k.key
    ORDER BY k.witness_id, k.key, k.absorbed_id;

    DROP TABLE IF EXISTS sm_pg_new_props;
    CREATE TEMP TABLE sm_pg_new_props ON COMMIT DROP AS
    SELECT witness_id, jsonb_object_agg(key, value) AS new_props
    FROM sm_pg_kv_dedup GROUP BY witness_id;
    CREATE INDEX ON sm_pg_new_props (witness_id);

    DROP TABLE IF EXISTS sm_pg_audit;
    CREATE TEMP TABLE sm_pg_audit ON COMMIT DROP AS
    SELECT witness_id, string_agg(absorbed_id, ',' ORDER BY absorbed_id) AS absorbed_ids
    FROM sm_pg_absorbed GROUP BY witness_id;
    CREATE INDEX ON sm_pg_audit (witness_id);

    DROP TABLE IF EXISTS new_export_polygons;
    CREATE TEMP TABLE new_export_polygons ON COMMIT DROP AS
    SELECT
        g.element_id AS id, g.geom AS loc,
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(g.geom, 15)::json,
            'properties',
                jsonb_build_object('_id', g.element_id) ||
                ((g.feature::jsonb->'properties') - '_id') ||
                COALESCE(np.new_props, '{}'::jsonb) ||
                CASE WHEN au.witness_id IS NOT NULL THEN
                    jsonb_build_object(
                        'ext:selfmerge_status',         'merged',
                        'ext:selfmerge_audit_absorbed', au.absorbed_ids,
                        'ext:selfmerge_source',         sm_label)
                ELSE '{}'::jsonb END
        ) AS feature
    FROM ext_polygons g
    JOIN sm_pg_witness w      ON w.pg_id      = g.element_id
    LEFT JOIN sm_pg_new_props np ON np.witness_id = g.element_id
    LEFT JOIN sm_pg_audit     au ON au.witness_id = g.element_id
    WHERE w.witness_id = w.pg_id;
    CREATE INDEX ON new_export_polygons (id);

    RAISE NOTICE 'Phase 5 complete: zones=%, points=%, lines=%, polygons=%',
        (SELECT COUNT(*) FROM new_export_zones),  (SELECT COUNT(*) FROM new_export_points),
        (SELECT COUNT(*) FROM new_export_lines),  (SELECT COUNT(*) FROM new_export_polygons);

    -- =========================================================================
    -- PHASE 6: Export cursors  (node, edge, zone, point, line, polygon)
    -- =========================================================================
    fname := 'node'; result_cursor := 'node_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_nodes WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    fname := 'edge'; result_cursor := 'edge_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_edges WHERE feature IS NOT NULL ORDER BY seq_id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    fname := 'zone'; result_cursor := 'zone_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_zones WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    fname := 'point'; result_cursor := 'point_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_points WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    fname := 'line'; result_cursor := 'line_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_lines WHERE feature IS NOT NULL ORDER BY seq_id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    fname := 'polygon'; result_cursor := 'polygon_cursor';
    OPEN result_cursor FOR
        SELECT feature FROM new_export_polygons WHERE feature IS NOT NULL ORDER BY id;
    file_name := fname; cursor_ref := result_cursor; RETURN NEXT;

    RETURN;
END;
$BODY$;

ALTER FUNCTION content.tdei_self_merge_dataset(CHARACTER VARYING, REAL)
    OWNER TO tdeiadmin;