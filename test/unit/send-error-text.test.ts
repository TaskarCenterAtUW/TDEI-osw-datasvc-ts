import { getMockRes } from "@jest-mock/express";
import express from "express";
import http from "http";
import { AddressInfo } from "net";
import { InputException } from "../../src/exceptions/http/http-exceptions";
import { sendErrorText } from "../../src/exceptions/http/send-error-text";

// A real HTTP request. Not fetch: setupJest.js replaces it with jest-fetch-mock.
function get(url: string): Promise<{ status?: number; contentType?: string; body: string }> {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", chunk => (body += chunk));
            res.on("end", () => resolve({ status: res.statusCode, contentType: res.headers["content-type"], body }));
        }).on("error", reject);
    });
}

describe("sendErrorText", () => {
    it("sends the message unchanged, as plain text, with the status", () => {
        const { res } = getMockRes();

        sendErrorText(res, 400, "<b>x</b> is not a flex dataset.");

        expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith("<b>x</b> is not a flex dataset.");
    });

    it("is what exceptions use to send their own response", () => {
        const { res } = getMockRes();

        new InputException("<script>alert(1)</script> is invalid", res);

        expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.send).toHaveBeenCalledWith("<script>alert(1)</script> is invalid");
    });

    it("reaches the client as text/plain, where a plain send would be text/html", async () => {
        const app = express();
        app.get("/plain/:id", (req, res) => sendErrorText(res, 400, `${req.params.id} is not a flex dataset.`));
        app.get("/default/:id", (req, res) => res.status(400).send(`${req.params.id} is not a flex dataset.`));
        const server = app.listen(0);
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const id = encodeURIComponent("<script>alert(1)</script>");

        try {
            const plain = await get(`${base}/plain/${id}`);
            const unchanged = await get(`${base}/default/${id}`);

            expect(plain.status).toBe(400);
            expect(plain.contentType).toBe("text/plain; charset=utf-8");
            expect(plain.body).toBe("<script>alert(1)</script> is not a flex dataset.");
            // Same body as before, only the content type differs.
            expect(unchanged.contentType).toMatch(/^text\/html/);
            expect(unchanged.body).toBe(plain.body);
        } finally {
            server.close();
        }
    });
});
