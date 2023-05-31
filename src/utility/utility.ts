
export class Utility {

    public static dateIsValid(dateStr: any): boolean {
        try {
            const date = new Date(dateStr);

            const timestamp = date.getTime();

            if (typeof timestamp !== 'number' || Number.isNaN(timestamp)) {
                return false;
            }
        } catch (error) {
            return false;
        }
        return true;
    }
}