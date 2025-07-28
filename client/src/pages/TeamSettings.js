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
      const response = await api.get('/teams/available');
      setAvailableTeams(response.data.teams || []);
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
      
      // Try direct API call if createTeam from context fails
      const response = await api.post('/teams/create', { 
        name: newTeamName.trim() 
      });
      
      console.log('Team created successfully:', response.data);
      
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
      
      // Better error handling
      if (error.code === 'NETWORK_ERROR' || !error.response) {
        setError('Network error. Please check your connection and try again.');
      } else if (error.response?.status === 400) {
        setError(error.response.data?.message || 'Invalid team name');
      } else if (error.response?.status === 409) {
        setError('A team with this name already exists');
      } else if (error.response?.status === 401) {
        setError('You need to be logged in to create a team');
      } else {
        setError(error.response?.data?.message || error.message || 'Failed to create team');
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
                  <p>{error}</p>
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