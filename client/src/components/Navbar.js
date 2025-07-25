import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';

function Navbar() {
  const { logout } = useAuth();
  const { currentTeam } = useTeam();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out');
    }
  };

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-bold">Upstand</Link>
            <div className="flex space-x-4">
              <Link to="/dashboard" className="hover:text-blue-200">Dashboard</Link>
              <Link to="/standup" className="hover:text-blue-200">Standup</Link>
              <Link to="/sprint-planning" className="hover:text-blue-200">Sprints</Link>
              <Link to="/retrospective" className="hover:text-blue-200">Retro</Link>
              <Link to="/team-settings" className="hover:text-blue-200">Teams</Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {currentTeam && (
              <span className="text-sm">Team: {currentTeam.name}</span>
            )}
            <button onClick={handleLogout} className="hover:text-blue-200">
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;