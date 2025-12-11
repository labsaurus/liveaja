import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs-extra';
import db from '../db';
import { ChildProcess } from 'child_process';

interface StreamSession {
    process: ffmpeg.FfmpegCommand;
    startTime: Date;
}

const activeStreams: Map<number, StreamSession> = new Map();

export class StreamManager {

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

        console.log(`Starting stream for channel ${channel.name} (${channelId})`);
        console.log(`Source: ${channel.video_source_path}`);
        console.log(`Target: ${channel.rtmp_url}`); // Don't log key fully

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
                console.log('Spawned FFmpeg with command: ' + commandLine);
                db.prepare('UPDATE channels SET is_active = 1 WHERE id = ?').run(channelId);
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg error:', err.message);
                console.error('Stderr:', stderr);
                // If it crashes, update DB
                db.prepare('UPDATE channels SET is_active = 0, last_error = ? WHERE id = ?').run(err.message, channelId);
                activeStreams.delete(channelId);
            })
            .on('end', () => {
                console.log('Stream ended');
                db.prepare('UPDATE channels SET is_active = 0 WHERE id = ?').run(channelId);
                activeStreams.delete(channelId);
            });

        cmd.run();

        activeStreams.set(channelId, {
            process: cmd,
            startTime: new Date()
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
