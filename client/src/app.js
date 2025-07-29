/**
 * Upstand - AI-Powered Agile Scrum Assistant
 * Main React Application Component
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CompanyProvider } from './context/CompanyContext';
import { TeamProvider } from './context/TeamContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Navbar';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import StandupForm from './pages/StandupForm';
import SprintPlanning from './pages/SprintPlanning';
import Retrospective from './pages/Retrospective';
import TeamSettings from './pages/TeamSettings';

function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <TeamProvider>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                
                {/* Protected Routes */}
                <Route element={<PrivateRoute />}>
                  <Route element={<WithNavbar />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/standup" element={<StandupForm />} />
                    <Route path="/sprint-planning" element={<SprintPlanning />} />
                    <Route path="/retrospective" element={<Retrospective />} />
                    <Route path="/team-settings" element={<TeamSettings />} />
                    {/* Add redirect from /teams to /team-settings */}
                    <Route path="/teams" element={<Navigate to="/team-settings" replace />} />
                  </Route>
                </Route>
                
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
          </Router>
        </TeamProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}

// Layout wrapper with Navbar
function WithNavbar() {
  return (
    <> 
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </>
  );
}

export default App;