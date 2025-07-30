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
    console.log('🌐 API Request:', config.method?.toUpperCase(), config.url);
    console.log('🔗 Full URL:', config.baseURL + config.url);
    
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
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.log('❌ API Error:', error.response?.status, error.config?.url);
    console.log('Error details:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      // Handle unauthorized access
      auth.signOut();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;