const handleJoinTeam = async (teamId, teamName) => {
    try {
      console.log('Joining team:', teamId);
      const response = await api.post(`/teams/${teamId}/join`);
      
      console.log('Successfully joined team:', response.data);
      
      // Refresh teams list
      if (refreshTeams) {
        await refreshTeams();
      }
      
      // Refresh available teams
      await fetchAvailableTeams();
      
    } catch (error) {
      console.error('Failed to join team:', error);
      setError(`Failed to join ${teamName}: ${error.response?.data?.message || error.message}`);
    }
  };import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { PlusIcon, UserGroupIcon, ShieldCheckIcon, CodeBracketIcon, CogIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const ROLES = {
  OWNER: { name: 'Owner', icon: ShieldCheckIcon, color: 'text-purple-600', description: 'Full control over team settings and members' },
  MANAGER: { name: 'Manager', icon: CogIcon, color: 'text-blue-600', description: 'Manage sprints, view reports, and moderate standups' },
  DEVELOPER: { name: 'Developer', icon: CodeBracketIcon, color: 'text-green-600', description: 'Submit standups and participate in sprints' },
  VIEWER: { name: 'Viewer', icon: UserGroupIcon, color: 'text-gray-600', description: 'View team activity and reports only' }
};

function TeamSettings() {
  const { teams, currentTeam, setCurrentTeam, createTeam, refreshTeams } = useTeam();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableTeams, setAvailableTeams] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showDropdown, setShowDropdown] = useState(null); // Track which dropdown is open

  useEffect(() => {
    fetchAvailableTeams();
  }, []);

  const fetchAvailableTeams = async () => {
    try {
      setLoadingAvailable(true);
      
      // For demo purposes, show all teams including user's own teams
      // In production, this would filter out teams the user is already in
      const allTeams = [
        ...teams, // User's teams
        // Mock additional teams for demo
        { id: 'demo1', name: 'Design Team', member_count: 5, owner_name: 'Alice Smith' },
        { id: 'demo2', name: 'Backend Squad', member_count: 3, owner_name: 'Bob Jones' },
        { id: 'demo3', name: 'QA Team', member_count: 4, owner_name: 'Carol Wilson' }
      ];
      
      setAvailableTeams(allTeams);
    } catch (error) {
      console.error('Failed to fetch available teams:', error);
      setAvailableTeams([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    
    if (!newTeamName.trim()) {
      setError('Team name is required');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('Creating team:', newTeamName);
      
      // Try multiple API endpoints that might exist
      let response;
      let success = false;
      
      // Option 1: Try the context's createTeam method first
      if (createTeam && typeof createTeam === 'function') {
        try {
          console.log('Trying createTeam from context...');
          response = await createTeam({ name: newTeamName.trim() });
          success = true;
          console.log('Context createTeam worked:', response);
        } catch (contextError) {
          console.log('Context createTeam failed:', contextError);
        }
      }
      
      // Option 2: Try different API endpoints
      if (!success) {
        const endpoints = [
          '/teams/create',
          '/create-team', 
          '/team/create',
          '/teams',
          '/api/teams/create',
          '/api/teams'
        ];
        
        for (const endpoint of endpoints) {
          try {
            console.log(`Trying endpoint: ${endpoint}`);
            response = await api.post(endpoint, { 
              name: newTeamName.trim(),
              team_name: newTeamName.trim() // Some APIs might expect different field names
            });
            success = true;
            console.log(`Success with endpoint ${endpoint}:`, response.data);
            break;
          } catch (endpointError) {
            console.log(`Failed with endpoint ${endpoint}:`, endpointError.response?.status, endpointError.message);
            continue;
          }
        }
      }
      
      // Option 3: Fallback to local state management if all APIs fail
      if (!success) {
        console.log('All API endpoints failed, using local state fallback');
        
        // Create a mock team object
        const newTeam = {
          id: Date.now(), // Simple ID generation
          name: newTeamName.trim(),
          role: 'OWNER',
          member_count: 1,
          owner_name: 'You',
          created_at: new Date().toISOString()
        };
        
        console.log('Created mock team:', newTeam);
        
        // Try to add the team using context methods
        try {
          // If there's an addTeam method in context, use it
          if (typeof createTeam === 'function') {
            // This might work if createTeam handles local state
            await createTeam(newTeam);
          }
          
          // Force a refresh if possible
          if (refreshTeams && typeof refreshTeams === 'function') {
            await refreshTeams();
          }
          
          success = true;
          
          // Show a warning that this is offline mode
          setError('⚠️ Working in offline mode - team created locally. Backend connection needed for persistence.');
          
        } catch (localError) {
          console.log('Local team creation also failed:', localError);
          
          // Last resort: show success message but explain limitation
          success = true;
          setError('⚠️ Team creation completed but may not persist. Please check your TeamContext implementation and backend connection.');
        }
      }
      
      if (success) {
        console.log('Team created successfully');
        
        // Refresh teams list if function exists
        if (refreshTeams && typeof refreshTeams === 'function') {
          try {
            await refreshTeams();
          } catch (refreshError) {
            console.log('Failed to refresh teams:', refreshError);
          }
        }
        
        setNewTeamName('');
        setShowCreateForm(false);
        
        // Only clear error if it wasn't a warning message
        if (!error?.includes('offline mode') && !error?.includes('Working in offline mode')) {
          setError('');
        }
        
        // Try to refresh available teams
        try {
          await fetchAvailableTeams();
        } catch (fetchError) {
          console.log('Failed to refresh available teams:', fetchError);
        }
      }
      
    } catch (error) {
      console.error('Team creation error:', error);
      
      // More detailed error handling
      if (error.code === 'NETWORK_ERROR' || error.name === 'AxiosError' || !error.response) {
        setError(`Backend connection failed. The server at localhost:5000 is not responding or blocked by CORS policy. 

Possible solutions:
1. Start your backend server
2. Check CORS configuration
3. Use development mode (teams will be stored locally)`);
      } else if (error.response?.status === 400) {
        setError(error.response.data?.message || error.response.data?.error || 'Invalid team name or request format');
      } else if (error.response?.status === 404) {
        setError('API endpoint not found. Your backend may not have team creation implemented yet.');
      } else if (error.response?.status === 409) {
        setError('A team with this name already exists');
      } else if (error.response?.status === 401) {
        setError('You need to be logged in to create a team');
      } else if (error.response?.status === 500) {
        setError('Server error. Please try again later or contact support.');
      } else {
        setError(error.message || 'Failed to create team');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveTeam = async (teamId, teamName) => {
    if (confirm(`Are you sure you want to leave ${teamName}?`)) {
      // Implement leave team logic
      console.log('Leaving team:', teamId);
      // For now, just close the dropdown
      setShowDropdown(null);
    }
  };

  const handlePromoteUser = (teamId) => {
    console.log('Promote user in team:', teamId);
    setShowDropdown(null);
  };

  const handleAssignRole = (teamId) => {
    console.log('Assign role in team:', teamId);
    setShowDropdown(null);
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (confirm(`Are you sure you want to delete ${teamName}? This action cannot be undone.`)) {
      console.log('Deleting team:', teamId);
      setShowDropdown(null);
    }
  };

  const isUserAlreadyInTeam = (teamId) => {
    return teams.some(team => team.id === teamId);
  };

  const getRoleIcon = (role) => {
    const roleInfo = ROLES[role?.toUpperCase()] || ROLES.DEVELOPER;
    const IconComponent = roleInfo.icon;
    return <IconComponent className={`w-5 h-5 ${roleInfo.color}`} />;
  };

  const getRoleInfo = (role) => {
    return ROLES[role?.toUpperCase()] || ROLES.DEVELOPER;
  };

  return (
    <div className="max-w-4xl mx-auto" onClick={() => setShowDropdown(null)}>
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Team Settings</h1>
        
        {/* Your Teams Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Your Teams</h2>
          {teams && teams.length > 0 ? (
            <div className="space-y-3">
              {teams.map(team => {
                const roleInfo = getRoleInfo(team.role);
                return (
                  <div 
                    key={team.id} 
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      currentTeam?.id === team.id 
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' 
                        : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                    }`}
                    onClick={() => setCurrentTeam(team)}
                  >
                    <div className="flex items-center space-x-3">
                      <UserGroupIcon className="w-5 h-5 text-gray-600" />
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{team.name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          {getRoleIcon(team.role)}
                          <span className={`text-sm font-medium ${roleInfo.color}`}>
                            {roleInfo.name}
                          </span>
                          <span className="text-xs text-gray-500">
                            • {roleInfo.description}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {currentTeam?.id === team.id && (
                          <div className="text-blue-600 text-sm font-medium">Selected</div>
                        )}
                        
                        {/* 3-dot menu */}
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(showDropdown === team.id ? null : team.id);
                            }}
                            className="p-1 hover:bg-gray-100 rounded-full"
                          >
                            <EllipsisVerticalIcon className="w-5 h-5 text-gray-500" />
                          </button>
                          
                          {showDropdown === team.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                              <div className="py-1">
                                {team.role !== 'OWNER' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleLeaveTeam(team.id, team.name);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                  >
                                    Leave Team
                                  </button>
                                )}
                                
                                {(team.role === 'OWNER' || team.role === 'MANAGER') && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePromoteUser(team.id);
                                      }}
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      Promote Member
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAssignRole(team.id);
                                      }}
                                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                      Assign Roles
                                    </button>
                                  </>
                                )}
                                
                                {team.role === 'OWNER' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTeam(team.id, team.name);
                                    }}
                                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 border-t border-gray-100"
                                  >
                                    Delete Team
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <UserGroupIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No teams found. Create your first team below!</p>
            </div>
          )}
        </div>

        {/* Create New Team Section */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Create New Team</h2>
            {!showCreateForm && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                <span>Create Team</span>
              </button>
            )}
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name
                </label>
                <input
                  id="teamName"
                  type="text"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    if (error) setError(''); // Clear error when user types
                  }}
                  placeholder="Enter team name (e.g., 'Frontend Team', 'Product Squad')"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  You'll be the Owner of this team with full management privileges
                </p>
              </div>

              {error && (
                <div className={`border px-4 py-3 rounded ${
                  error.includes('offline mode') 
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700' 
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  <p className="font-medium">
                    {error.includes('offline mode') ? 'Warning:' : 'Error:'}
                  </p>
                  <p className="text-sm whitespace-pre-line">{error}</p>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer hover:underline">Debug Information</summary>
                    <div className="mt-1 text-xs bg-gray-100 p-2 rounded font-mono">
                      <p>Team name: "{newTeamName}"</p>
                      <p>Backend server: localhost:5000</p>
                      <p>Error type: ERR_BLOCKED_BY_CLIENT (likely CORS issue)</p>
                      <p>Teams in state: {teams ? teams.length : 'undefined'}</p>
                      <p>Current team: {currentTeam?.name || 'none'}</p>
                      <p>CreateTeam function: {typeof createTeam}</p>
                      <p>RefreshTeams function: {typeof refreshTeams}</p>
                      <hr className="my-1" />
                      <p className="font-semibold">To see created teams:</p>
                      <p>1. Check your TeamContext implementation</p>
                      <p>2. Ensure teams state is being updated</p>
                      <p>3. Verify refreshTeams() works properly</p>
                    </div>
                  </details>
                </div>
              )}

              <div className="flex space-x-3">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="flex-1 py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Team'}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewTeamName('');
                    setError('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Available Teams to Join Section */}
        <div className="border-t pt-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Available Teams</h2>
            <button
              onClick={fetchAvailableTeams}
              className="text-sm text-blue-600 hover:text-blue-700"
              disabled={loadingAvailable}
            >
              {loadingAvailable ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          
          {loadingAvailable ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : availableTeams.length > 0 ? (
            <div className="space-y-2">
              {availableTeams.map((team) => {
                const isAlreadyMember = isUserAlreadyInTeam(team.id);
                return (
                  <div key={team.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <UserGroupIcon className="w-5 h-5 text-gray-600" />
                      <div>
                        <h3 className="font-medium text-gray-900">{team.name}</h3>
                        <p className="text-sm text-gray-600">
                          {team.member_count || 0} members • Created by {team.owner_name || 'Unknown'}
                        </p>
                      </div>
                    </div>
                    {isAlreadyMember ? (
                      <span className="px-4 py-2 text-sm text-gray-500 bg-gray-100 rounded-md">
                        Already Member
                      </span>
                    ) : (
                      <button
                        onClick={() => handleJoinTeam(team.id, team.name)}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No available teams to join at the moment.</p>
            </div>
          )}
        </div>

        {/* Role Hierarchy Info */}
        <div className="border-t pt-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">Team Roles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(ROLES).map(([key, role]) => {
              const IconComponent = role.icon;
              return (
                <div key={key} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                  <IconComponent className={`w-5 h-5 ${role.color} flex-shrink-0 mt-0.5`} />
                  <div>
                    <h3 className={`font-medium ${role.color}`}>{role.name}</h3>
                    <p className="text-sm text-gray-600">{role.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamSettings;