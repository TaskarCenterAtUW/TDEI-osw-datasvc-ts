import express, { Request } from "express";
import { IController } from "./interface/IController";
import { Core } from "nodets-ms-core";
import archiver from 'archiver';
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { Readable } from "stream";

class HealthController implements IController {
    public path = '/health';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(`${this.path}/ping`, this.getping);
        this.router.get(`${this.path}/test`, this.getsampledl);
    }

    public getping = async (request: Request, response: express.Response) => {
        // return loaded posts
        console.log(' ',__dirname)
        response.status(200).send("I'm healthy !!");
    }
    public getsampledl = async(request: Request, response: express.Response) => {
        // return loaded posts
        // Get the files
        const files = ['2024/4/b703eb60-1686-4851-8fcb-d3af495fda9d/ca4d9c5d754649b28c79ee3a1aa764e9/columbia_county.zip',
         '2024/4/b703eb60-1686-4851-8fcb-d3af495fda9d/ca4d9c5d754649b28c79ee3a1aa764e9/metadata.json']
         // Get the storage client
         const client = Core.getStorageClient();
         const container = client?.getContainer('osw');
         const f1 = await client?.getFile('osw',files[0])!;
         const f2 = await client?.getFile('osw',files[1])!;
         const st1 = await f1.getStream();
         const st2 = await f2.getStream();
          
        //  st1.pipe(response);
        const zipFileName = 'osm.zip';
        const archive = archiver('zip', { zlib: { level: 9 } });
            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);
            archive.pipe(response);
            archive.append( Readable.from(st1),{name:'columbia_county.zip'})
            archive.append(Readable.from(st2),{name:'b.json'})
            
            // console.log(' ', path.dirname(path.dirname(__dirname)))
            // const rootfolder =  path.dirname(path.dirname(__dirname))
            // const schema_file_name = path.join(rootfolder,'src','assets','columbia_city.zip')
            // console.log(schema_file_name);
            // const fileStream = createReadStream(schema_file_name);
            // archive.append(fileStream,{name:'internal.zip'});
            
            // for (const filee of fileEntities) {
            //     // Read into a stream
            //     const fileEntityReader = new FileEntityStream(filee)

            //     archive.append(fileEntityReader, { name: filee.fileName, store: true });
            // }
          archive.finalize();
    }
}

const healthController = new HealthController();
export default healthController;