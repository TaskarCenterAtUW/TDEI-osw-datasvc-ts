import { environment } from "../environment/environment";
import HttpException from "../exceptions/http/http-base-exception";
import { Readable } from "stream";
import { FileEntity } from "nodets-ms-core/lib/core/storage";
import { Core } from "nodets-ms-core";
import { PermissionRequest } from "nodets-ms-core/lib/core/auth/model/permission_request";
import _ from "lodash";
import { InputException } from "../exceptions/http/http-exceptions";
import AdmZip from "adm-zip";

export class Utility {

    /**
     * Basic SQL injection check
     * @param obj
     */
    public static checkForSqlInjection(obj: any) {
        const harmfulKeywords = [';', 'DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', '--'];

        for (let key in obj) {
            if (typeof obj[key] === 'string') {
                for (let keyword of harmfulKeywords) {
                    if (obj[key].toUpperCase().includes(keyword)) {
                        throw new InputException(`Harmful keyword found in input : ${key}`);
                    }
                }
            } else if (Array.isArray(obj[key])) {
                for (let item of obj[key]) {
                    if (typeof item === 'string') {
                        for (let keyword of harmfulKeywords) {
                            if (item.toUpperCase().includes(keyword)) {
                                throw new InputException(`Harmful keyword found in input : ${key}`);
                            }
                        }
                    }
                }
            }
        }
    }

    public static stringArrayToDBString(input: string[] | string): string {
        if (Array.isArray(input)) {
            return input.join(",");
        }
        return `"${input}"`;
    }

    /**
     * Authorizes the roles for a user in a TDEI project group.
     * 
     * @param user_id - The ID of the user.
     * @param tdei_project_group_id - The ID of the TDEI project group.
     * @param approvedRoles - An array of approved roles.
     * @returns A Promise that resolves to a boolean indicating whether the user is authorized or not.
     */
    public static async authorizeRoles(user_id: string, tdei_project_group_id: string, approvedRoles: string[]): Promise<Boolean> {
        const authProvider = Core.getAuthorizer({ provider: "Hosted", apiUrl: environment.authPermissionUrl });
        const permissionRequest = new PermissionRequest({
            userId: user_id as string,
            projectGroupId: tdei_project_group_id,
            permssions: approvedRoles,
            shouldSatisfyAll: false
        });

        try {
            const response = await authProvider?.hasPermission(permissionRequest);
            if (response) {
                return true;
            }
            else {
                return false;
            }
        }
        catch (error) {
            return false;
        }
    }

    /**
     * Retrieves the MIME type based on the file extension.
     * @param extension - The file extension.
     * @returns The corresponding MIME type.
     */
    public static getMimeType(extension: string): string {
        const mimeTypes: { [key: string]: string } = {
            'txt': 'text/plain',
            'json': 'application/json',
            'zip': 'application/zip',
            'xml': 'application/xml'
        };

        return mimeTypes[extension];
    }

    public static async generateSecret(): Promise<string> {
        let secret = null;
        try {
            const result = await fetch(environment.secretGenerateUrl as string, {
                method: 'get'
            });

            if (result.status != undefined && result.status != 200)
                throw new Error(await result.text());

            const data = await result.text();

            secret = data;
        } catch (error: any) {
            console.error(error);
            throw new HttpException(400, "Failed to generate secret token");
        }
      return secret;
    }

    static calculateTotalSize(files: Express.Multer.File[]): number {
        return files.reduce((total, file) => {
          const zip = new AdmZip(file.buffer);
          const zipEntries = zip.getEntries();

          let fileSize = 0;
          zipEntries.forEach((entry) => {
              if (!entry.isDirectory) {
                  fileSize += entry.header.size;
              }
          });

          return total + fileSize;
      }, 0);
    }
}

/**
 * Stream reader for FileEntity. Needed for zip download of
 * the files.
 */
export class FileEntityStream extends Readable {
    constructor(private fileEntity: FileEntity) {
        super();
    }

    async _read(size: number): Promise<void> {
        const fileStream = await this.fileEntity.getStream();

        fileStream.on('data', (chunk) => {
            if (!this.push(chunk)) {
                // If the internal buffer is full, pause until the consumer is ready
                fileStream.pause();
            }
        });

        fileStream.on('end', () => {
            this.push(null); // No more data to push
        });

        fileStream.on('error', (err) => {
            this.emit('error', err);
        });
    }
}
