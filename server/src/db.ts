import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs-extra';

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
fs.ensureDirSync(dataDir);

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });

// Initialize tables
export function initDB() {
  const createChannelsTable = `
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rtmp_url TEXT NOT NULL,
      rtmp_key TEXT NOT NULL,
      video_source_path TEXT,
      looping_enabled INTEGER DEFAULT 1,
      download_status TEXT DEFAULT 'IDLE', -- IDLE, DOWNLOADING, READY, ERROR
      last_error TEXT,
      schedule_start_time TEXT, -- HH:MM
      schedule_stop_time TEXT, -- HH:MM
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.exec(createChannelsTable);
  console.log('Database initialized');
}

export default db;
