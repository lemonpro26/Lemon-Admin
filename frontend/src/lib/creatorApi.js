import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const CREATOR_TOKEN_KEY = 'lp_creator_token';
export const getCreatorToken = () => localStorage.getItem(CREATOR_TOKEN_KEY) || '';
export const setCreatorToken = (t) => { if (t) localStorage.setItem(CREATOR_TOKEN_KEY, t); };
export const clearCreatorToken = () => localStorage.removeItem(CREATOR_TOKEN_KEY);

export const creatorApi = axios.create({ baseURL: API });

creatorApi.interceptors.request.use((config) => {
  const token = getCreatorToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// File URL for <img>/<video> tags (token passed as query param since tags can't set headers).
export const creativeFileUrl = (id, token) => `${API}/creatives/${id}/file?auth=${token || getCreatorToken()}`;
