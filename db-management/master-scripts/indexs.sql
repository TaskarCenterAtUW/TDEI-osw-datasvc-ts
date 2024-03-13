CREATE INDEX idx_line_location
    ON content.extension_line USING gist
    (line_loc);

CREATE INDEX idx_polygon_location
    ON content.extension_polygon USING gist
    (polygon_loc);

CREATE INDEX idx_point_location
    ON content.extension_point USING gist
    (point_loc);

CREATE INDEX idx_nodes_location
    ON content.node USING gist
    (node_loc);

CREATE INDEX idx_edge_location
    ON content.edge USING gist
    (edge_loc);

