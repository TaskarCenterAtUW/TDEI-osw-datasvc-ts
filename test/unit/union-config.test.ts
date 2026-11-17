import "reflect-metadata";
import { UnionRequest } from "../../src/model/request-interfaces";
import {
    assertNoRemovedUnionParameters,
    MAX_UNION_CONFIG_BYTES,
    parseUnionConfig,
    UNION_CONFIG_SECTIONS,
} from "../../src/utility/union-config";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { Utility } from "../../src/utility/utility";

const DATASET_ONE = "52945d79-a0df-4440-8363-73bea8e1882a";
const DATASET_TWO = "fbec2c7b-5196-4c83-b7f6-0e24a146f53d";

/** A union 5.0 config using all four sections (accepted by content.union5_validate_config). */
const FULL_CONFIG = {
    snap: { mode: "default", proximity: 1, anchor: "ds1", attributes: "merge" },
    dedup: {
        mode: "custom",
        rules: [
            { name: "dedup_edge_crossing", from: "crossing", to: "crossing", proximity: 1 },
            { name: "dedup_edge_sidewalk", from: "sidewalk", to: "sidewalk", proximity: 1, min_overlap: 0.8, max_angle: 30 }
        ]
    },
    connect: {
        mode: "custom",
        rules: [
            {
                name: "kerbed-crossing", from: "crossing", to: "sidewalk", operation: "geometry", proximity: 2,
                node_tags: { barrier: "kerb" }, edge_tags: { footway: "crossing" }
            }
        ]
    },
    extensions: {
        mode: "default",
        points: { proximity: 1 },
        lines: { proximity: 2.5, min_overlap: 0.7 },
        polygons: { enabled: false },
        zones: { min_overlap: 0.7 }
    }
};

const parse = (config: unknown) => () => parseUnionConfig(config);

describe("union 5.0 config", () => {

    describe("parseUnionConfig", () => {

        it("returns an empty config when none is given", () => {
            expect(parseUnionConfig(undefined)).toEqual({});
            expect(parseUnionConfig(null)).toEqual({});
            expect(parseUnionConfig("")).toEqual({});
        });

        it("passes a config object through unchanged", () => {
            expect(parseUnionConfig(FULL_CONFIG)).toEqual(FULL_CONFIG);
        });

        it("parses a config sent as a JSON string", () => {
            expect(parseUnionConfig(JSON.stringify(FULL_CONFIG))).toEqual(FULL_CONFIG);
        });

        it("accepts each section on its own", () => {
            for (const section of UNION_CONFIG_SECTIONS) {
                expect(parseUnionConfig({ [section]: { mode: "default" } })).toEqual({ [section]: { mode: "default" } });
            }
        });

        it("accepts an empty object, which runs the union with every section off", () => {
            expect(parseUnionConfig({})).toEqual({});
            expect(parseUnionConfig("{}")).toEqual({});
        });

        it("leaves the settings inside a section to the database", () => {
            const config = { snap: { mode: "default", proximity: 99, unknown_setting: true } };
            expect(parseUnionConfig(config)).toEqual(config);
        });

        it("rejects a string that is not valid JSON", () => {
            expect(parse("{snap: default}")).toThrow(new InputException("Invalid config: must be valid JSON"));
        });

        it("rejects a config that is not a JSON object", () => {
            for (const config of [[], "[]", 5, "5", true, "\"snap\""]) {
                expect(parse(config)).toThrow(new InputException("Invalid config: expected a JSON object"));
            }
        });

        it("rejects an unknown section and names the allowed ones", () => {
            expect(parse({ snap: { mode: "default" }, merge: { mode: "default" } })).toThrow(
                new InputException("Invalid config: unknown section 'merge'. Allowed sections: snap, dedup, connect, extensions")
            );
        });

        it("rejects the 4.x settings sent as sections", () => {
            expect(parse({ proximity: 0.5 })).toThrow(/unknown section 'proximity'/);
            expect(parse({ entity_filters: {} })).toThrow(/unknown section 'entity_filters'/);
        });

        it("rejects a section that is not an object", () => {
            for (const value of ["default", null, [], 1]) {
                expect(parse({ dedup: value })).toThrow(
                    new InputException("Invalid config: 'dedup' must be an object, e.g. {\"mode\": \"default\"}")
                );
            }
        });

        it("rejects a config larger than 64 KB, as an object or a string", () => {
            const rules = Array.from({ length: 2000 }, (_, i) => ({ name: `rule_${i}`, from: "sidewalk", to: "sidewalk", proximity: 1 }));
            const config = { dedup: { mode: "custom", rules } };
            expect(JSON.stringify(config).length).toBeGreaterThan(MAX_UNION_CONFIG_BYTES);
            expect(parse(config)).toThrow(new InputException("Invalid config: larger than 64 KB"));
            expect(parse(JSON.stringify(config))).toThrow(new InputException("Invalid config: larger than 64 KB"));
        });
    });

    describe("assertNoRemovedUnionParameters", () => {

        it("rejects proximity and entity_filters with the same message as the backend", () => {
            expect(() => assertNoRemovedUnionParameters({ proximity: 0.5 })).toThrow(new InputException(
                "'proximity' is no longer supported: union 5.0 takes its settings in 'config' (sections snap, dedup, connect, extensions)"
            ));
            expect(() => assertNoRemovedUnionParameters({ entity_filters: { edge: {} } })).toThrow(new InputException(
                "'entity_filters' is no longer supported: union 5.0 takes its settings in 'config' (sections snap, dedup, connect, extensions)"
            ));
        });

        it("rejects proximity even when it is zero", () => {
            expect(() => assertNoRemovedUnionParameters({ proximity: 0 })).toThrow(InputException);
        });

        it("accepts a 5.0 request and parameters left null", () => {
            expect(() => assertNoRemovedUnionParameters({ tdei_dataset_id_one: DATASET_ONE, config: FULL_CONFIG })).not.toThrow();
            expect(() => assertNoRemovedUnionParameters({ proximity: null, entity_filters: null })).not.toThrow();
            expect(() => assertNoRemovedUnionParameters(undefined)).not.toThrow();
        });
    });

    describe("UnionRequest", () => {

        it("carries config through from() and drops the 4.x parameters", () => {
            const request = UnionRequest.from({
                tdei_dataset_id_one: DATASET_ONE,
                tdei_dataset_id_two: DATASET_TWO,
                config: FULL_CONFIG,
                proximity: 0.5,
                entity_filters: { edge: {} }
            });
            expect(request.config).toEqual(FULL_CONFIG);
            expect(request).not.toHaveProperty("proximity");
            expect(request).not.toHaveProperty("entity_filters");
        });

        it("normalises an omitted config to an empty object", async () => {
            const request = UnionRequest.from({ tdei_dataset_id_one: DATASET_ONE, tdei_dataset_id_two: DATASET_TWO });
            await expect(request.validateRequestInput()).resolves.toBe(true);
            expect(request.config).toEqual({});
        });

        it("normalises a config sent as a JSON string to an object", async () => {
            const request = UnionRequest.from({
                tdei_dataset_id_one: DATASET_ONE,
                tdei_dataset_id_two: DATASET_TWO,
                config: JSON.stringify(FULL_CONFIG)
            });
            await request.validateRequestInput();
            expect(request.config).toEqual(FULL_CONFIG);
        });

        it("fails validation when the config envelope is invalid", async () => {
            const request = UnionRequest.from({
                tdei_dataset_id_one: DATASET_ONE,
                tdei_dataset_id_two: DATASET_TWO,
                config: { snapping: { mode: "default" } }
            });
            await expect(request.validateRequestInput()).rejects.toThrow(/unknown section 'snapping'/);
        });

        it("fails validation when both ids name the same dataset", async () => {
            const request = UnionRequest.from({ tdei_dataset_id_one: DATASET_ONE, tdei_dataset_id_two: DATASET_ONE });
            await expect(request.validateRequestInput()).rejects.toThrow(
                new InputException("tdei_dataset_id_one and tdei_dataset_id_two must be different datasets")
            );
        });

        it("still enforces the required dataset ids", async () => {
            const request = UnionRequest.from({ tdei_dataset_id_one: DATASET_ONE, config: FULL_CONFIG });
            await expect(request.validateRequestInput()).rejects.toThrow(/Required fields are missing or invalid/);
        });
    });

    describe("SQL injection screening of the union body", () => {

        it("accepts a body carrying a full config, as an object or a JSON string", () => {
            const body = { user_id: "6f0e2b7a-1c2d-4a3b-8f9e-0a1b2c3d4e5f", tdei_dataset_id_one: DATASET_ONE, tdei_dataset_id_two: DATASET_TWO };
            expect(() => Utility.checkForSqlInjection({ ...body, config: FULL_CONFIG })).not.toThrow();
            expect(() => Utility.checkForSqlInjection({ ...body, config: JSON.stringify(FULL_CONFIG) })).not.toThrow();
        });

        it("rejects an injection attempt inside a rule", () => {
            expect(() => Utility.checkForSqlInjection({
                tdei_dataset_id_one: DATASET_ONE,
                tdei_dataset_id_two: DATASET_TWO,
                config: { connect: { mode: "custom", rules: [{ name: "x'; DROP TABLE content.edge; --", from: "crossing", to: "sidewalk" }] } }
            })).toThrow(InputException);
        });
    });
});
