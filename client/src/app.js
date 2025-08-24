import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TeamProvider } from './context/TeamContext';
import { CompanyProvider } from './context/CompanyContext';
import { useAuth } from './context/AuthContext';
import webSocketService from './services/websocket';




// Import your components
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import TeamSettings from './pages/TeamSettings';
import StandupForm from './pages/StandupForm';
import SprintPlanning from './pages/SprintPlanning';
import Retrospective from './pages/Retrospective';
import PrivateRoute from './components/PrivateRoute';
import SprintManagement from './pages/SprintManagement';
import Analytics from './pages/Analytics';
import BlockerManagement from './pages/BlockerManagement';
import CompanySelector from './components/CompanySelector';
import CreateCompany from './components/CreateCompany';
import AdminCompanyCreator from './components/AdminCompanyCreator';

// WebSocket Connection Component
function WebSocketManager() {
  const { currentUser } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  useEffect(() => {
    if (currentUser) {
      console.log('🔌 User logged in, connecting WebSocket...');
      webSocketService.connect();
      
      // Check connection status every 5 seconds
      const statusInterval = setInterval(() => {
        const status = webSocketService.getConnectionStatus(); // returns 'Connected' | 'Disconnected'
        setConnectionStatus(status === 'Connected' ? 'connected' : 'disconnected');
      }, 5000);

      // Test ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        // Emits a 'ping' if connected and returns true; otherwise no-op
        webSocketService.testConnection();
      }, 30000);

      return () => {
        clearInterval(statusInterval);
        clearInterval(pingInterval);
        console.log('🔌 User logged out, disconnecting WebSocket...');
        webSocketService.disconnect();
      };
    }
  }, [currentUser]);

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
        
        {/* Protected Routes - using PrivateRoute wrapper */}
        <Route element={<PrivateRoute />}>
          <Route path="/company/select" element={<CompanySelector />} />
          <Route path="/company/create" element={<CreateCompany />} />
          <Route path="/company/join" element={<AdminCompanyCreator />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/teams" element={<TeamSettings />} />
          <Route path="/standup" element={<StandupForm />} />
          <Route path="/sprint-planning" element={<SprintPlanning />} />
          <Route path="/sprint-management" element={<SprintManagement />} />
          <Route path="/retrospectives" element={<Retrospective />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/blockers" element={<BlockerManagement />} />
        </Route>
        
        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <TeamProvider>
          <Router>
            <AppContent />
          </Router>
        </TeamProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}

export default App;