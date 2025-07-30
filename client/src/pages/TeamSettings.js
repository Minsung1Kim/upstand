import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
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
  const { currentUser, getUserRole } = useAuth();
  const { currentCompany } = useCompany();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableTeams, setAvailableTeams] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [showDropdown, setShowDropdown] = useState(null);

  const userRole = getUserRole();
  const isManager = userRole === 'MANAGER' || userRole === 'OWNER' || userRole === 'MEMBER';

  useEffect(() => {
    fetchAvailableTeams();
  }, [teams]);

  const fetchAvailableTeams = async () => {
    try {
      setLoadingAvailable(true);
      
      // For demo purposes, show all teams including user's own teams
      const allTeams = [
        ...(teams || []), // User's teams with fallback
        // Mock additional teams for demo - now with "Sample" prefix
        { id: 'demo1', name: 'Sample Design Team', member_count: 5, owner_name: 'Alice Smith' },
        { id: 'demo2', name: 'Sample Backend Squad', member_count: 3, owner_name: 'Bob Jones' },
        { id: 'demo3', name: 'Sample QA Team', member_count: 4, owner_name: 'Carol Wilson' }
      ];
      
      setAvailableTeams(allTeams);
    } catch (error) {
      console.error('Failed to fetch available teams:', error);
      setAvailableTeams([]);
    } finally {
      setLoadingAvailable(false);
    }
  };

  const getLocalTeams = () => {
    try {
      if (!currentUser?.uid || !currentCompany?.id) return [];
      const key = `teams_${currentCompany.id}_${currentUser.uid}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      return [];
    }
  };

  const saveLocalTeams = (teams) => {
    try {
      if (!currentUser?.uid || !currentCompany?.id) return;
      const key = `teams_${currentCompany.id}_${currentUser.uid}`;
      localStorage.setItem(key, JSON.stringify(teams));
    } catch (error) {
      console.error('Error saving teams:', error);
    }
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    
    if (!isManager) {
      setError('Only managers can create teams. Please contact your manager or change your role in settings.');
      return;
    }
    
    if (!newTeamName.trim()) {
      setError('Team name is required');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      console.log('Creating team:', newTeamName);
      
      let success = false;
      
      // Try the context's createTeam method first
      if (createTeam && typeof createTeam === 'function') {
        try {
          console.log('Trying createTeam from context...');
          await createTeam({ name: newTeamName.trim() });
          success = true;
          console.log('Context createTeam worked');
        } catch (contextError) {
          console.log('Context createTeam failed:', contextError);
        }
      }
      
      // Fallback to local state management if all APIs fail
      if (!success) {
        console.log('Using local state fallback for team creation');
        
        const newTeam = {
          id: Date.now(),
          name: newTeamName.trim(),
          role: 'OWNER',
          member_count: 1,
          owner_name: currentUser?.email || 'You',
          company_id: currentCompany?.id || 'demo',
          created_at: new Date().toISOString()
        };
        
        const localTeams = getLocalTeams();
        localTeams.push(newTeam);
        saveLocalTeams(localTeams);
        
        // Update teams state if available
        if (refreshTeams && typeof refreshTeams === 'function') {
          await refreshTeams();
        }
        
        success = true;
        console.log('Team created locally:', newTeam);
      }
      
      if (success) {
        setNewTeamName('');
        setShowCreateForm(false);
        setError('');
        await fetchAvailableTeams();
      }
      
    } catch (error) {
      console.error('Team creation error:', error);
      setError('Failed to create team: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async (teamId, teamName) => {
    try {
      console.log('Joining team:', teamId);
      // For now, just show success message
      alert(`Joining team "${teamName}" - Feature coming soon!`);
    } catch (error) {
      console.error('Failed to join team:', error);
      setError(`Failed to join ${teamName}: ${error.message}`);
    }
  };

  const handleLeaveTeam = async (teamId, teamName) => {
    if (window.confirm(`Are you sure you want to leave ${teamName}?`)) {
      console.log('Leaving team:', teamId);
      alert(`Left team "${teamName}" - Feature coming soon!`);
      setShowDropdown(null);
    }
  };

  const handlePromoteUser = (teamId) => {
    alert('Promote member feature coming soon!');
    setShowDropdown(null);
  };

  const handleAssignRole = (teamId) => {
    alert('Assign roles feature coming soon!');
    setShowDropdown(null);
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (window.confirm(`Are you sure you want to delete ${teamName}? This action cannot be undone.`)) {
      try {
        // Remove team from localStorage
        const localTeams = getLocalTeams();
        const updatedTeams = localTeams.filter(team => team.id !== teamId);
        saveLocalTeams(updatedTeams);
        
        // Update teams state if available
        if (refreshTeams && typeof refreshTeams === 'function') {
          await refreshTeams();
        }
        
        alert(`Team "${teamName}" has been deleted.`);
        setShowDropdown(null);
      } catch (error) {
        alert('Failed to delete team: ' + error.message);
      }
    }
  };

  const isUserAlreadyInTeam = (teamId) => {
    return teams && teams.some(team => team.id === teamId);
  };

  const getRoleIcon = (role) => {
    const roleInfo = ROLES[role?.toUpperCase()] || ROLES.DEVELOPER;
    const IconComponent = roleInfo.icon;
    return <IconComponent className={`w-5 h-5 ${roleInfo.color}`} />;
  };

  const getRoleInfo = (role) => {
    return ROLES[role?.toUpperCase()] || ROLES.DEVELOPER;
  };

  // Show access denied for non-managers
  if (!isManager) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Access Denied</h3>
          <p className="mb-2">Only managers can access team settings and create teams.</p>
          <p className="text-sm text-red-600">
            If you're a manager, please update your role in your profile settings or contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto" onClick={() => setShowDropdown(null)}>
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Team Settings</h1>
        
        {/* Current Company Display */}
        {currentCompany && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900">Current Company: {currentCompany.name}</h3>
            <p className="text-sm text-blue-700">Code: {currentCompany.code}</p>
          </div>
        )}
        
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
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            <EllipsisVerticalIcon className="w-5 h-5 text-gray-500" />
                          </button>
                          
                          {showDropdown === team.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border">
                              <div className="py-1">
                                <button
                                  onClick={() => handleLeaveTeam(team.id, team.name)}
                                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                >
                                  Leave Team
                                </button>
                                <button
                                  onClick={() => handlePromoteUser(team.id)}
                                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                >
                                  Promote Member
                                </button>
                                <button
                                  onClick={() => handleAssignRole(team.id)}
                                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                >
                                  Assign Roles
                                </button>
                                <button
                                  onClick={() => handleDeleteTeam(team.id, team.name)}
                                  className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                                >
                                  Delete Team
                                </button>
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
              <UserGroupIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="mb-4">You haven't joined any teams yet.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Create Your First Team
              </button>
            </div>
          )}
        </div>

        {/* Create Team Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Create New Team</h2>
          </div>
          
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              <span>Create Team</span>
            </button>
          ) : (
            <form onSubmit={handleCreateTeam} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <div>
                <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  id="teamName"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter team name..."
                  disabled={loading}
                />
              </div>
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        {/* Available Teams to Join */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Available Teams to Join</h2>
          {loadingAvailable ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading available teams...</p>
            </div>
          ) : availableTeams.length > 0 ? (
            <div className="space-y-3">
              {availableTeams.map(team => {
                return (
                  <div key={team.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <UserGroupIcon className="w-5 h-5 text-gray-600" />
                      <div>
                        <h3 className="font-medium text-gray-900">{team.name}</h3>
                        <p className="text-sm text-gray-600">
                          {team.member_count} members • Owner: {team.owner_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isUserAlreadyInTeam(team.id) ? (
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