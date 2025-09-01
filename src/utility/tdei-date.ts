export class TdeiDate {

    public static UTC(date?: string | Date | null): string {
        if (!date || date == null) return (new Date()).toISOString();
        return (new Date(date)).toISOString();
    }

    public static isValid(dateStr: any): boolean {
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

    static getFutureUTCDate(number: number, units: string): string {
        const now = new Date();

        switch (units.toLowerCase()) {
            case "days":
            case "day":
                now.setDate(now.getDate() + number);
                break;

            case "months":
            case "month":
                now.setMonth(now.getMonth() + number);
                break;

            case "years":
            case "year":
                now.setFullYear(now.getFullYear() + number);
                break;

            default:
                throw new Error(`Invalid unit: ${units}. Use 'days', 'months', or 'years'.`);
        }

        return now.toISOString();
    }

}