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
            // We output to a temp file 'response_phase1' to analyze it.
            const phase1File = path.join(STORAGE_DIR, `phase1_${Date.now()}`);

            console.log('Phase 1: Fetching initial URL to check for warning/cookie...');
            // We use the canonical "Export" URL which typically redirects to the warning page 
            // with a properly formatted link containing the confirm token.
            const targetUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

            const phase1 = spawn('curl', [
                '-s', // Silent
                '-c', cookiePath, // Save jar
                '-L', // Follow redirects
                '-o', phase1File, // Output to temp file
                targetUrl
            ]);

            phase1.on('close', (code) => {
                if (code !== 0) {
                    if (fs.existsSync(phase1File)) fs.unlinkSync(phase1File);
                    return reject(new Error('Curl phase 1 failed'));
                }

                // Read content of phase1File to check for "confirm=" or if it is already the binary
                // To be safe for large binary, we should read only first 4KB? 
                // But if it IS the full binary, reading it all into memory is bad.
                // Let's use 'file' command to check what phase1File is.

                const mimeCheck = spawn('file', ['--mime-type', '-b', phase1File]);
                let mimeType = '';
                mimeCheck.stdout.on('data', (d) => mimeType += d.toString().trim());

                mimeCheck.on('close', (mimeCode) => {
                    if (mimeCode !== 0) {
                        if (fs.existsSync(phase1File)) fs.unlinkSync(phase1File);
                        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                        return reject(new Error(`Failed to determine MIME type of phase1File.`));
                    }

                    // CASE A: It is confirmed Video (Small file) or other binary
                    if (mimeType.includes('video/') || mimeType.includes('application/octet-stream') || mimeType.includes('audio/')) {
                        console.log('Phase 1 downloaded the file directly (Small file).');
                        fs.renameSync(phase1File, filePath);
                        // Check size
                        const stats = fs.statSync(filePath);
                        if (stats.size === 0) {
                            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                            if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                            return reject(new Error('Phase 1 download resulted in empty file. Check File ID/Permissions.'));
                        }
                        console.log(`Download success: ${filePath} (${stats.size} bytes, Type: ${mimeType})`);
                        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                        resolve(filePath);
                        return;
                    }

                    // CASE B: It is HTML (likely warning) or text
                    // Search for confirm token
                    // Read file content safely (it's text)
                    let htmlContent = '';
                    try {
                        htmlContent = fs.readFileSync(phase1File, 'utf8');
                    } catch (readErr: any) {
                        if (fs.existsSync(phase1File)) fs.unlinkSync(phase1File);
                        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                        return reject(new Error(`Could not read phase1File content: ${readErr.message}`));
                    }

                    const confirmMatch = htmlContent.match(/confirm=([^&"]+)/);
                    let confirmToken = confirmMatch ? confirmMatch[1] : null;

                    if (!confirmToken) {
                        console.warn('Phase 1 HTML detected but no confirm token regex match. Trying default "t"...');
                        confirmToken = 't';
                    }

                    if (confirmToken) {
                        console.log(`GDrive Large File detected. Confirm token found/used: ${confirmToken}`);
                        const finalUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirmToken}`;

                        console.log(`Phase 2: Downloading binary with confirm token...`);
                        const phase2 = spawn('curl', [
                            '-L',
                            '-b', cookiePath, // Load cookies
                            '-o', filePath,
                            finalUrl
                        ]);

                        phase2.on('close', (code2) => {
                            if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                            if (fs.existsSync(phase1File)) fs.unlinkSync(phase1File); // Clean temp

                            if (code2 === 0) {
                                // Final Validation
                                const stats = fs.statSync(filePath);
                                if (stats.size === 0) {
                                    reject(new Error('Phase 2 download resulted in empty file. Check File ID/Permissions.'));
                                } else {
                                    // Verify MIME again to be sure
                                    const finalMimeCheck = spawn('file', ['--mime-type', '-b', filePath]);
                                    let finalMimeType = '';
                                    finalMimeCheck.stdout.on('data', (d) => finalMimeType += d.toString().trim());

                                    finalMimeCheck.on('close', (finalMimeCode) => {
                                        if (finalMimeCode !== 0 || finalMimeType.includes('text/html') || finalMimeType.includes('text/plain')) {
                                            console.error(`Download failed validation. Final MIME: ${finalMimeType}`);
                                            const contentPreview = fs.readFileSync(filePath, 'utf8').slice(0, 500);
                                            console.error('File content preview:', contentPreview);
                                            fs.unlinkSync(filePath);
                                            reject(new Error(`Download failed. Final file is HTML/Text (likely error page), not expected binary. Content: ${contentPreview.slice(0, 100)}...`));
                                        } else {
                                            console.log(`Download success: ${filePath} (${stats.size} bytes, Type: ${finalMimeType})`);
                                            resolve(filePath);
                                        }
                                    });
                                }
                            } else {
                                reject(new Error(`Phase 2 curl failed with code ${code2}`));
                            }
                        });

                    } else {
                        // HTML but no confirm token?
                        console.error('Phase 1 returned HTML but no confirm token found.');
                        if (fs.existsSync(phase1File)) fs.unlinkSync(phase1File);
                        if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
                        reject(new Error(`Download failed. GDrive returned HTML (${mimeType}) but no confirm token. Check if file is Public or if the ID is correct.`));
                    }
                });
            });

            phase1.on('error', (err) => reject(err));
        });
    }
}

export const downloader = new DownloaderService();
