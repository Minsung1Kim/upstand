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
  const companyDropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
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

  const handleCompanySwitch = (company) => {
    switchCompany(company);
    setShowCompanyDropdown(false);
    // Force a page refresh to update all components with new company context
    window.location.reload();
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
              
              <Link to="/sprint-management" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.sprint?.planning || colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = (colors.sprint?.planning || colors.primary[200]) + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Sprints
              </Link>

              <Link to="/retrospectives" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.sprint?.retrospective || colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = (colors.sprint?.retrospective || colors.primary[200]) + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Retro
              </Link>

              <Link to="/blockers" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: '#ef4444'}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                 Blockers
              </Link>

              <Link to="/teams" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Teams
              </Link>
              <Link to="/analytics" 
                    className="px-3 py-2 rounded-md hover:bg-opacity-20 transition-all duration-200 font-medium"
                    style={{color: colors.primary[100]}}
                    onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}>
                Analytics
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Company Selector */}
            {currentCompany && userCompanies.length > 1 && (
              <div className="relative" ref={companyDropdownRef}>
                <button
                  onClick={() => setShowCompanyDropdown(!showCompanyDropdown)}
                  className="text-sm font-medium px-3 py-2 rounded-lg transition-all duration-200 border flex items-center space-x-1"
                  style={{
                    backgroundColor: colors.primary[200] + '20',
                    color: colors.primary[200],
                    borderColor: colors.primary[200] + '40'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[200] + '30'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = colors.primary[200] + '20'}
                >
                  <span>{currentCompany.name}</span>
                  <svg 
                    className={`w-4 h-4 transition-transform duration-200 ${showCompanyDropdown ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showCompanyDropdown && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border z-50"
                       style={{borderColor: colors.neutral[200]}}>
                    <div className="py-2">
                      <div className="px-4 py-2 text-xs font-medium border-b" 
                           style={{color: colors.neutral[500], borderColor: colors.neutral[200]}}>
                        Switch Company
                      </div>
                      {userCompanies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => handleCompanySwitch(company)}
                          className="w-full text-left px-4 py-3 flex items-center justify-between transition-all duration-200"
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
                          className="block px-4 py-2 text-sm transition-all duration-200"
                          style={{color: colors.neutral[600]}}
                          onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[50]}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          Join Another Company
                        </Link>
                        <button
                          onClick={() => {
                            setShowCompanyDropdown(false);
                            navigate('/company/create');
                          }}
                          className="block w-full text-left px-4 py-2 text-sm transition-all duration-200"
                          style={{color: colors.neutral[600]}}
                          onMouseEnter={(e) => e.target.style.backgroundColor = colors.primary[50]}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                        >
                          Create Company
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Team Selector */}
            {currentTeam && (
              <div 
                className="text-sm font-medium px-3 py-2 rounded-lg"
                style={{
                  backgroundColor: colors.primary[200] + '40',
                  color: colors.primary[200]
                }}
              >
                <div className="text-xs opacity-70">Team: </div>
                <div className="font-bold">{currentTeam.name}</div>
              </div>
            )}

            {/* User Info */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-sm font-medium" style={{color: colors.primary[200]}}>
                  Welcome, {displayName}
                </div>
                <div className="text-xs opacity-70" style={{color: colors.primary[100]}}>
                  {currentUser?.email || 'user@example.com'}
                </div>
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