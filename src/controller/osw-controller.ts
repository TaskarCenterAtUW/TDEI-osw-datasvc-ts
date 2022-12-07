import { Request } from "express";
import express from "express";
import { IController } from "./interface/IController";
import { OswQueryParams } from "../model/osw-get-query-params";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import oswService from "../service/Osw-service";

class GtfsOSWController implements IController {
    public path = '/api/v1/osw';
    public router = express.Router();
    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, this.getAllOsw);
        this.router.get(`${this.path}/:id`, this.getOswById);
        this.router.post(this.path, this.createOsw);
    }

    getAllOsw = async (request: Request, response: express.Response) => {
        var params: OswQueryParams = JSON.parse(JSON.stringify(request.query));

        const osw = await oswService.getAllOsw(params);
        response.send(osw);
    }

    getOswById = async (request: Request, response: express.Response) => {

        try {
            let fileEntity: FileEntity = await oswService.getOswById(request.params.id);

            response.header('Content-Type', fileEntity.mimeType);
            response.header('Content-disposition', `attachment; filename=${fileEntity.fileName}`);
            response.status(200);
            (await fileEntity.getStream()).pipe(response);
        } catch (error) {
            console.log('Error while getting the file stream');
            console.log(error);
            response.status(404);
            response.end();
            return;
        }
    }

    createOsw = async (request: Request, response: express.Response) => {

        var newOsw = await oswService.createOsw(request.body).catch((error: any) => {
            console.log('Error saving the osw version');
            console.log(error);
            response.status(500);
            response.end();
            return;
        });
        response.send(newOsw);
    }
}

const oswController = new GtfsOSWController();
export default oswController;