import express, { Request } from "express";
import { IController } from "./interface/IController";

class HealthController implements IController {
    public path = '/health';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/ping`, this.getping);
    }

    public getping = async (request: Request, response: express.Response) => {
        // return loaded posts
        response.send("I'm healthy !!");
    }
}

const healthController = new HealthController();
export default healthController;