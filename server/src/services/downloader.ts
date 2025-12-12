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
            # Strategy 1: Direct Download via UserContent (matches user's successful script)
            echo "Attempting Direct Download from drive.usercontent.google.com..."
            curl -sL -b "${cookiePath}" -c "${cookiePath}" "https://drive.usercontent.google.com/download?id=${fileId}&export=download" -o "${filePath}"

            # Check if it is HTML (Virus Warning)
            if file -b --mime-type "${filePath}" | grep -q "text/html"; then
                echo "Direct download received HTML (likely warning). Switching to Confirm Token Strategy..."
                
                # Strategy 2: Get Confirm Token from generic UC URL
                # 1. Fetch warning page to get token
                CONFIRM_TOKEN=$(curl -sL -c "${cookiePath}" "https://drive.google.com/uc?export=download&id=${fileId}" | grep -oE 'confirm=[a-zA-Z0-9_]+' | head -n 1 | cut -d '=' -f 2)
                
                if [ -z "$CONFIRM_TOKEN" ]; then
                    # Fallback token
                    echo "No token found. Using default 't'..."
                    CONFIRM_TOKEN="t"
                fi

                # 2. Download with confirm token
                echo "Downloading with confirm token: $CONFIRM_TOKEN"
                curl -L -b "${cookiePath}" "https://drive.google.com/uc?export=download&confirm=$CONFIRM_TOKEN&id=${fileId}" -o "${filePath}"
            fi

            # Cleanup
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
