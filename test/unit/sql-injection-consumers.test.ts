import "reflect-metadata";
import { Utility } from "../../src/utility/utility";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { FeedbackRequestDto } from "../../src/model/feedback-dto";
import { SpatialJoinRequest, UnionRequest, SelfMergeRequest } from "../../src/model/request-interfaces";

/**
 * One block per Utility.checkForSqlInjection call site, exercising the exact
 * input shape that call site passes in.
 *
 * Call sites:
 *  - osw-controller.addFeedbackRequest          -> FeedbackRequestDto instance
 *  - osw-controller.processDatasetUnionRequest  -> request.body (union)
 *  - osw-controller.processDatasetSelfMergeRequest -> request.body (self merge)
 *  - osw-controller.processSpatialQueryRequest  -> request.body (spatial join)
 *  - osw-service.calculateTagQualityMetric      -> parsed tag file JSON
 */

const check = (input: any) => () => Utility.checkForSqlInjection(input);

const buildFeedback = (overrides: Partial<FeedbackRequestDto> = {}) =>
    FeedbackRequestDto.from({
        tdei_project_id: "0b12b2d6-3b7f-4e2f-9b0e-9f0e6f8b1a11",
        tdei_dataset_id: "52945d79-a0df-4440-8363-73bea8e1882a",
        dataset_element_id: "edge-123",
        feedback_text: "The curb ramp near 5th Ave is damaged",
        customer_email: "reporter@example.com",
        location_latitude: 47.6062,
        location_longitude: -122.3321,
        ...overrides,
    });

const buildSpatialJoinBody = (overrides: Record<string, any> = {}) => ({
    user_id: "6f0e2b7a-1c2d-4a3b-8f9e-0a1b2c3d4e5f",
    target_dataset_id: "52945d79-a0df-4440-8363-73bea8e1882a",
    target_dimension: "edge",
    source_dataset_id: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
    source_dimension: "node",
    join_condition: "ST_Contains(geometry_target, geometry_source)",
    join_filter_target: "",
    join_filter_source: "",
    aggregate: ["ARRAY_AGG(ext:unit_id) as SDOT_pole_unit_id"],
    assignment_method: "default",
    ...overrides,
});

describe("checkForSqlInjection consumers", () => {

    describe("addFeedbackRequest (FeedbackRequestDto instance)", () => {

        it("accepts a typical end user feedback report", () => {
            expect(check(buildFeedback())).not.toThrow();
        });

        it("accepts prose containing SQL reserved words", () => {
            expect(check(buildFeedback({
                feedback_text: "Please update the crossing and delete the duplicate node",
            }))).not.toThrow();
        });

        it("accepts a DTO where the optional element id is absent", () => {
            const feedback = buildFeedback();
            feedback.dataset_element_id = undefined;
            expect(check(feedback)).not.toThrow();
        });

        it("does not treat numeric coordinates as SQL", () => {
            expect(check(buildFeedback({
                location_latitude: -47.6062,
                location_longitude: -122.3321,
            }))).not.toThrow();
        });

        it("rejects a terminated statement with a trailing comment", () => {
            expect(check(buildFeedback({
                feedback_text: "x'; DROP TABLE content.feedback; --",
            }))).toThrow(InputException);
        });

        it("rejects a block comment used to smuggle SQL", () => {
            expect(check(buildFeedback({
                feedback_text: "broken /* UNION SELECT password FROM users */ ramp",
            }))).toThrow(InputException);
        });

        it("rejects injection attempts in the identifier fields", () => {
            expect(check(buildFeedback({
                tdei_dataset_id: "52945d79'; DELETE FROM content.dataset WHERE '1'='1",
            }))).toThrow(InputException);
        });
    });

    describe("processDatasetUnionRequest (request.body)", () => {

        it("accepts a valid union request body", () => {
            expect(check({
                user_id: "6f0e2b7a-1c2d-4a3b-8f9e-0a1b2c3d4e5f",
                tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
                tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
                proximity: 0.5,
            })).not.toThrow();
        });

        it("accepts the domain entity built from that body", () => {
            expect(check(UnionRequest.from({
                tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
                tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
                proximity: 0.5,
            }))).not.toThrow();
        });

        it("rejects a stacked statement in a dataset id", () => {
            expect(check({
                tdei_dataset_id_one: "abc'; TRUNCATE TABLE content.edge; --",
                tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
                proximity: 0.5,
            })).toThrow(InputException);
        });
    });

    describe("processDatasetSelfMergeRequest (request.body)", () => {

        it("accepts a valid self merge request body", () => {
            expect(check({
                user_id: "6f0e2b7a-1c2d-4a3b-8f9e-0a1b2c3d4e5f",
                tdei_dataset_id: "52945d79-a0df-4440-8363-73bea8e1882a",
                proximity: 0.5,
            })).not.toThrow();
        });

        it("accepts the domain entity built from that body", () => {
            expect(check(SelfMergeRequest.from({
                tdei_dataset_id: "52945d79-a0df-4440-8363-73bea8e1882a",
                proximity: 0.5,
            }))).not.toThrow();
        });

        it("rejects a commented out fragment in the dataset id", () => {
            expect(check({
                tdei_dataset_id: "52945d79 -- ",
                proximity: 0.5,
            })).toThrow(InputException);
        });
    });

    describe("processSpatialQueryRequest (request.body)", () => {

        it("accepts a simple PostGIS join condition", () => {
            expect(check(buildSpatialJoinBody())).not.toThrow();
        });

        it("accepts a full CTE query as the join condition", () => {
            expect(check(buildSpatialJoinBody({
                join_condition: `WITH candidates AS (
  SELECT s.id AS line_id, p.id AS pole_id
  FROM sidewalks s
  JOIN poles p ON ST_DWithin(s.geom, p.geom, 2)
  WHERE (p.tags->>'amenity') = 'light_pole'
)
SELECT * FROM candidates;`,
            }))).not.toThrow();
        });

        it("accepts filters and aggregates over ext properties", () => {
            expect(check(buildSpatialJoinBody({
                join_filter_target: "highway = 'footway'",
                join_filter_source: "surface IS NOT NULL AND width > 1.5",
                aggregate: [
                    "ARRAY_AGG(ext:unit_id) as SDOT_pole_unit_id",
                    "ARRAY_AGG(ext:pole_HasStreetlight) as SDOT_pole_HasStreetlight",
                    "COUNT(*) as pole_count",
                ],
            }))).not.toThrow();
        });

        it("accepts a filter on a column whose name is a reserved word", () => {
            expect(check(buildSpatialJoinBody({
                join_filter_source: "truncate = 'yes'",
            }))).not.toThrow();
        });

        it("accepts the domain entity built from that body", () => {
            expect(check(SpatialJoinRequest.from(buildSpatialJoinBody()))).not.toThrow();
        });

        it("rejects a stacked statement after the join condition", () => {
            expect(check(buildSpatialJoinBody({
                join_condition: "1=1; DROP TABLE content.edge",
            }))).toThrow(InputException);
        });

        it("rejects DML hidden in a filter", () => {
            expect(check(buildSpatialJoinBody({
                join_filter_target: "DELETE FROM content.edge",
            }))).toThrow(InputException);
        });

        it("rejects server side functions used for exfiltration or delay", () => {
            expect(check(buildSpatialJoinBody({
                aggregate: ["ARRAY_AGG(pg_read_file('/etc/passwd'))"],
            }))).toThrow(InputException);

            expect(check(buildSpatialJoinBody({
                join_filter_source: "pg_sleep(10) IS NOT NULL",
            }))).toThrow(InputException);
        });

        it("rejects dynamic SQL execution", () => {
            expect(check(buildSpatialJoinBody({
                join_condition: "EXECUTE 'DROP TABLE content.edge'",
            }))).toThrow(InputException);
        });

        it("rejects a DML statement nested inside a CTE", () => {
            expect(check(buildSpatialJoinBody({
                join_condition: `WITH x AS (DELETE FROM content.edge RETURNING edge_id) SELECT * FROM x`,
            }))).toThrow(InputException);
        });
    });

    describe("calculateTagQualityMetric (parsed tag file JSON)", () => {

        it("accepts a schema tag list", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["surface", "width", "incline", "length", "description", "name", "foot", "update"],
            }])).not.toThrow();
        });

        it("accepts ext prefixed tags, including nested prefixes", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["ext:unit_id", "ext:pole_HasStreetlight", "ext:osw_sidewalk:left"],
            }])).not.toThrow();
        });

        it("accepts identifying field tags that start with an underscore", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["_id", "_u_id", "_v_id"],
            }])).not.toThrow();
        });

        it("accepts a multi entity tag file", () => {
            expect(check([
                { entity_type: "Footway", tags: ["surface", "width"] },
                { entity_type: "Crossing", tags: ["marked", "ext:crossing_quality"] },
            ])).not.toThrow();
        });

        it("rejects a tag that closes the surrounding string literal", () => {
            // Tags are interpolated into '${key}_percentage', and an ext: prefix
            // skips the schema allowlist, so a quote here would break out.
            expect(check([{
                entity_type: "Footway",
                tags: ["ext:x', (SELECT version()) AS leak, 'y"],
            }])).toThrow(InputException);
        });

        it("rejects a tag carrying a comment token", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["surface--x"],
            }])).toThrow(InputException);
        });

        it("rejects a tag carrying a stacked statement", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["x'; DROP TABLE content.edge; --"],
            }])).toThrow(InputException);
        });

        it("rejects a tag containing a function call", () => {
            expect(check([{
                entity_type: "Footway",
                tags: ["ext:pg_sleep(5)"],
            }])).toThrow(InputException);
        });

        it("reports which entry of the tag file failed", () => {
            expect(check([
                { entity_type: "Footway", tags: ["surface"] },
                { entity_type: "Crossing", tags: ["marked", "ext:bad'value"] },
            ])).toThrow(/\[1\]\.tags\[1\]/);
        });
    });

    describe("traversal behaviour shared by all consumers", () => {

        it("ignores null and undefined input", () => {
            expect(check(null)).not.toThrow();
            expect(check(undefined)).not.toThrow();
        });

        it("ignores non object input", () => {
            expect(check("plain string")).not.toThrow();
            expect(check(42)).not.toThrow();
        });

        it("walks nested objects and reports the full field path", () => {
            expect(check({
                parameters: { filters: { join_filter_target: "1=1; DROP TABLE t" } },
            })).toThrow(/parameters\.filters\.join_filter_target/);
        });

        it("walks arrays of objects", () => {
            expect(check({
                items: [{ note: "ok" }, { note: "bad -- comment" }],
            })).toThrow(/items\[1\]\.note/);
        });

        it("walks arrays of plain strings", () => {
            expect(check({ notes: ["ok", "bad; DROP TABLE t"] })).toThrow(/notes\[1\]/);
        });
    });
});
