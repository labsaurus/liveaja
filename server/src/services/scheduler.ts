import db from '../db';
import { streamManager } from './streamer';

export class SchedulerService {
  constructor() {
    // Check every minute
    setInterval(() => this.checkSchedules(), 60000);
    this.checkSchedules(); // Also check on startup
    console.log('Scheduler service started');
  }

  checkSchedules() {
    const channels = db.prepare('SELECT * FROM channels WHERE schedule_start_time IS NOT NULL AND schedule_stop_time IS NOT NULL').all() as any[];
    
    const now = new Date();
    const currentHHMM = now.toTimeString().slice(0, 5); // "14:30"

    for (const channel of channels) {
      if (!channel.video_source_path || channel.download_status !== 'READY') continue;

      const { id, name, is_active, schedule_start_time, schedule_stop_time } = channel;
      
      const shouldBeRunning = this.isTimeInRange(currentHHMM, schedule_start_time, schedule_stop_time);

      if (shouldBeRunning && !is_active) {
        console.log(`[Scheduler] Starting channel ${name} (${id}) at ${currentHHMM}`);
        try {
            streamManager.startStream(id);
        } catch (e) { console.error(`[Scheduler] Failed to start ${name}:`, e); }
      } else if (!shouldBeRunning && is_active) {
        console.log(`[Scheduler] Stopping channel ${name} (${id}) at ${currentHHMM}`);
        try {
            streamManager.stopStream(id);
        } catch (e) { console.error(`[Scheduler] Failed to stop ${name}:`, e); }
      }
    }
  }

  isTimeInRange(current: string, start: string, end: string): boolean {
    if (start < end) {
        // e.g. 08:00 to 17:00
        return current >= start && current < end;
    } else {
        // e.g. 22:00 to 06:00 (Overnight)
        return current >= start || current < end;
    }
  }
}

export const scheduler = new SchedulerService();
