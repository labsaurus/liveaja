import axios from 'axios';

export interface Channel {
    id: number;
    name: string;
    rtmp_url: string;
    rtmp_key: string;
    video_source_path: string | null;
    looping_enabled: number;
    schedule_start_time: string | null;
    schedule_stop_time: string | null;
    download_status: 'IDLE' | 'DOWNLOADING' | 'READY' | 'ERROR';
    last_error: string | null;
    is_active: number;
    created_at: string;
}

// In production (Vite build), we don't have the proxy. 
// We start by assuming the backend is on port 3000 of the same host (as per deployment guide).
const getBaseUrl = () => {
    if (import.meta.env.DEV) return '/api';
    return `${window.location.protocol}//${window.location.hostname}:3000/api`;
};

const api = axios.create({
    baseURL: getBaseUrl()
});

export const getChannels = async () => {
    const res = await api.get<Channel[]>('/channels');
    return res.data;
};

export const createChannel = async (data: Partial<Channel>) => {
    const res = await api.post<Channel>('/channels', data);
    return res.data;
};

export const deleteChannel = async (id: number) => {
    await api.delete(`/channels/${id}`);
};

export const startStream = async (id: number) => {
    await api.post(`/channels/${id}/start`);
};

export const stopStream = async (id: number) => {
    await api.post(`/channels/${id}/stop`);
};

export const importVideo = async (id: number, url: string) => {
    await api.post(`/channels/${id}/import-video`, { url });
};

export const getLogs = async (id: number) => {
    const res = await api.get<string[]>(`/channels/${id}/logs`);
    return res.data;
};

export const updateChannel = async (id: number, data: Partial<Channel>) => {
    const res = await api.put(`/channels/${id}`, data);
    return res.data;
};
