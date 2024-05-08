import express, { Request } from "express";
import { IController } from "./interface/IController";
import { Core } from "nodets-ms-core";
// import storageService from "../service/storage-service";
import path from "path";
import fs from "fs";

class HealthController implements IController {
    public path = '/health';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/ping`, this.getping);
        this.router.get(`${this.path}/test-upload-zip-stream`, this.testUploadZipStream)
        this.router.get(`${this.path}/test-redirect`, this.testRedirect)
        this.router.get(`${this.path}/test-local-file`, this.testLocalFile)
    }

    public getping = async (request: Request, response: express.Response) => {
        // return loaded posts
        response.status(200).send("I'm healthy !!");
    }

    testUploadZipStream = async (request: Request, response: express.Response) => {
        // File Url is https://tdeisamplestorage.blob.core.windows.net/osw/test_upload/seattle.zip
        const storageClient = Core.getStorageClient();
        const containerName = "osw";
        const fileName = request.query.fileName;
        if (fileName === undefined || fileName === null || fileName === "") {
            response.status(400).send("Please provide a file name in the url");
            return;
        }
        const blobName = "test_upload/"+fileName;
        const theFile = await storageClient?.getFile(containerName, blobName);
        const fileStream = await theFile?.getStream()
        // Respond with the file stream
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        // response.send(fileStream)
        // stream the content from fileStream to response
        fileStream?.pipe(response);
        
    }

    testRedirect = async (request: Request, response: express.Response) => {
        // Redirect the response to a different url
        const fileName = request.query.fileName;
        if (fileName === undefined || fileName === null || fileName === "") {
            response.status(400).send("Please provide a file name in the url");
            return;
        }
        response.redirect(301,`https://tdeisamplestorage.blob.core.windows.net/osw/test_upload/${fileName}`);
    }

    testLocalFile = async (request: Request, response: express.Response) => {
        const fileName = request.query.fileName;
        if (fileName === undefined || fileName === null || fileName === "") {
            response.status(400).send("Please provide a file name in the url");
            return;
        }
        // get the path to osw-output folder
        const filePath = path.resolve(__dirname, '../../../osw-output', fileName);
        // Respond with the file stream
        // response.setHeader('Content-Type', 'application/zip');
        // response.setHeader('Content-Disposition', `attachment; filename=seattle.zip`);
        // const stream = fs.createReadStream(filePath);
        // stream.pipe(response);
        response.sendFile(filePath);
    }

}

const healthController = new HealthController();
export default healthController;