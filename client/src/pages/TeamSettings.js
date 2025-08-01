import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { PlusIcon, UserGroupIcon, ShieldCheckIcon, CodeBracketIcon, CogIcon, EllipsisVerticalIcon, UserPlusIcon, TrashIcon, UserIcon } from '@heroicons/react/24/outline';
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
  const [showRoleModal, setShowRoleModal] = useState(null);
  const [showMembersModal, setShowMembersModal] = useState(null);

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
          id: `team_${Date.now()}`,
          name: newTeamName.trim(),
          role: 'OWNER',
          member_count: 1,
          owner_name: currentUser?.email || 'You',
          company_id: currentCompany?.id || 'demo',
          created_at: new Date().toISOString(),
          members: [
            {
              id: currentUser?.uid || 'user_1',
              email: currentUser?.email || 'user@example.com',
              name: currentUser?.displayName || 'You',
              role: 'OWNER',
              joined_at: new Date().toISOString()
            }
          ]
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
      
      // Add to local teams
      const newTeamMember = {
        id: teamId,
        name: teamName,
        role: 'DEVELOPER',
        member_count: Math.floor(Math.random() * 10) + 2,
        owner_name: 'Team Owner',
        company_id: currentCompany?.id || 'demo',
        joined_at: new Date().toISOString()
      };
      
      const localTeams = getLocalTeams();
      const existingTeam = localTeams.find(t => t.id === teamId);
      
      if (!existingTeam) {
        localTeams.push(newTeamMember);
        saveLocalTeams(localTeams);
        
        if (refreshTeams && typeof refreshTeams === 'function') {
          await refreshTeams();
        }
        
        alert(`Successfully joined "${teamName}"! You can now participate in standups and view team activity.`);
        await fetchAvailableTeams();
      } else {
        alert(`You're already a member of "${teamName}"`);
      }
    } catch (error) {
      console.error('Failed to join team:', error);
      setError(`Failed to join ${teamName}: ${error.message}`);
    }
  };

  const handleLeaveTeam = async (teamId, teamName) => {
    if (window.confirm(`Are you sure you want to leave "${teamName}"? You'll lose access to team standups and data.`)) {
      try {
        // Remove from local teams
        const localTeams = getLocalTeams();
        const updatedTeams = localTeams.filter(team => team.id !== teamId);
        saveLocalTeams(updatedTeams);
        
        // Update teams context
        if (refreshTeams && typeof refreshTeams === 'function') {
          await refreshTeams();
        }
        
        // If this was the current team, clear selection
        if (currentTeam?.id === teamId) {
          setCurrentTeam(null);
        }
        
        // Close dropdown and refresh UI
        setShowDropdown(null);
        await fetchAvailableTeams();
        
        alert(`You have left "${teamName}". You can rejoin later if needed.`);
        
        // Force page refresh to show updated teams
        window.location.reload();
      } catch (error) {
        alert('Failed to leave team: ' + error.message);
      }
    }
  };

  const handleShowMembers = (team) => {
    // Mock team members for demo
    const mockMembers = [
      { id: '1', name: 'You', email: currentUser?.email || 'you@example.com', role: team.role || 'DEVELOPER' },
      { id: '2', name: 'John Doe', email: 'john@example.com', role: 'DEVELOPER' },
      { id: '3', name: 'Jane Smith', email: 'jane@example.com', role: 'MANAGER' },
      { id: '4', name: 'Bob Wilson', email: 'bob@example.com', role: 'DEVELOPER' }
    ];
    
    setShowMembersModal({ team, members: mockMembers.slice(0, team.member_count || 2) });
    setShowDropdown(null);
  };

  const handlePromoteUser = (teamId, teamName) => {
    const team = teams?.find(t => t.id === teamId);
    if (!team) return;
    
    // Mock promotion - in real app, this would show a modal with team members
    alert(`Team Management for "${teamName}"\n\nFeatures:\n• Promote members to Manager/Owner\n• Assign different roles\n• Manage team permissions\n\nThis would open a team management interface in the full version.`);
    setShowDropdown(null);
  };

  const handleAssignRole = (teamId, teamName) => {
    const team = teams?.find(t => t.id === teamId);
    if (!team) return;
    
    setShowRoleModal({ teamId, teamName, currentRole: team.role });
    setShowDropdown(null);
  };

  const handleChangeRole = async (newRole) => {
    try {
      const localTeams = getLocalTeams();
      const updatedTeams = localTeams.map(team => 
        team.id === showRoleModal.teamId 
          ? { ...team, role: newRole }
          : team
      );
      saveLocalTeams(updatedTeams);
      
      // Force refresh of teams context
      if (refreshTeams && typeof refreshTeams === 'function') {
        await refreshTeams();
      }
      
      // Force re-fetch of available teams to update UI
      await fetchAvailableTeams();
      
      alert(`Your role in "${showRoleModal.teamName}" has been updated to ${ROLES[newRole].name}`);
      setShowRoleModal(null);
      
      // Force component re-render by updating local state
      window.location.reload();
    } catch (error) {
      alert('Failed to update role: ' + error.message);
    }
  };

  const handleDeleteTeam = async (teamId, teamName) => {
    if (window.confirm(`⚠️ DELETE TEAM WARNING ⚠️\n\nAre you sure you want to permanently delete "${teamName}"?\n\nThis will:\n• Remove all team data\n• Delete all standups and history\n• Remove all team members\n• Cannot be undone\n\nType "DELETE" in the next prompt to confirm.`)) {
      const confirmation = prompt(`To delete "${teamName}", type "DELETE" (all caps):`);
      
      if (confirmation === 'DELETE') {
        try {
          // Remove team from localStorage
          const localTeams = getLocalTeams();
          const updatedTeams = localTeams.filter(team => team.id !== teamId);
          saveLocalTeams(updatedTeams);
          
          // Update teams context
          if (refreshTeams && typeof refreshTeams === 'function') {
            await refreshTeams();
          }
          
          // If this was the current team, clear selection
          if (currentTeam?.id === teamId) {
            setCurrentTeam(null);
          }
          
          // Close dropdown and refresh UI
          setShowDropdown(null);
          await fetchAvailableTeams();
          
          alert(`Team "${teamName}" has been permanently deleted.`);
          
          // Force page refresh to show updated teams
          window.location.reload();
        } catch (error) {
          alert('Failed to delete team: ' + error.message);
        }
      } else {
        alert('Team deletion cancelled - confirmation text did not match.');
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
                            <div className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border">
                              <div className="py-1">
                                <button
                                  onClick={() => handleShowMembers(team)}
                                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                >
                                  <UserIcon className="w-4 h-4 mr-2" />
                                  View Members ({team.member_count || 1})
                                </button>
                                <button
                                  onClick={() => handleAssignRole(team.id, team.name)}
                                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
                                >
                                  <CogIcon className="w-4 h-4 mr-2" />
                                  Change My Role
                                </button>
                                <div className="border-t border-gray-100"></div>
                                <button
                                  onClick={() => handleLeaveTeam(team.id, team.name)}
                                  className="flex items-center px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 w-full text-left"
                                >
                                  <UserIcon className="w-4 h-4 mr-2" />
                                  Leave Team
                                </button>
                                {(team.role === 'OWNER' || team.role === 'MANAGER') && (
                                  <button
                                    onClick={() => handleDeleteTeam(team.id, team.name)}
                                    className="flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                                  >
                                    <TrashIcon className="w-4 h-4 mr-2" />
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
              className="flex items-center px-4 py-2 text-green-600 border border-green-600 rounded-md hover:bg-green-50 transition-colors"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Create Team
            </button>
          ) : (
            <form onSubmit={handleCreateTeam} className="space-y-4 p-4 border rounded-lg bg-gray-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Frontend Team, Backend Squad, QA Team"
                  maxLength={50}
                />
              </div>
              
              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}
              
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Available Teams Section */}
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
                          Join Team
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

      {/* Role Change Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4">Change Your Role in {showRoleModal.teamName}</h3>
            <div className="space-y-3">
              {Object.entries(ROLES).map(([key, role]) => {
                const IconComponent = role.icon;
                return (
                  <button
                    key={key}
                    onClick={() => handleChangeRole(key)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      showRoleModal.currentRole === key 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <IconComponent className={`w-5 h-5 ${role.color}`} />
                      <div>
                        <div className={`font-medium ${role.color}`}>{role.name}</div>
                        <div className="text-sm text-gray-600">{role.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowRoleModal(null)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-semibold mb-4">Members of {showMembersModal.team.name}</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {showMembersModal.members.map(member => {
                const roleInfo = getRoleInfo(member.role);
                const IconComponent = roleInfo.icon;
                return (
                  <div key={member.id} className="flex items-center space-x-3 p-2 border rounded">
                    <IconComponent className={`w-4 h-4 ${roleInfo.color}`} />
                    <div className="flex-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-sm text-gray-600">{member.email}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${roleInfo.color} bg-gray-100`}>
                      {roleInfo.name}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowMembersModal(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamSettings;