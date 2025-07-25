import React, { useState } from 'react';
import { useTeam } from '../context/TeamContext';

function TeamSettings() {
  const { teams, currentTeam, setCurrentTeam, createTeam } = useTeam();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    try {
      await createTeam({ name: newTeamName });
      setNewTeamName('');
      setShowCreateForm(false);
    } catch (error) {
      alert('Failed to create team');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-6">Team Settings</h1>
        
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Your Teams</h2>
          <div className="space-y-2">
            {teams.map(team => (
              <div 
                key={team.id} 
                className={`p-3 border rounded-lg cursor-pointer ${
                  currentTeam?.id === team.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => setCurrentTeam(team)}
              >
                <h3 className="font-medium">{team.name}</h3>
                <p className="text-sm text-gray-600">Role: {team.role}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create New Team
        </button>

        {showCreateForm && (
          <form onSubmit={handleCreateTeam} className="mt-4 p-4 border rounded-lg">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              className="w-full px-3 py-2 border rounded-md mb-3"
              required
            />
            <button type="submit" className="w-full py-2 px-4 bg-green-600 text-white rounded-md">
              Create Team
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default TeamSettings;