import _ from "lodash";
import { TdeiDate } from "../utility/tdei-date";

export class OrchestratorUtility {
    constructor() { }

    private static renderTemplate(template: any, data: any) {
        const compiledTemplate: any = {};
        for (const key in template) {
            if (Object.prototype.hasOwnProperty.call(template, key)) {
                if (typeof template[key] === 'object') {
                    compiledTemplate[key] = this.renderTemplate(template[key], data);
                } else {
                    compiledTemplate[key] = _.template(template[key])(data);
                    compiledTemplate[key] = compiledTemplate[key].replace(/"true"/g, 'true').replace(/"false"/g, 'false');
                    if (compiledTemplate[key] === "CURRENT_TIMESTAMP") {
                        compiledTemplate[key] = TdeiDate.UTC();
                    }
                }
            }
        }
        return compiledTemplate;
    }

    // Function to parse JSON strings within an object
    private static parseJSONStrings(obj: any) {
        return Object.entries(obj).reduce((parsedObj: any, [key, value]) => {
            try {
                // Attempt to parse the property value as JSON
                parsedObj[key] = JSON.parse(value as string);
            } catch (e) {
                // If parsing fails, use the original value
                parsedObj[key] = value;
            }
            return parsedObj;
        }, {});
    }

    /**
    * Maps the input parameters to the workflow context using a template function.
    * @param inputParams - The input parameters to be mapped.
    * @param workflow_context - The workflow context object.
    * @returns The mapped result object.
    */
    public static map_props(inputParams: any, workflow_context: any) {
        try {
            // Render the template with the input data
            const resultObject = this.renderTemplate(inputParams, workflow_context);

            // Parse JSON strings within the result object
            const finalObject = this.parseJSONStrings(resultObject);

            // const templateString = JSON.stringify(inputParams);
            // // Create the template function
            // const compiled = _.template(templateString);
            // // Replace the placeholders with actual values
            // let resultString = compiled(workflow_context);
            //convert boolean string to boolean
            // resultString = resultString.replace(/"true"/g, 'true').replace(/"false"/g, 'false');
            // Parse the result string back to a JSON object
            // const resultObject = JSON.parse(resultString);
            return finalObject;
        } catch (error) {
            console.error("Error while mapping props", error);
            return new Error("Error while processing workflow");
        }
    }
}