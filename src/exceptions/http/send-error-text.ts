import { Response } from "express";

/**
 * Sends an error message as plain text.
 *
 * Express labels a string body as HTML, and error messages can include request
 * input (e.g. a dataset id), so a browser could render one as a page. Plain text
 * keeps the body the same for API clients and removes that HTML context.
 */
export function sendErrorText(response: Response, status: number, message: string): Response {
    response.set("Content-Type", "text/plain; charset=utf-8");
    return response.status(status).send(message);
}
