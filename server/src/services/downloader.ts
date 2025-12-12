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
        const cookiePath = path.join(STORAGE_DIR, `cookie_${Date.now()}.txt`);

        // Remove old file if exists
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        console.log(`Starting download for File ID: ${fileId} using Curl...`);

        return new Promise((resolve, reject) => {
            // Step 1: Request to get cookie and potentially check for confirm token
            // We use curl to fetch the page content and save cookies
            const phase1 = spawn('curl', [
                '-s', // Silent
                '-c', cookiePath, // Save jar
                '-L', // Follow redirects
                `https://drive.google.com/uc?export=download&id=${fileId}`
            ]);

            let outputData = '';
            phase1.stdout.on('data', (data) => { outputData += data.toString(); });

            phase1.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error('Curl phase 1 failed'));
                }

                // Step 2: Check for 'confirm' token in the output
                // HTML response might contain: href="/uc?export=download&id=xxx&confirm=yyy"
                const confirmMatch = outputData.match(/confirm=([a-zA-Z0-9_-]+)/);
                const confirmToken = confirmMatch ? confirmMatch[1] : null;

                let finalUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                if (confirmToken) {
                    console.log(`GDrive Large File detected. Confirm token found: ${confirmToken}`);
                    finalUrl += `&confirm=${confirmToken}`;
                }

                console.log(`Phase 2: Downloading binary...`);

                // Step 3: Download binary using the cookie
                const phase2 = spawn('curl', [
                    '-L',
                    '-b', cookiePath, // Load cookies
                    '-o', filePath,
                    finalUrl
                ]);

                // Optional: Pipe progress to console?
                // phase2.stderr.pipe(process.stderr);

                phase2.on('close', (code2) => {
                    // Cleanup cookie
                    if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);

                    if (code2 === 0) {
                        // Verify file size > 0
                        const stats = fs.statSync(filePath);
                        if (stats.size === 0) {
                            reject(new Error('Download resulted in empty file. Check File ID/Permissions.'));
                            return;
                        }

                        // Verify MIME type using 'file' command
                        const mimeCheck = spawn('file', ['--mime-type', '-b', filePath]);
                        let mimeType = '';
                        mimeCheck.stdout.on('data', (d) => mimeType += d.toString().trim());

                        mimeCheck.on('close', (mimeCode) => {
                            if (mimeType.includes('text/html') || mimeType.includes('text/plain')) {
                                // It's likely an error page saved as .mp4
                                console.error(`Download failed validation. MIME: ${mimeType}`);
                                // Try to read first few lines to see error
                                const content = fs.readFileSync(filePath, 'utf8').slice(0, 500);
                                console.error('File content preview:', content);

                                fs.unlinkSync(filePath);
                                reject(new Error(`Download failed. file is HTML/Text (likely error page), not video. Content: ${content.slice(0, 100)}...`));
                            } else {
                                console.log(`Download success: ${filePath} (${stats.size} bytes, Type: ${mimeType})`);
                                resolve(filePath);
                            }
                        });
                    } else {
                        reject(new Error(`Curl download failed with code ${code2}`));
                    }
                });
            });

            phase1.on('error', (err) => reject(err));
        });
    }
}

export const downloader = new DownloaderService();
