-- FUNCTION: content.tdei_update_osw_stats(character varying)
-- DROP FUNCTION IF EXISTS content.tdei_update_osw_stats(character varying);

CREATE OR REPLACE FUNCTION content.tdei_update_osw_stats(
    p_tdei_dataset_id character varying)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
    -- Fallback only: parts of the network further apart than this (ground metres)
    -- get their own hull. Set very large (e.g. 1e9) for a single plain convex hull.
    c_cluster_gap_m CONSTANT double precision := 500;
    v_eps           double precision;   -- c_cluster_gap_m in EPSG:3857 units
    v_cell          double precision;   -- fallback cell size, EPSG:3857 units
    area_km2_val    double precision;
    v_area_source   text := 'none';
BEGIN
    ----------------------------------------------------------------------
    -- 1. Counts (unchanged)
    --    Cost is proportional to the dataset's own rows, provided both tables
    --    have an index leading with tdei_dataset_id (see note at the bottom).
    ----------------------------------------------------------------------
    WITH
    osw_dataset_edges_cte AS (
        SELECT
            count(*) AS num_edges,
            SUM(CASE WHEN footway = 'sidewalk' THEN 1 ELSE 0 END)      AS num_sidewalks,
            SUM(CASE WHEN footway = 'sidewalk' THEN length ELSE 0 END) AS length_of_sidewalks_mtr,
            SUM(CASE WHEN footway = 'crossing' THEN 1 ELSE 0 END)      AS num_crossings
        FROM content.edge
        WHERE tdei_dataset_id = p_tdei_dataset_id
    ),
    osw_dataset_nodes_cte AS (
        SELECT
            COUNT(*) AS num_nodes,
            SUM(CASE WHEN barrier = 'kerb' THEN 1 ELSE 0 END) AS num_kerbs
        FROM content.node
        WHERE tdei_dataset_id = p_tdei_dataset_id
    )
    INSERT INTO content.osw_stats (tdei_dataset_id, num_crossings, length_of_sidewalks_mtr, num_edges, num_nodes, num_kerbs)
    SELECT p_tdei_dataset_id, num_crossings, length_of_sidewalks_mtr, num_edges, num_nodes, num_kerbs
    FROM osw_dataset_edges_cte, osw_dataset_nodes_cte
    ON CONFLICT (tdei_dataset_id)
    DO UPDATE
    SET num_crossings           = EXCLUDED.num_crossings,
        length_of_sidewalks_mtr = EXCLUDED.length_of_sidewalks_mtr,
        num_edges               = EXCLUDED.num_edges,
        num_nodes               = EXCLUDED.num_nodes,
        num_kerbs               = EXCLUDED.num_kerbs;

    ----------------------------------------------------------------------
    -- 2. Jurisdiction area from the dataset boundary (every feature)
    --    One row, one small JSON, a handful of polygons: milliseconds.
    --    A malformed boundary must not break the stats run: fall back instead.
    ----------------------------------------------------------------------
    BEGIN
        SELECT ST_Area(ST_Union(parts.geom)::geography) / 1000000.0
        INTO area_km2_val
        FROM (
            SELECT ST_CollectionExtract(
                       ST_MakeValid(
                           ST_SetSRID(ST_GeomFromGeoJSON(f.value ->> 'geometry'), 4326)),
                       3) AS geom
            FROM content.dataset d
            CROSS JOIN LATERAL json_array_elements(
                CASE WHEN json_typeof(d.metadata_json -> 'dataset_area' -> 'features') = 'array'
                     THEN d.metadata_json -> 'dataset_area' -> 'features'
                END) AS f(value)
            WHERE d.tdei_dataset_id = p_tdei_dataset_id
              AND json_typeof(f.value -> 'geometry') = 'object'
        ) AS parts
        WHERE NOT ST_IsEmpty(parts.geom);
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'dataset_area for % could not be read (%); using edge-based fallback',
                     p_tdei_dataset_id, SQLERRM;
        area_km2_val := NULL;
    END;

    IF area_km2_val > 0 THEN
        v_area_source := 'dataset_area';
    ELSE
        area_km2_val := NULL;

        ------------------------------------------------------------------
        -- 3. Fallback: cell hulls -> clusters -> hull per cluster
        ------------------------------------------------------------------
        -- 3a. Gap tolerance in Web Mercator units (1 unit = cos(lat) ground metres).
        --     The latitude of any one edge is enough to scale a gap tolerance,
        --     so this is a single-row index lookup, not a scan. NULL if no edges.
        SELECT c_cluster_gap_m
               / cos(radians(ST_Y(ST_Transform(ST_StartPoint(edge_loc_3857), 4326))))
        INTO v_eps
        FROM content.edge
        WHERE tdei_dataset_id = p_tdei_dataset_id
        LIMIT 1;

        IF v_eps IS NOT NULL THEN
            -- Cells half the gap wide: each cell has only ~25 cells within v_eps,
            -- so clustering cost stays linear in the number of cells.
            v_cell := v_eps / 2;

            WITH
            cell_hulls AS (
                -- The only pass over the dataset's edges.
                -- Endpoints are grouped by cell; each cell keeps the convex hull of
                -- its endpoints (a point, line or small polygon).
                SELECT ST_ConvexHull(ST_Collect(v.p)) AS geom
                FROM content.edge e
                CROSS JOIN LATERAL (VALUES (ST_StartPoint(e.edge_loc_3857)),
                                           (ST_EndPoint(e.edge_loc_3857))) AS v(p)
                WHERE e.tdei_dataset_id = p_tdei_dataset_id
                GROUP BY floor(ST_X(v.p) / v_cell), floor(ST_Y(v.p) / v_cell)
            ),
            clustered AS (
                -- minpoints = 1: every cell belongs to a cluster (no "noise").
                -- PostGIS builds an in-memory spatial tree over these cells.
                SELECT geom,
                       ST_ClusterDBSCAN(geom, eps := v_eps, minpoints := 1) OVER () AS cid
                FROM cell_hulls
            ),
            hulls AS (
                SELECT ST_ConvexHull(ST_Collect(geom)) AS hull
                FROM clustered
                GROUP BY cid
            )
            SELECT COALESCE(
                       ST_Area(ST_Transform(ST_Union(hull), 4326)::geography) / 1000000.0,
                       0)
            INTO area_km2_val
            FROM hulls
            WHERE ST_Dimension(hull) = 2;   -- a cluster that is only a point or line has no area

            v_area_source := 'edge clusters';
        END IF;
    END IF;

    UPDATE content.osw_stats
    SET area_km2 = area_km2_val
    WHERE tdei_dataset_id = p_tdei_dataset_id;

    RAISE NOTICE 'OSW stats updated successfully for dataset id: % (area_km2 = %, source: %)',
                 p_tdei_dataset_id, area_km2_val, v_area_source;
END;
$BODY$;

ALTER FUNCTION content.tdei_update_osw_stats(character varying)
    OWNER TO tdeiadmin;