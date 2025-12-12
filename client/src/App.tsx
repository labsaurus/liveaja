import { useEffect, useState, useRef } from 'react';
import './App.css';
import { type Channel, getChannels, createChannel, startStream, stopStream, importVideo, deleteChannel, getLogs, updateChannel } from './api';

function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [importTargetId, setImportTargetId] = useState<number | null>(null);
  const [logViewerTargetId, setLogViewerTargetId] = useState<number | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Channel | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsInterval = useRef<any>(null);

  // Poll for updates
  useEffect(() => {
    fetchChannels();
    const interval = setInterval(fetchChannels, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchChannels = async () => {
    try {
      const data = await getChannels();
      setChannels(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    await createChannel({
      name: formData.get('name') as string,
      rtmp_url: formData.get('rtmp_url') as string,
      rtmp_key: formData.get('rtmp_key') as string,
    });
    setShowCreateModal(false);
    fetchChannels();
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTargetId) return;
    const formData = new FormData(e.target as HTMLFormElement);
    await importVideo(importTargetId, formData.get('url') as string);
    setImportTargetId(null);
    fetchChannels(); // Trigger update to see Downloading status
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    await deleteChannel(id);
    fetchChannels();
  };

  return (
    <div className="container">
      <header className="header">
        <h1>YouTube Stream Manager</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + New Channel
        </button>
      </header>

      <div className="channel-grid">
        {Array.isArray(channels) && channels.map(channel => (
          <div key={channel.id} className="card">
            <div className="card-header">
              <h3>{channel.name}</h3>
              <span className={`status-badge ${channel.is_active ? 'status-active' : 'status-idle'}`}>
                {channel.is_active ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>

            <div className="card-body">
              <p>RTMP: {channel.rtmp_url}</p>
              <div style={{ marginTop: '0.5rem' }}>
                <strong>Source:</strong>
                {channel.download_status === 'READY' ? <span style={{ color: 'var(--success)' }}> Ready</span> :
                  channel.download_status === 'DOWNLOADING' ? <span style={{ color: 'var(--warning)' }}> Downloading...</span> :
                    channel.download_status === 'ERROR' ? <span style={{ color: 'var(--danger)' }}> Error</span> :
                      ' No Video'}
              </div>
              {channel.last_error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{channel.last_error}</p>}
            </div>

            <div className="card-footer">
              {!channel.is_active ? (
                <button
                  className="btn btn-primary"
                  onClick={() => startStream(channel.id)}
                  disabled={channel.download_status !== 'READY'}
                >
                  Start
                </button>
              ) : (
                <button className="btn btn-danger" onClick={() => stopStream(channel.id)}>
                  Stop
                </button>
              )}

              <button className="btn" onClick={() => setImportTargetId(channel.id)}>
                Import
              </button>
              <button className="btn btn-danger" style={{ marginLeft: 'auto' }} onClick={() => handleDelete(channel.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Create Channel</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Name</label>
                <input name="name" required />
              </div>
              <div className="form-group">
                <label>RTMP URL</label>
                <input name="rtmp_url" defaultValue="rtmp://a.rtmp.youtube.com/live2" required />
              </div>
              <div className="form-group">
                <label>Stream Key</label>
                <input name="rtmp_key" required />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importTargetId && (
        <div className="modal-overlay" onClick={() => setImportTargetId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Import Video from Google Drive</h2>
            <p style={{ marginBottom: '1rem', color: '#94a3b8' }}>
              Ensure the file is PUBLIC (Anyone with link can view).
            </p>
            <form onSubmit={handleImport}>
              <div className="form-group">
                <label>Google Drive File ID</label>
                <input name="url" placeholder="e.g. 1VqYtwEElyceBUgZf1_Nfc2zIpkQccKVX" required />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                Paste ONLY the File ID, not the full link.<br />
                Example: <code>1VqYtwEElyceBUgZf1_Nfc2zIpkQccKVX</code>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn" onClick={() => setImportTargetId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Import & Download</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
