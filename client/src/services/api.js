/**
 * API Service
 * Handles all API calls to the Flask backend
 */

import axios from 'axios';
import { auth } from '../firebase';

// Debug environment variables
console.log('Environment Variables Debug:');
console.log('REACT_APP_API_BASE_URL:', process.env.REACT_APP_API_BASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All REACT_APP vars:', Object.keys(process.env).filter(key => key.startsWith('REACT_APP')));

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