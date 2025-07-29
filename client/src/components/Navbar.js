import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useCompany } from '../context/CompanyContext';
import { colors } from '../utils/colors';

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
    <nav className="text-white shadow-lg border-b-2" 
         style={{backgroundColor: colors.secondary[500], borderBottomColor: colors.primary[200]}}>
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-bold hover:opacity-90 transition-opacity" 
                  style={{color: colors.primary[200]}}>
              Upstand
            </Link>
            <div className="flex space-x-6">
              <Link to="/dashboard" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Dashboard
              </Link>
              <Link to="/standup" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Standup
              </Link>
              <Link to="/sprint-planning" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.sprint.planning}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.sprint.planning + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Sprints
              </Link>
              <Link to="/retrospective" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.sprint.retrospective}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.sprint.retrospective + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Retro
              </Link>
              <Link to="/team-settings" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Teams
              </Link>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Company Selector */}
            {currentCompany && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                  className="flex items-center space-x-2 rounded-lg px-4 py-2 transition-all duration-200 border"
                  style={{
                    backgroundColor: colors.primary[200],
                    color: colors.secondary[500],
                    borderColor: colors.primary[300]
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = colors.primary[300];
                    e.target.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = colors.primary[200];
                    e.target.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="text-left">
                    <div className="text-xs opacity-70 font-medium">Company</div>
                    <div className="text-sm font-bold">{currentCompany.name}</div>
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
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border-2 z-50"
                       style={{borderColor: colors.primary[200]}}>
                    <div className="py-2">
                      <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                           style={{color: colors.secondary[400]}}>
                        Switch Company
                      </div>
                      {userCompanies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => {
                            switchCompany(company);
                            setShowCompanyDropdown(false);
                          }}
                          className="w-full text-left px-4 py-3 text-sm flex items-center justify-between transition-all duration-200"
                          style={currentCompany.id === company.id ? 
                            {backgroundColor: colors.primary[200], color: colors.secondary[500]} : 
                            {color: colors.neutral[700]}
                          }
                          onMouseEnter={(e) => {
                            if (currentCompany.id !== company.id) {
                              e.target.style.backgroundColor = colors.primary[50];
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (currentCompany.id !== company.id) {
                              e.target.style.backgroundColor = 'transparent';
                            }
                          }}
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
                      <div className="border-t mt-2 pt-2" style={{borderColor: colors.neutral[200]}}>
                        <Link
                          to="/company/join"
                          onClick={() => setShowCompanyDropdown(false)}
                          className="w-full text-left px-4 py-2 text-sm flex items-center transition-all duration-200 rounded-md mx-2"
                          style={{color: colors.secondary[500]}}
                          onMouseEnter={(e) => e.target.style.backgroundColor = colors.secondary[50]}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Join Company
                        </Link>
                        <Link
                          to="/company/create"
                          onClick={() => setShowCompanyDropdown(false)}
                          className="w-full text-left px-4 py-2 text-sm flex items-center transition-all duration-200 rounded-md mx-2"
                          style={{color: colors.accent.success}}
                          onMouseEnter={(e) => e.target.style.backgroundColor = colors.accent.success + '10'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
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
              <div className="hidden md:block px-3 py-2 rounded-lg border"
                   style={{backgroundColor: colors.primary[50], borderColor: colors.primary[200]}}>
                <span className="text-xs font-medium opacity-70" style={{color: colors.secondary[400]}}>Team:</span>
                <span className="text-sm font-bold ml-1" style={{color: colors.secondary[500]}}>{currentTeam.name}</span>
              </div>
            )}
            
            {/* Welcome Message */}
            <div className="flex items-center space-x-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium" style={{color: colors.primary[100]}}>Welcome, {displayName}</div>
                {currentUser?.email && (
                  <div className="text-xs opacity-70" style={{color: colors.primary[200]}}>{currentUser.email}</div>
                )}
              </div>
              
              {/* User Avatar */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200"
                   style={{
                     backgroundColor: colors.primary[200], 
                     borderColor: colors.primary[300],
                     color: colors.secondary[500]
                   }}>
                <span className="text-sm font-bold">
                  {initials}
                </span>
              </div>
              
              {/* Logout Button */}
              <button 
                onClick={handleLogout} 
                className="text-sm font-medium px-4 py-2 rounded-lg transition-all duration-200 border"
                style={{
                  color: colors.primary[200], 
                  borderColor: colors.primary[200] + '40',
                  backgroundColor: 'rgba(215, 196, 158, 0.1)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = colors.primary[200];
                  e.target.style.color = colors.secondary[500];
                  e.target.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'rgba(215, 196, 158, 0.1)';
                  e.target.style.color = colors.primary[200];
                  e.target.style.transform = 'translateY(0)';
                }}
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