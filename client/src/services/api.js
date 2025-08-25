/**
 * API Service
 * Handles all API calls to the Flask backend
 */

import axios from 'axios';
import { auth } from '../firebase';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

// Request interceptor to add auth token and company context
api.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
      
      // Add company context if available
      const currentCompanyKey = `last_company_${user.uid}`;
      const currentCompanyId = localStorage.getItem(currentCompanyKey);
      if (currentCompanyId) {
        config.headers['X-Company-ID'] = currentCompanyId;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export const updateBlockerPriority = (id, severity) =>
  api.post(`/blockers/${id}/priority`, { severity });

export const resolveBlockerById = (id) =>
  api.post(`/blockers/${id}/resolve`);

// Sprint APIs
export const getSprintProgress = (teamId) =>
  api.get(`/api/sprint/progress`, { params: { team_id: teamId } });

export const getSprintBurndown = (teamId) =>
  api.get(`/api/sprint/burndown`, { params: { team_id: teamId } });

export const seedDemoSprint = (teamId) =>
  api.post(`/api/sprint/seed-demo`, { team_id: teamId });