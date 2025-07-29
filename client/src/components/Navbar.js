import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';

function Navbar() {
  const { logout, currentUser, getUserProfile } = useAuth();
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

  // Get user profile information
  const userProfile = getUserProfile();
  const displayName = userProfile?.firstName ? `${userProfile.firstName} ${userProfile.lastName}`.trim() : 'User';
  const initials = userProfile?.firstName ? 
    `${userProfile.firstName.charAt(0)}${userProfile.lastName.charAt(0)}`.toUpperCase() : 
    'U';

  return (
    <nav className="bg-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-bold">Upstand</Link>
            <div className="flex space-x-4">
              <Link to="/dashboard" className="hover:text-blue-200 transition-colors">Dashboard</Link>
              <Link to="/standup" className="hover:text-blue-200 transition-colors">Standup</Link>
              <Link to="/sprint-planning" className="hover:text-blue-200 transition-colors">Sprints</Link>
              <Link to="/retrospective" className="hover:text-blue-200 transition-colors">Retro</Link>
              <Link to="/team-settings" className="hover:text-blue-200 transition-colors">Teams</Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Current Team Display */}
            {currentTeam && (
              <div className="hidden md:block">
                <span className="text-sm text-blue-200">Team:</span>
                <span className="text-sm font-medium ml-1">{currentTeam.name}</span>
              </div>
            )}
            
            {/* Welcome Message */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium">Welcome, {displayName}</div>
                {currentUser?.email && (
                  <div className="text-xs text-blue-200">{currentUser.email}</div>
                )}
              </div>
              
              {/* User Avatar */}
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold">
                  {initials}
                </span>
              </div>
              
              {/* Logout Button */}
              <button 
                onClick={handleLogout} 
                className="hover:text-blue-200 transition-colors text-sm font-medium px-3 py-1 rounded hover:bg-blue-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;