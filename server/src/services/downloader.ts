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
        // Standard GDrive Download URL
        // Initialize downloadUrl with the original url
        let downloadUrl = url;

        const gdriveMatch = url.match(/\/file\/d\/([^/]+)/);
        let fileId = '';
        if (gdriveMatch && gdriveMatch[1]) {
            fileId = gdriveMatch[1];
            downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        }

        try {
            let response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream', // Start as stream, but we might read it if it's HTML
                validateStatus: (status) => status < 400
            });

            // Check content type
            const contentType = response.headers['content-type'];

            if (contentType && contentType.includes('text/html')) {
                // It's likely the virus scan warning. We need to parse the HTML to find the confirmation link/token.
                // We need to convert the stream to text to parse it.
                const html = await streamToString(response.data);

                // Look for: href="/uc?export=download&id=FILE_ID&confirm=XXXX"
                // Regex to find 'confirm' query param
                const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/);

                if (confirmMatch && confirmMatch[1]) {
                    const confirmCode = confirmMatch[1];
                    console.log(`GDrive Virus Warning detected. Retrying with confirm code: ${confirmCode}`);

                    const newUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmCode}`;

                    response = await axios({
                        url: newUrl,
                        method: 'GET',
                        responseType: 'stream',
                        validateStatus: (status) => status < 400
                    });
                } else {
                    console.error('GDrive HTML received but no confirm code found.');
                    // It might be a private file or 404 page disguised as 200
                    throw new Error('GDrive file is not directly downloadable. Ensure it is Public and not restricted.');
                }
            }

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });
        } catch (error: any) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            throw new Error(`Download failed: ${error.message}`);
        }
    }
}

// Helper to read stream to string (for HTML parsing)
function streamToString(stream: any): Promise<string> {
    const chunks: any[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk: any) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err: any) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}


export const downloader = new DownloaderService();

