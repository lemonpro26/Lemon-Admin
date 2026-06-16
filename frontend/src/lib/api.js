import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const TOKEN_KEY = 'osgd_admin_token';
export const ROLE_KEY = 'osgd_admin_role';
export const USERNAME_KEY = 'osgd_admin_username';

export const getRole = () => localStorage.getItem(ROLE_KEY) || 'editor';
export const getUsername = () => localStorage.getItem(USERNAME_KEY) || 'owner';
// Editors and the owner can edit; view_only cannot.
export const canEdit = () => getRole() !== 'view_only';

export const setSession = ({ token, role, username }) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (role) localStorage.setItem(ROLE_KEY, role);
  if (username) localStorage.setItem(USERNAME_KEY, username);
};

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USERNAME_KEY);
};

api.interceptors.request.use((config) => {
  const url = config.url || '';
  const isAdmin = url.includes('/admin/') && !url.includes('/admin/login');
  if (isAdmin) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
