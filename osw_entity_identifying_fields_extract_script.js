const fs = require('fs');

// Read the JSON file
fs.readFile('src/assets/opensidewalks_0.2.schema.json', 'utf8', (err, data) => {
    if (err) {
        console.error(err);
        return;
    }
    const ignore_keys = ["BuildingField", "BuildingFields", "BareNodeFields"];
    const entity_types = {
        "RolledCurb": {
            "entity_type": "node"
        },
        "RaisedCurb": {
            "entity_type": "node"
        },
        "CurbRamp": {
            "entity_type": "node"
        },
        "FlushCurb": {
            "entity_type": "node"
        },
        "GenericCurb": {
            "entity_type": "node"
        },
        "Footway": {
            "entity_type": "edge"
        },
        "Sidewalk": {
            "entity_type": "edge"
        },
        "Crossing": {
            "entity_type": "edge"
        },
        "TrafficIsland": {
            "entity_type": "edge"
        },
        "Pedestrian": {
            "entity_type": "edge"
        },
        "Steps": {
            "entity_type": "edge"
        },
        "LivingStreet": {
            "entity_type": "edge"
        },
        "PrimaryStreet": {
            "entity_type": "edge"
        },
        "SecondaryStreet": {
            "entity_type": "edge"
        },
        "TertiaryStreet": {
            "entity_type": "edge"
        },
        "ResidentialStreet": {
            "entity_type": "edge"
        },
        "ServiceRoad": {
            "entity_type": "edge"
        },
        "Alley": {
            "entity_type": "edge"
        },
        "Driveway": {
            "entity_type": "edge"
        },
        "ParkingAisle": {
            "entity_type": "edge"
        },
        "TrunkRoad": {
            "entity_type": "edge"
        },
        "UnclassifiedRoad": {
            "entity_type": "edge"
        },
        "PedestrianZone": {
            "entity_type": "zone"
        },
        "PowerPole": {
            "entity_type": "extension_point"
        },
        "FireHydrant": {
            "entity_type": "extension_point"
        },
        "Bench": {
            "entity_type": "extension_point"
        },
        "WasteBasket": {
            "entity_type": "extension_point"
        },
        "Bollard": {
            "entity_type": "extension_point"
        },
        "Manhole": {
            "entity_type": "extension_point"
        },
        "StreetLamp": {
            "entity_type": "extension_point"
        },
        "Fence": {
            "entity_type": "extension_line"
        }
    };
    // Parse the JSON data
    const schema = JSON.parse(data);

    // Initialize an empty object to store the results
    let result = {};

    // Iterate over each key in the definitions
    for (let key in schema.definitions) {
        // Check if the key starts with an underscore
        if (key.includes('Fields') && !ignore_keys.includes(key)) {
            // if (!key.startsWith('_')) {
            // Get the required properties
            let required = schema.definitions[key].required;

            // Initialize an empty object for the identifying_key_val
            let identifying_key_val = {};

            // Iterate over each required property
            for (let prop of required) {
                // Check if the property starts with an underscore
                if (!prop.startsWith('_')) {
                    // Get the first enum value for the property
                    let enumVal = schema.definitions[key].properties[prop].enum[0];
                    // Add the property and its first enum value to the identifying_key_val object
                    identifying_key_val[prop] = enumVal;
                }
            }

            let prop_key = key.replace("Fields", "");
            // Add the identifying_key_val object to the result object
            result[prop_key] = { entity_type: entity_types[prop_key].entity_type, identifying_key_val };
        }
    }
    let resultJson = JSON.stringify(result, null, 2);

    // Write the JSON string to a file
    fs.writeFile('src/assets/opensidewalks_0.2.identifying.fields.json', resultJson, 'utf8', (err) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('File has been saved.');
    });
});