
export class OrchestratorFunctions {
    constructor() { }

    public static decodeUrl(url: string): Promise<any> {
        try {
            return Promise.resolve({
                sucess: true,
                message: "Url decoded successfully",
                url: decodeURIComponent(url)
            });
        } catch (e) {
            return Promise.resolve({
                sucess: false,
                message: "Error while decoding url",
                url: url
            });
        }
    }

    // Function to invoke a method by name
    static async invokeMethod(methodName: string, ...args: any[]): Promise<any> {
        // Check if the method exists on the class instance
        if (typeof (this as any)[methodName] === 'function') {
            return await (this as any)[methodName](...args);
        } else {
            console.log(`Method ${methodName} does not exist on OrchestratorFunctions.`);
            return {
                success: false,
                message: `Method ${methodName} does not exist on OrchestratorFunctions.`
            };
        }
    }
}