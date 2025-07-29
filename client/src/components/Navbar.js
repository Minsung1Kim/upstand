import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useCompany } from '../context/CompanyContext';

function Navbar() {
  const { logout, currentUser, getUserProfile } = useAuth();
  const { currentTeam } = useTeam();
  const { userCompanies, currentCompany, switchCompany } = useCompany();
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowCompanyDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
            {/* Company Selector */}
            {currentCompany && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                  className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 rounded-lg px-3 py-2 transition-colors"
                >
                  <div className="text-left">
                    <div className="text-xs text-blue-200">Company</div>
                    <div className="text-sm font-medium">{currentCompany.name}</div>
                  </div>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showCompanyDropdown ? 'rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {showCompanyDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border z-50">
                    <div className="py-2">
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Switch Company
                      </div>
                      {userCompanies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => {
                            switchCompany(company);
                            setShowCompanyDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center justify-between ${
                            currentCompany.id === company.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                          }`}
                        >
                          <div>
                            <div className="font-medium">{company.name}</div>
                            <div className="text-xs text-gray-500">{company.role}</div>
                          </div>
                          {currentCompany.id === company.id && (
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      ))}
                      <div className="border-t border-gray-200 mt-2 pt-2">
                        <Link
                          to="/company/join"
                          onClick={() => setShowCompanyDropdown(false)}
                          className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Join Company
                        </Link>
                        <Link
                          to="/company/create"
                          onClick={() => setShowCompanyDropdown(false)}
                          className="w-full text-left px-4 py-2 text-sm text-green-600 hover:bg-green-50 flex items-center"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          Create Company
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

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