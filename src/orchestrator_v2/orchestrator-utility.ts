import _ from "lodash";

export class OrchestratorUtility {
    constructor() { }
    /**
    * Maps the input parameters to the workflow context using a template function.
    * @param inputParams - The input parameters to be mapped.
    * @param workflow_context - The workflow context object.
    * @returns The mapped result object.
    */
    public static map_props(inputParams: any, workflow_context: any) {
        try {
            const templateString = JSON.stringify(inputParams);
            // Create the template function
            const compiled = _.template(templateString);
            // Replace the placeholders with actual values
            let resultString = compiled(workflow_context);
            //convert boolean string to boolean
            resultString = resultString.replace(/"true"/g, 'true').replace(/"false"/g, 'false');
            // Parse the result string back to a JSON object
            const resultObject = JSON.parse(resultString);
            return resultObject;
        } catch (error) {
            console.error("Error while mapping props", error);
            return null;
        }
    }
}