import { Router } from 'express';
import db from '../db';
import { RunResult } from 'better-sqlite3';
import { downloader } from '../services/downloader';
import { streamManager } from '../services/streamer';
import path from 'path';

const router = Router();

// Get all channels
router.get('/', (req, res) => {
    try {
        const channels = db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
        res.json(channels);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create channel
router.post('/', (req, res) => {
    const { name, rtmp_url, rtmp_key } = req.body;
    if (!name || !rtmp_url || !rtmp_key) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const stmt = db.prepare('INSERT INTO channels (name, rtmp_url, rtmp_key) VALUES (?, ?, ?)');
        const info: RunResult = stmt.run(name, rtmp_url, rtmp_key);
        res.status(201).json({ id: info.lastInsertRowid, name, rtmp_url, rtmp_key });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update channel
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name, rtmp_url, rtmp_key, video_source_path, looping_enabled } = req.body;

    try {
        const stmt = db.prepare(`
      UPDATE channels 
      SET name = COALESCE(?, name),
          rtmp_url = COALESCE(?, rtmp_url),
          rtmp_key = COALESCE(?, rtmp_key),
          video_source_path = COALESCE(?, video_source_path),
          looping_enabled = COALESCE(?, looping_enabled)
      WHERE id = ?
    `);

        const info = stmt.run(name, rtmp_url, rtmp_key, video_source_path, looping_enabled, id);
        if (info.changes === 0) return res.status(404).json({ error: 'Channel not found' });

        res.json({ message: 'Channel updated' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete channel
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    try {
        const stmt = db.prepare('DELETE FROM channels WHERE id = ?');
        const info = stmt.run(id);
        if (info.changes === 0) return res.status(404).json({ error: 'Channel not found' });
        res.json({ message: 'Channel deleted' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Import video from GDrive
router.post('/:id/import-video', async (req, res) => {
    const { id } = req.params;
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: 'Missing GDrive URL' });

    try {
        // Check if channel exists
        const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as any;
        if (!channel) return res.status(404).json({ error: 'Channel not found' });

        // Update status to DOWNLOADING
        db.prepare("UPDATE channels SET download_status = 'DOWNLOADING', last_error = NULL WHERE id = ?").run(id);

        // Start download async
        const filename = `video_${id}_${Date.now()}.mp4`;

        // Respond immediately
        res.json({ message: 'Download started', filename });

        // Process download
        try {
            const filePath = await downloader.downloadFile(url, filename);
            db.prepare("UPDATE channels SET download_status = 'READY', video_source_path = ? WHERE id = ?").run(filePath, id);
            console.log(`Download complete for channel ${id}: ${filePath}`);
        } catch (err: any) {
            console.error(`Download error for channel ${id}:`, err);
            db.prepare("UPDATE channels SET download_status = 'ERROR', last_error = ? WHERE id = ?").run(err.message, id);
        }

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start Stream
router.post('/:id/start', (req, res) => {
    const { id } = req.params;
    try {
        streamManager.startStream(Number(id));
        res.json({ message: 'Stream started' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Stop Stream
router.post('/:id/stop', (req, res) => {
    const { id } = req.params;
    try {
        streamManager.stopStream(Number(id));
        res.json({ message: 'Stream stopped' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
