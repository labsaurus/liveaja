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
        // Remove old file if exists
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        const scriptPath = path.join(__dirname, '../scripts/download.sh');

        // Ensure script is executable
        try {
            fs.chmodSync(scriptPath, '755');
        } catch (e) {
            console.warn('Failed to chmod script:', e);
        }

        console.log(`Starting Download via Script for File ID: ${fileId}...`);

        return new Promise((resolve, reject) => {
            const process = spawn('bash', [scriptPath, fileId, filePath]);

            // Log stderr/stdout for debug
            process.stdout.on('data', (data) => console.log(`[Script]: ${data.toString().trim()}`));
            process.stderr.on('data', (data) => console.log(`[Script Error]: ${data.toString().trim()}`));

            process.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Download script failed with code ${code}`));
                } else {
                    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                        console.log(`Download success: ${filePath}`);
                        resolve(filePath);
                    } else {
                        reject(new Error('Download script finished but file is missing or empty.'));
                    }
                }
            });
        });
    }
}

export const downloader = new DownloaderService();
