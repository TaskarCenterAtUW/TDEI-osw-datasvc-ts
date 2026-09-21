import "reflect-metadata";
import { UnionRequest, validateEntityFilters, UNION_FILTERABLE_ENTITY_TYPES, UnionFilterableEntityType } from "../../src/model/request-interfaces";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { Utility } from "../../src/utility/utility";

const validate = (entity_filters: any) => () => validateEntityFilters(entity_filters);

/** The payloads written into the signature comment of content.tdei_union_dataset. */
const DOCUMENTED_FILTER_EXAMPLE = {
    edge: {
        filters: [
            { highway: "footway", footway: "sidewalk" },
            { highway: "footway", footway: "crossing" }
        ]
    },
    line: { filters: [{ highway: "path" }] }
};

const DOCUMENTED_DUPLICATE_EXAMPLE = {
    edge: { duplicate_buffer_width: 3, duplicate_overlap_percentage: 70 },
    polygon: { duplicate_overlap_percentage: 80 }
};

/**
 * The support matrix on the function signature:
 *   duplicate_buffer_width        metres  — edge, line
 *   duplicate_overlap_percentage  0-100   — edge, line, polygon, zone
 * Keyed by every file type, so a new one cannot be added without a row here.
 */
const DUPLICATE_SUPPORT: Record<UnionFilterableEntityType, { buffer: boolean; overlap: boolean; reason?: RegExp }> = {
    edge: { buffer: true, overlap: true },
    line: { buffer: true, overlap: true },
    polygon: { buffer: false, overlap: true, reason: /compared by shared area, so there is no corridor to widen/ },
    zone: { buffer: false, overlap: true, reason: /compared by shared area, so there is no corridor to widen/ },
    node: { buffer: false, overlap: false, reason: /merged by proximity, not by overlap/ },
    point: { buffer: false, overlap: false, reason: /merged by proximity, not by overlap/ }
};

/** Every file type at once, each with the settings it supports. */
const FULL_ENTITY_FILTERS = {
    edge: {
        filters: [
            { highway: "footway", footway: "sidewalk" },
            { highway: "footway", footway: "crossing" }
        ],
        duplicate_buffer_width: 2,
        duplicate_overlap_percentage: 75
    },
    node: {
        filters: [{ barrier: "kerb" }]
    },
    line: {
        filters: [{ barrier: "fence" }],
        duplicate_buffer_width: 1.5,
        duplicate_overlap_percentage: 65
    },
    polygon: {
        filters: [{ building: "yes" }],
        duplicate_overlap_percentage: 80
    },
    zone: {
        duplicate_overlap_percentage: 75
    },
    point: {
        filters: [{ amenity: "bench" }, { highway: "street_lamp" }]
    }
};

describe("union entity_filters", () => {

    describe("the examples documented on content.tdei_union_dataset", () => {

        it("accepts the filter example from the function signature", () => {
            expect(validate(DOCUMENTED_FILTER_EXAMPLE)).not.toThrow();
        });

        it("accepts the duplicate detection example from the function signature", () => {
            expect(validate(DOCUMENTED_DUPLICATE_EXAMPLE)).not.toThrow();
        });

        it("accepts both examples combined, filters and duplicate settings together", () => {
            expect(validate({
                edge: { ...DOCUMENTED_FILTER_EXAMPLE.edge, ...DOCUMENTED_DUPLICATE_EXAMPLE.edge },
                line: DOCUMENTED_FILTER_EXAMPLE.line,
                polygon: DOCUMENTED_DUPLICATE_EXAMPLE.polygon
            })).not.toThrow();
        });
    });

    describe("validateEntityFilters", () => {

        it("treats an absent filter as no filter", () => {
            expect(validate(undefined)).not.toThrow();
            expect(validate(null)).not.toThrow();
        });

        it("treats an empty payload as no filter", () => {
            expect(validate({})).not.toThrow();
        });

        it("accepts a single group of AND-ed attributes", () => {
            expect(validate({
                edge: { filters: [{ highway: "footway", footway: "sidewalk" }] }
            })).not.toThrow();
        });

        it("accepts multiple OR-ed groups across several file types", () => {
            expect(validate({
                edge: {
                    filters: [
                        { highway: "footway", footway: "sidewalk" },
                        { highway: "footway", footway: "crossing" }
                    ]
                },
                line: { filters: [{ highway: "path" }] },
                point: { filters: [{ power: "pole" }] }
            })).not.toThrow();
        });

        it("accepts every file type the union function reads", () => {
            const allTypes = Object.fromEntries(
                UNION_FILTERABLE_ENTITY_TYPES.map(type => [type, { filters: [{ highway: "footway" }] }])
            );
            expect(validate(allTypes)).not.toThrow();
        });

        it("accepts numeric and boolean attribute values", () => {
            expect(validate({
                edge: { filters: [{ lanes: 2, lit: true, width: 1.5 }] }
            })).not.toThrow();
        });

        it("accepts ext namespaced attributes", () => {
            expect(validate({
                point: { filters: [{ "ext:subtypecd": "streetlight" }] }
            })).not.toThrow();
        });

        it("accepts an empty filter list, which the function reads as no filter", () => {
            expect(validate({ edge: { filters: [] } })).not.toThrow();
        });

        it("rejects a non object payload", () => {
            expect(validate("edge")).toThrow(InputException);
            expect(validate([{ edge: { filters: [] } }])).toThrow(/must be an object keyed by file type/);
        });

        it("rejects an unsupported file type and names the supported ones", () => {
            expect(validate({ sidewalk: { filters: [{ highway: "footway" }] } }))
                .toThrow(/unsupported file type 'sidewalk'.*edge, node, zone, line, polygon, point/);
        });

        it("rejects near misses of a real file type rather than guessing", () => {
            // The function reads '{<type>,filters}' by exact key, so a wrong case
            // or a plural would apply nothing.
            expect(validate({ Edge: { filters: [{ highway: "footway" }] } }))
                .toThrow(/unsupported file type 'Edge'/);
            expect(validate({ edges: { filters: [{ highway: "footway" }] } }))
                .toThrow(/unsupported file type 'edges'/);
        });

        it("rejects an unsupported file type even when its block is well formed", () => {
            expect(validate({
                edge: { filters: [{ highway: "footway" }] },
                relation: { filters: [{ type: "route" }], duplicate_overlap_percentage: 70 }
            })).toThrow(/unsupported file type 'relation'/);
        });

        it("rejects a file type block that is not an object", () => {
            expect(validate({ edge: [{ highway: "footway" }] }))
                .toThrow(/entity_filters.edge must be an object/);
        });

        it("rejects a non array filters key", () => {
            expect(validate({ edge: { filters: "highway=footway" } }))
                .toThrow(/entity_filters.edge.filters must be an array/);
        });

        it("accepts a block with no settings at all", () => {
            expect(validate({ edge: {} })).not.toThrow();
        });

        it("rejects an unknown setting inside a block", () => {
            expect(validate({ edge: { overlap: 70 } }))
                .toThrow(/entity_filters.edge: unknown setting 'overlap'.*filters, duplicate_buffer_width, duplicate_overlap_percentage/);
        });

        it("rejects an unknown setting sitting beside valid ones", () => {
            expect(validate({
                edge: {
                    filters: [{ highway: "footway" }],
                    duplicate_overlap_percentage: 70,
                    duplicate_bufer_width: 3
                }
            })).toThrow(/unknown setting 'duplicate_bufer_width'/);
        });

        it("rejects an unprefixed setting name", () => {
            expect(validate({ edge: { buffer_width: 3 } }))
                .toThrow(/unknown setting 'buffer_width'/);
            expect(validate({ edge: { overlap_percentage: 70 } }))
                .toThrow(/unknown setting 'overlap_percentage'/);
        });
    });

    describe("duplicate detection settings", () => {

        it("accepts every file type carrying the settings it supports", () => {
            expect(validate(FULL_ENTITY_FILTERS)).not.toThrow();
        });

        it("accepts duplicate settings alongside filters", () => {
            expect(validate({
                edge: {
                    filters: [{ highway: "footway" }],
                    duplicate_buffer_width: 3,
                    duplicate_overlap_percentage: 70
                }
            })).not.toThrow();
        });

        it("accepts duplicate settings on their own, without filters", () => {
            expect(validate({
                edge: { duplicate_buffer_width: 3, duplicate_overlap_percentage: 70 },
                polygon: { duplicate_overlap_percentage: 80 }
            })).not.toThrow();
        });

        it.each(UNION_FILTERABLE_ENTITY_TYPES)("applies the documented buffer width rule to %s", (entityType) => {
            const { buffer, reason } = DUPLICATE_SUPPORT[entityType];
            const check = validate({ [entityType]: { duplicate_buffer_width: 3 } });

            if (buffer) {
                expect(check).not.toThrow();
            } else {
                expect(check).toThrow(new RegExp(`entity_filters\\.${entityType}\\.duplicate_buffer_width is not supported`));
                expect(check).toThrow(reason!);
                expect(check).toThrow(/Supported file types: edge, line$/);
            }
        });

        it.each(UNION_FILTERABLE_ENTITY_TYPES)("applies the documented overlap percentage rule to %s", (entityType) => {
            const { overlap, reason } = DUPLICATE_SUPPORT[entityType];
            const check = validate({ [entityType]: { duplicate_overlap_percentage: 70 } });

            if (overlap) {
                expect(check).not.toThrow();
            } else {
                expect(check).toThrow(new RegExp(`entity_filters\\.${entityType}\\.duplicate_overlap_percentage is not supported`));
                expect(check).toThrow(reason!);
                expect(check).toThrow(/Supported file types: edge, line, polygon, zone$/);
            }
        });

        it("accepts each file type's own default as an explicit value", () => {
            expect(validate({ edge: { duplicate_overlap_percentage: 80 } })).not.toThrow();
            expect(validate({ line: { duplicate_overlap_percentage: 70 } })).not.toThrow();
            expect(validate({ polygon: { duplicate_overlap_percentage: 70 } })).not.toThrow();
            expect(validate({ zone: { duplicate_overlap_percentage: 70 } })).not.toThrow();
        });

        it("requires a buffer width greater than zero metres", () => {
            expect(validate({ edge: { duplicate_buffer_width: 0 } }))
                .toThrow(/must be greater than 0 metres \(got 0\)/);
            expect(validate({ edge: { duplicate_buffer_width: -0 } }))
                .toThrow(/must be greater than 0 metres/);
            expect(validate({ edge: { duplicate_buffer_width: -3 } }))
                .toThrow(/must be greater than 0 metres/);
        });

        it("accepts a sub metre buffer width, the narrowest useful corridor", () => {
            expect(validate({ edge: { duplicate_buffer_width: 0.25 } })).not.toThrow();
            expect(validate({ line: { duplicate_buffer_width: 0.0001 } })).not.toThrow();
        });

        it("requires an overlap percentage above 0 and at most 100", () => {
            expect(validate({ edge: { duplicate_overlap_percentage: 0 } }))
                .toThrow(/must be greater than 0 and at most 100 \(got 0\)/);
            expect(validate({ edge: { duplicate_overlap_percentage: -5 } }))
                .toThrow(/must be greater than 0 and at most 100 \(got -5\)/);
            expect(validate({ edge: { duplicate_overlap_percentage: 101 } }))
                .toThrow(/must be greater than 0 and at most 100 \(got 101\)/);
        });

        it("holds the overlap percentage bounds exactly at 0 and 100", () => {
            expect(validate({ edge: { duplicate_overlap_percentage: 100 } })).not.toThrow();
            expect(validate({ edge: { duplicate_overlap_percentage: 0.0001 } })).not.toThrow();
            expect(validate({ edge: { duplicate_overlap_percentage: 100.0001 } }))
                .toThrow(/at most 100 \(got 100.0001\)/);
        });

        it("rejects duplicate settings that are not numbers", () => {
            expect(validate({ edge: { duplicate_buffer_width: "3" } }))
                .toThrow(/duplicate_buffer_width must be a number of metres/);
            expect(validate({ edge: { duplicate_overlap_percentage: "70" } }))
                .toThrow(/duplicate_overlap_percentage must be a number/);
            expect(validate({ edge: { duplicate_overlap_percentage: true } }))
                .toThrow(/duplicate_overlap_percentage must be a number/);
        });

        it("rejects duplicate settings that are null or not finite", () => {
            // JSON null arrives as a present key, not as the setting being absent.
            expect(validate({ edge: { duplicate_buffer_width: null } }))
                .toThrow(/duplicate_buffer_width must be a number of metres/);
            expect(validate({ edge: { duplicate_overlap_percentage: null } }))
                .toThrow(/duplicate_overlap_percentage must be a number/);
            expect(validate({ edge: { duplicate_buffer_width: NaN } }))
                .toThrow(/duplicate_buffer_width must be a number of metres/);
            expect(validate({ edge: { duplicate_buffer_width: Infinity } }))
                .toThrow(/duplicate_buffer_width must be a number of metres/);
        });

        it("rejects a group that is not an object and reports its index", () => {
            expect(validate({ edge: { filters: [{ highway: "footway" }, "footway=sidewalk"] } }))
                .toThrow(/entity_filters.edge.filters\[1\] must be an object/);
        });

        it("rejects an empty group, which would match every feature", () => {
            expect(validate({ edge: { filters: [{}] } }))
                .toThrow(/must declare at least one attribute/);
        });

        it("rejects non scalar attribute values, which jsonb containment cannot match", () => {
            expect(validate({ edge: { filters: [{ highway: { value: "footway" } }] } }))
                .toThrow(/entity_filters.edge.filters\[0\].highway must be a string, number or boolean/);
            expect(validate({ edge: { filters: [{ highway: ["footway", "path"] }] } }))
                .toThrow(/must be a string, number or boolean/);
            expect(validate({ edge: { filters: [{ highway: null }] } }))
                .toThrow(/must be a string, number or boolean/);
        });
    });

    describe("UnionRequest", () => {

        const baseRequest = {
            tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
            tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
        };

        it("carries entity_filters through from() without altering them", () => {
            const entity_filters = {
                edge: {
                    filters: [{ highway: "footway", footway: "sidewalk" }],
                    duplicate_buffer_width: 3,
                    duplicate_overlap_percentage: 70
                },
                polygon: { duplicate_overlap_percentage: 80 }
            };
            const request = UnionRequest.from({ ...baseRequest, entity_filters });

            expect(request.entity_filters).toEqual(entity_filters);
        });

        it("accepts a request carrying every file type and setting", async () => {
            const request = UnionRequest.from({ ...baseRequest, entity_filters: FULL_ENTITY_FILTERS });

            await expect(request.validateRequestInput()).resolves.toBe(true);
            expect(request.entity_filters).toEqual(FULL_ENTITY_FILTERS);
            expect(() => Utility.checkForSqlInjection({ ...baseRequest, entity_filters: FULL_ENTITY_FILTERS })).not.toThrow();
        });

        it("passes request validation with duplicate detection settings", async () => {
            const request = UnionRequest.from({
                ...baseRequest,
                entity_filters: {
                    edge: { duplicate_buffer_width: 3, duplicate_overlap_percentage: 70 },
                    polygon: { duplicate_overlap_percentage: 80 }
                }
            });

            await expect(request.validateRequestInput()).resolves.toBe(true);
        });

        it("fails request validation when a duplicate setting is out of range", async () => {
            const request = UnionRequest.from({
                ...baseRequest,
                entity_filters: { edge: { duplicate_overlap_percentage: 150 } }
            });

            await expect(request.validateRequestInput()).rejects.toThrow(InputException);
        });

        it("leaves entity_filters undefined when omitted, so the function default applies", async () => {
            const request = UnionRequest.from({ ...baseRequest });

            await expect(request.validateRequestInput()).resolves.toBe(true);
            expect(request.entity_filters).toBeUndefined();
        });

        it("leaves an omitted duplicate setting absent rather than defaulting it", async () => {
            // The defaults live in the function. Filling a key in here would pin
            // the value and the function's default could never apply.
            const request = UnionRequest.from({
                ...baseRequest,
                entity_filters: {
                    edge: { duplicate_overlap_percentage: 75 },
                    line: { filters: [{ highway: "path" }] }
                }
            });

            await expect(request.validateRequestInput()).resolves.toBe(true);
            expect(request.entity_filters!.edge).not.toHaveProperty("duplicate_buffer_width");
            expect(request.entity_filters!.edge).not.toHaveProperty("filters");
            expect(request.entity_filters!.line).not.toHaveProperty("duplicate_buffer_width");
            expect(request.entity_filters!.line).not.toHaveProperty("duplicate_overlap_percentage");
            expect(Object.keys(request.entity_filters!)).toEqual(["edge", "line"]);
        });

        it("does not invent blocks for file types the caller left out", async () => {
            const request = UnionRequest.from({
                ...baseRequest,
                entity_filters: { edge: { duplicate_buffer_width: 3 } }
            });

            await expect(request.validateRequestInput()).resolves.toBe(true);
            expect(request.entity_filters).toEqual({ edge: { duplicate_buffer_width: 3 } });
        });

        it("passes request validation with valid filters", async () => {
            const request = UnionRequest.from({
                ...baseRequest,
                proximity: 1.5,
                entity_filters: { edge: { filters: [{ highway: "footway" }] } }
            });

            await expect(request.validateRequestInput()).resolves.toBe(true);
        });

        it("fails request validation with malformed filters", async () => {
            const request = UnionRequest.from({
                ...baseRequest,
                entity_filters: { edge: { filters: [{}] } }
            });

            await expect(request.validateRequestInput()).rejects.toThrow(InputException);
        });

        it("still enforces the existing required fields", async () => {
            const request = UnionRequest.from({
                tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
                entity_filters: { edge: { filters: [{ highway: "footway" }] } }
            });

            await expect(request.validateRequestInput()).rejects.toThrow(InputException);
        });
    });

    describe("SQL injection screening of the union body", () => {

        it("accepts a body carrying entity_filters", () => {
            expect(() => Utility.checkForSqlInjection({
                user_id: "6f0e2b7a-1c2d-4a3b-8f9e-0a1b2c3d4e5f",
                tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
                tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
                proximity: 0.5,
                entity_filters: {
                    edge: { filters: [{ highway: "footway", footway: "sidewalk" }] }
                }
            })).not.toThrow();
        });

        it("rejects an injection attempt inside a filter value", () => {
            expect(() => Utility.checkForSqlInjection({
                tdei_dataset_id_one: "52945d79-a0df-4440-8363-73bea8e1882a",
                tdei_dataset_id_two: "fbec2c7b-5196-4c83-b7f6-0e24a146f53d",
                entity_filters: {
                    edge: { filters: [{ highway: "footway'; DROP TABLE content.edge; --" }] }
                }
            })).toThrow(/entity_filters\.edge\.filters\[0\]\.highway/);
        });
    });
});
