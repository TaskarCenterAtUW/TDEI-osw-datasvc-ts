
export class Utility {

    public static dateIsValid(dateStr: any): boolean {
        const regex = /^\d{4}-\d{2}-\d{2}$/;

        if (dateStr.match(regex) === null) {
            return false;
        }

        const date = new Date(dateStr);

        const timestamp = date.getTime();

        if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
            return false;
        }

        return date.toISOString().startsWith(dateStr);
    }

    public static copy<T extends Object>(target: T, source: any): T {
        Object.keys(target).forEach(key => {
            if (source[key] != undefined) {
                target[key as keyof Object] = source[key];
            }
        }
        );
        return target;
    }
}