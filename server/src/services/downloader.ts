import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

const STORAGE_DIR = path.join(__dirname, '../../storage');
fs.ensureDirSync(STORAGE_DIR);

export class DownloaderService {
    /**
     * Downloads a file from GDrive using system 'curl'.
     * Requires 'curl' to be installed on the system.
     * Input: GDrive File ID (not URL)
      */
    async downloadFile(fileId: string, filename: string): Promise<string> {
        const filePath = path.join(STORAGE_DIR, filename);
        // Use /tmp for cookies to avoid cluttering storage, or use STORAGE_DIR for safety
        const cookiePath = path.join(STORAGE_DIR, `gdrive_cookie_${fileId}_${Date.now()}.txt`);

        // Remove old file if exists
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        console.log(`Starting Robust Shell Download for File ID: ${fileId}...`);

        // Construct the shell command exactly as requested but with proper paths
        // We use a safe delimiter for the shell command or just execute it as a big string.
        // Note: We mute stdout of the first curl slightly to avoid binary dumping if it works directly?
        // User's script piping to grep is fine for text, but might be heavy for binary.
        // However, we'll trust the user's "Robust" strategy for now.

        const command = `
            # 1. Get Confirm Token & Cookie
            # output of first curl is piped to grep. If it's binary, grep handles it (might say binary file matches).
            # We look for confirm=xxxx
            CONFIRM_TOKEN=$(curl -sL -c "${cookiePath}" "https://drive.google.com/uc?export=download&id=${fileId}" | grep -o 'confirm=[a-zA-Z0-9_]*' | head -n 1 | cut -d '=' -f 2)
            
            # 2. Download with Token (if any) and Cookie
            # If CONFIRM_TOKEN is empty, it just downloads without &confirm= (which works for small files usually)
            curl -L -b "${cookiePath}" "https://drive.google.com/uc?export=download&confirm=$CONFIRM_TOKEN&id=${fileId}" -o "${filePath}"
            
            # 3. Cleanup
            rm -f "${cookiePath}"
        `;

        return new Promise((resolve, reject) => {
            const process = spawn('bash', ['-c', command]);

            // Log stderr (curl progress/errors)
            process.stderr.on('data', (data) => console.log(`[Curl]: ${data.toString()}`));

            process.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Shell download failed with code ${code}`));
                } else {
                    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                        // Double check it's not HTML error
                        try {
                            const mimeCheck = spawn('file', ['--mime-type', '-b', filePath]);
                            let mimeType = '';
                            mimeCheck.stdout.on('data', (d) => mimeType += d.toString().trim());
                            mimeCheck.on('close', () => {
                                if (mimeType.includes('text/html')) {
                                    const content = fs.readFileSync(filePath, 'utf8').slice(0, 200);
                                    fs.unlinkSync(filePath);
                                    reject(new Error(`Download resulted in HTML (likely error): ${content}`));
                                } else {
                                    console.log(`Download success: ${filePath}`);
                                    resolve(filePath);
                                }
                            });
                        } catch (e) {
                            // Fallback if 'file' command missing
                            resolve(filePath);
                        }
                    } else {
                        reject(new Error('Download resulted in empty file'));
                    }
                }
            });
        });
    }
}

export const downloader = new DownloaderService();
