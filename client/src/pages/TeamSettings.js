import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { PlusIcon, UserGroupIcon, ShieldCheckIcon, CodeBracketIcon, CogIcon } from '@heroicons/react/24/outline';
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

  useEffect(() => {
    fetchAvailableTeams();
  }, []);

  const fetchAvailableTeams = async () => {
    try {
      setLoadingAvailable(true);
      
      // Try multiple endpoints for fetching available teams
      const endpoints = [
        '/teams/available',
        '/available-teams',
        '/teams/public',
        '/teams',
        '/api/teams/available',
        '/api/teams'
      ];
      
      let response;
      let success = false;
      
      for (const endpoint of endpoints) {
        try {
          console.log(`Trying to fetch available teams from: ${endpoint}`);
          response = await api.get(endpoint);
          success = true;
          console.log(`Success fetching from ${endpoint}:`, response.data);
          break;
        } catch (endpointError) {
          console.log(`Failed to fetch from ${endpoint}:`, endpointError.response?.status);
          continue;
        }
      }
      
      if (success) {
        // Handle different response formats
        const teams = response.data.teams || response.data.available_teams || response.data || [];
        setAvailableTeams(Array.isArray(teams) ? teams : []);
      } else {
        console.log('All endpoints failed for fetching available teams');
        setAvailableTeams([]);
      }
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
      
      if (!success) {
        throw new Error('All API endpoints failed - please check your backend configuration');
      }
      
      console.log('Team created successfully:', response?.data || response);
      
      // Refresh teams list
      if (refreshTeams) {
        await refreshTeams();
      }
      
      setNewTeamName('');
      setShowCreateForm(false);
      
      // Refresh available teams too
      await fetchAvailableTeams();
      
    } catch (error) {
      console.error('Team creation error:', error);
      
      // More detailed error handling
      if (error.code === 'NETWORK_ERROR' || error.name === 'AxiosError' || !error.response) {
        setError(`Network error: ${error.message}. Check if your backend server is running and the API endpoint exists.`);
      } else if (error.response?.status === 400) {
        setError(error.response.data?.message || error.response.data?.error || 'Invalid team name or request format');
      } else if (error.response?.status === 404) {
        setError('API endpoint not found. Please check your backend API configuration.');
      } else if (error.response?.status === 409) {
        setError('A team with this name already exists');
      } else if (error.response?.status === 401) {
        setError('You need to be logged in to create a team');
      } else if (error.response?.status === 500) {
        setError('Server error. Please try again later or contact support.');
      } else {
        setError(error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to create team');
      }
    } finally {
      setLoading(false);
    }
  };

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
    <div className="max-w-4xl mx-auto">
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
                      {currentTeam?.id === team.id && (
                        <div className="text-blue-600 text-sm font-medium">Selected</div>
                      )}
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
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  <p className="font-medium">Error:</p>
                  <p className="text-sm">{error}</p>
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer hover:underline">Debug Information</summary>
                    <div className="mt-1 text-xs bg-red-100 p-2 rounded font-mono">
                      <p>Team name: "{newTeamName}"</p>
                      <p>Check browser console for detailed API logs</p>
                      <p>Ensure your backend server is running and has team creation endpoints</p>
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
              {availableTeams.map((team) => (
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
                  <button
                    onClick={() => handleJoinTeam(team.id, team.name)}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Join
                  </button>
                </div>
              ))}
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