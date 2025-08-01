import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import { useAuth } from './contexts/AuthContext';
import webSocketService from './services/websocket';

// Import your components
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import TeamSettings from './pages/TeamSettings';  // Fixed import name
import StandupForm from './pages/StandupForm';
import SprintPlanning from './pages/SprintPlanning';
import Retrospectives from './pages/Retrospectives';
import ProtectedRoute from './components/ProtectedRoute';

// WebSocket Connection Component
function WebSocketManager() {
  const { user } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    if (user) {
      console.log('🔌 User logged in, connecting WebSocket...');
      webSocketService.connect();
      
      // Check connection status every 5 seconds
      const statusInterval = setInterval(() => {
        const status = webSocketService.getConnectionStatus();
        setConnectionStatus(status.connected ? 'connected' : 'disconnected');
      }, 5000);

      // Test ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (webSocketService.isSocketConnected()) {
          webSocketService.ping();
        }
      }, 30000);

      return () => {
        clearInterval(statusInterval);
        clearInterval(pingInterval);
        console.log('🔌 User logged out, disconnecting WebSocket...');
        webSocketService.disconnect();
      };
    }
  }, [user]);

  // Show connection status in development
  if (process.env.NODE_ENV === 'development') {
    return (
      <div 
        style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          padding: '5px 10px',
          backgroundColor: connectionStatus === 'connected' ? '#10b981' : '#ef4444',
          color: 'white',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 9999
        }}
      >
        WebSocket: {connectionStatus}
      </div>
    );
  }

  return null;
}

function AppContent() {
  return (
    <div className="App">
      <WebSocketManager />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        {/* Protected Routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <Navigate to="/dashboard" replace />
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/teams" element={
          <ProtectedRoute>
            <TeamSettings />
          </ProtectedRoute>
        } />
        
        <Route path="/standup" element={
          <ProtectedRoute>
            <StandupForm />
          </ProtectedRoute>
        } />
        
        <Route path="/sprint-planning" element={
          <ProtectedRoute>
            <SprintPlanning />
          </ProtectedRoute>
        } />
        
        <Route path="/retrospectives" element={
          <ProtectedRoute>
            <Retrospectives />
          </ProtectedRoute>
        } />
        
        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <Router>
          <AppContent />
        </Router>
      </TeamProvider>
    </AuthProvider>
  );
}

export default App;