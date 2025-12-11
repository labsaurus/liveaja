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
        // User reference script logic:
        // drive_url_download="https://drive.usercontent.google.com/download?id=$file_id&export=download"
        let downloadUrl = url;
        const gdriveMatch = url.match(/\/file\/d\/([^/]+)/);
        if (gdriveMatch && gdriveMatch[1]) {
            const fileId = gdriveMatch[1];
            downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
        }

        try {
            let response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream',
                validateStatus: (status) => status < 400
            });

            // Check for GDrive Virus Scan Warning (HTML response instead of binary)
            const contentType = response.headers['content-type'];
            if (contentType && contentType.includes('text/html')) {
                // Simple heuristic: Try to find the 'confirm' token in the cookie or link if possible, 
                // but robustly parsing the confirmation page is complex.
                // For now, we'll throw a clear error.
                console.error('Download returned HTML. Likely GDrive Virus Scan Warning.');
                throw new Error('GDrive download failed. File might be too large (virus scan warning) or not public. Use a direct link or smaller file.');
            }

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error: any) {
            // Clean up empty/corrupt file
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw new Error(`Download failed: ${error.message}`);
        }
    }
}

export const downloader = new DownloaderService();

