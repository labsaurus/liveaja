import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

const STORAGE_DIR = path.join(__dirname, '../../storage');
fs.ensureDirSync(STORAGE_DIR);

export class DownloaderService {
    /**
     * Downloads a file from a URL and saves it to the storage directory.
     * Returns the local file path.
     */
    async downloadFile(url: string, filename: string): Promise<string> {
        const filePath = path.join(STORAGE_DIR, filename);
        const writer = fs.createWriteStream(filePath);

        // Convert GDrive View URL to Download URL (Basic heuristic)
        // https://drive.google.com/file/d/FILE_ID/view -> https://drive.google.com/uc?export=download&id=FILE_ID
        let downloadUrl = url;
        const gdriveMatch = url.match(/\/file\/d\/([^/]+)/);
        if (gdriveMatch && gdriveMatch[1]) {
            downloadUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
        }

        try {
            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Download failed: ${error}`);
        }
    }
}

export const downloader = new DownloaderService();
