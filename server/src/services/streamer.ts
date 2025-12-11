import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs-extra';
import db from '../db';
import { ChildProcess } from 'child_process';

interface StreamSession {
    process: ffmpeg.FfmpegCommand;
    startTime: Date;
    logs: string[];
}

const activeStreams: Map<number, StreamSession> = new Map();
// Store logs even after stream stops (until restart)
const recentLogs: Map<number, string[]> = new Map();

export class StreamManager {

    getLogs(channelId: number): string[] {
        return activeStreams.get(channelId)?.logs || recentLogs.get(channelId) || [];
    }

    private appendLog(channelId: number, message: string) {
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] ${message}`;

        // Update active stream logs
        if (activeStreams.has(channelId)) {
            const session = activeStreams.get(channelId)!;
            session.logs.push(logLine);
            if (session.logs.length > 50) session.logs.shift(); // Keep last 50
        }

        // Update recent logs cache
        if (!recentLogs.has(channelId)) recentLogs.set(channelId, []);
        const logs = recentLogs.get(channelId)!;
        logs.push(logLine);
        if (logs.length > 50) logs.shift();
    }

    startStream(channelId: number) {
        if (activeStreams.has(channelId)) {
            throw new Error('Stream is already running');
        }

        const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId) as any;
        if (!channel) throw new Error('Channel not found');
        if (!channel.video_source_path) throw new Error('No video source configured');
        if (!fs.existsSync(channel.video_source_path)) throw new Error('Video file not found');

        // Construct Full RTMP URL
        const rtmpEntry = `${channel.rtmp_url}/${channel.rtmp_key}`;

        this.appendLog(channelId, `Starting stream... Source: ${channel.video_source_path}`);

        const cmd = ffmpeg(channel.video_source_path)
            .inputOptions([
                '-re', // Read input at native frame rate (important for streaming static file)
                '-stream_loop', '-1' // Loop infinitely at input level
            ])
            .videoCodec('libx264')
            .audioCodec('aac')
            .format('flv')
            .outputOptions([
                '-preset', 'veryfast',
                '-g', '60', // Keyframe interval (2s for 30fps)
                '-b:v', '3000k',
                '-bufsize', '6000k',
                '-maxrate', '3000k'
            ])
            .output(rtmpEntry)
            .on('start', (commandLine) => {
                this.appendLog(channelId, 'Spawned FFmpeg process');
                console.log('Spawned FFmpeg with command: ' + commandLine);
                db.prepare('UPDATE channels SET is_active = 1 WHERE id = ?').run(channelId);
            })
            .on('error', (err, stdout, stderr) => {
                this.appendLog(channelId, `ERROR: ${err.message}`);
                this.appendLog(channelId, `STDERR: ${stderr}`);
                console.error('FFmpeg error:', err.message);

                // If it crashes, update DB
                db.prepare('UPDATE channels SET is_active = 0, last_error = ? WHERE id = ?').run(err.message, channelId);
                activeStreams.delete(channelId);
            })
            .on('end', () => {
                this.appendLog(channelId, 'Stream ended intentionally or input finished.');
                console.log('Stream ended');
                db.prepare('UPDATE channels SET is_active = 0 WHERE id = ?').run(channelId);
                activeStreams.delete(channelId);
            });

        cmd.run();

        activeStreams.set(channelId, {
            process: cmd,
            startTime: new Date(),
            logs: [] // Initialize logs
        });
    }

    stopStream(channelId: number) {
        const session = activeStreams.get(channelId);
        if (!session) {
            // It might be marked active in DB but process is gone (server restart/crash)
            // Just update DB to be safe
            db.prepare('UPDATE channels SET is_active = 0 WHERE id = ?').run(channelId);
            return; // Not running
        }

        try {
            session.process.kill('SIGKILL');
        } catch (e) {
            console.error('Error killing process:', e);
        }

        activeStreams.delete(channelId);
        db.prepare('UPDATE channels SET is_active = 0 WHERE id = ?').run(channelId);
        console.log(`Stopped stream for channel ${channelId}`);
    }

    stopAll() {
        for (const id of activeStreams.keys()) {
            this.stopStream(id);
        }
    }
}

export const streamManager = new StreamManager();
