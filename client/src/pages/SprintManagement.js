import React, { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import {
  CalendarIcon,
  FlagIcon,
  PencilIcon,
  TrashIcon,
  ClockIcon,
  ChartBarIcon,
  PlayIcon,
  CheckIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

function SprintManagement() {
  const { currentTeam } = useTeam();
  // const { currentUser } = useAuth(); // Removed unused variable
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'planning', 'completed'
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingData, setEditingData] = useState(null);

  const fetchSprints = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/sprints?team_id=${currentTeam.id}`);
      
      if (response.data.success) {
        const sprintList = response.data.sprints || [];
        setSprints(sprintList);
        
        // Auto-select the active sprint if available
        const activeSprint = sprintList.find(s => s.status === 'active');
        if (activeSprint && !selectedSprint) {
          setSelectedSprint(activeSprint);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sprints:', error);
      setSprints([]);
    } finally {
      setLoading(false);
    }
  }, [currentTeam.id, selectedSprint]);

  useEffect(() => {
    if (currentTeam?.id) {
      fetchSprints();
    } else {
      setLoading(false);
      setSprints([]);
    }
  }, [currentTeam?.id, fetchSprints]);

  const handleDeleteSprint = async (sprintId) => {
    if (!window.confirm('Are you sure you want to delete this sprint? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/sprints/${sprintId}`);
      await fetchSprints();
      if (selectedSprint?.id === sprintId) {
        setSelectedSprint(null);
      }
    } catch (error) {
      alert('Failed to delete sprint');
    }
  };

  const handleEditSprint = (sprint) => {
    setEditingData({
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.start_date,
      endDate: sprint.end_date,
      goals: sprint.goals || ['']
    });
    setShowEditModal(true);
  };

  const handleUpdateSprint = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/sprints/${editingData.id}`, {
        name: editingData.name,
        startDate: editingData.startDate,
        endDate: editingData.endDate,
        goals: editingData.goals.filter(g => g.trim()),
        team_id: currentTeam.id
      });
      
      setShowEditModal(false);
      setEditingData(null);
      await fetchSprints();
    } catch (error) {
      alert('Failed to update sprint');
    }
  };

  const handleCompleteSprint = async (sprintId) => {
    if (!window.confirm('Are you sure you want to mark this sprint as completed?')) {
      return;
    }

    try {
      await api.post(`/sprints/${sprintId}/complete`);
      await fetchSprints();
    } catch (error) {
      alert('Failed to complete sprint');
    }
  };

  const handleStartSprint = async (sprintId) => {
    try {
      await api.post(`/sprints/${sprintId}/assign`, { team_id: currentTeam.id });
      await fetchSprints();
    } catch (error) {
      alert('Failed to start sprint');
    }
  };

  const getSprintDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = Math.ceil(days / 7);
    return { days, weeks };
  };

  const getSprintProgress = (sprint) => {
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const now = new Date();
    
    if (now < start) return 0;
    if (now > end) return 100;
    
    const total = end - start;
    const elapsed = now - start;
    return Math.round((elapsed / total) * 100);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'planning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredSprints = sprints.filter(sprint => {
    if (activeTab === 'active') return sprint.status === 'active' || sprint.status === 'assigned';
    if (activeTab === 'planning') return sprint.status === 'planning' || !sprint.status;
    if (activeTab === 'completed') return sprint.status === 'completed';
    return true;
  });

  if (!currentTeam) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <CalendarIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Sprint Management</h1>
          <p className="text-gray-600">Select a team to manage sprints</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sprint Management</h1>
            <p className="text-gray-600">Manage your team's sprints and track progress</p>
          </div>
          <button
            onClick={() => window.location.href = '/sprint-planning'}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            New Sprint
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'active'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Active Sprints
          </button>
          <button
            onClick={() => setActiveTab('planning')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'planning'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Planning
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'completed'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Completed
          </button>
        </nav>
      </div>

      {/* Sprint List and Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sprint List */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {activeTab === 'active' && 'Active Sprints'}
                {activeTab === 'planning' && 'Planned Sprints'}
                {activeTab === 'completed' && 'Completed Sprints'}
              </h2>
            </div>
            <div className="divide-y divide-gray-200">
              {filteredSprints.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No sprints found
                </div>
              ) : (
                filteredSprints.map((sprint) => (
                  <div
                    key={sprint.id}
                    onClick={() => setSelectedSprint(sprint)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedSprint?.id === sprint.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">{sprint.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(sprint.status)}`}>
                        {sprint.status || 'planning'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <div className="flex items-center mb-1">
                        <CalendarIcon className="w-4 h-4 mr-1" />
                        {sprint.start_date} to {sprint.end_date}
                      </div>
                      {sprint.status === 'active' && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>{getSprintProgress(sprint)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${getSprintProgress(sprint)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sprint Details */}
        <div className="lg:col-span-2">
          {selectedSprint ? (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedSprint.name}</h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditSprint(selectedSprint)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteSprint(selectedSprint.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Sprint Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <div className="flex items-center text-sm text-gray-600 mb-2">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      <span className="font-medium">Duration:</span>
                      <span className="ml-1">
                        {getSprintDuration(selectedSprint.start_date, selectedSprint.end_date).weeks} weeks
                        ({getSprintDuration(selectedSprint.start_date, selectedSprint.end_date).days} days)
                      </span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <ClockIcon className="w-4 h-4 mr-2" />
                      <span className="font-medium">Status:</span>
                      <span className={`ml-2 text-xs px-2 py-1 rounded-full border ${getStatusColor(selectedSprint.status)}`}>
                        {selectedSprint.status || 'planning'}
                      </span>
                    </div>
                  </div>
                  <div>
                    {selectedSprint.analytics && (
                      <div className="text-sm text-gray-600">
                        <div className="mb-2">
                          <span className="font-medium">Tasks:</span>
                          <span className="ml-1">
                            {selectedSprint.analytics.total_tasks || 0} total,
                            {' '}{selectedSprint.analytics.task_counts?.done || 0} completed
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Story Points:</span>
                          <span className="ml-1">
                            {selectedSprint.analytics.completed_story_points || 0} / {selectedSprint.analytics.total_story_points || 0}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sprint Goals */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Sprint Goals</h3>
                  {selectedSprint.goals && selectedSprint.goals.length > 0 ? (
                    <ul className="space-y-2">
                      {selectedSprint.goals.map((goal, index) => (
                        <li key={index} className="flex items-start">
                          <FlagIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-700">{goal}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500">No goals defined</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  {selectedSprint.status === 'planning' && (
                    <button
                      onClick={() => handleStartSprint(selectedSprint.id)}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center"
                    >
                      <PlayIcon className="w-5 h-5 mr-2" />
                      Start Sprint
                    </button>
                  )}
                  {selectedSprint.status === 'active' && (
                    <button
                      onClick={() => handleCompleteSprint(selectedSprint.id)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center"
                    >
                      <CheckIcon className="w-5 h-5 mr-2" />
                      Complete Sprint
                    </button>
                  )}
                  <button
                    onClick={() => window.location.href = `/tasks?sprint_id=${selectedSprint.id}`}
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center"
                  >
                    <ChartBarIcon className="w-5 h-5 mr-2" />
                    Manage Tasks
                  </button>
                </div>

                {/* Sprint Progress (for active sprints) */}
                {selectedSprint.status === 'active' && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Sprint Progress</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="font-medium text-gray-700">Time Progress</span>
                          <span className="text-gray-600">{getSprintProgress(selectedSprint)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${getSprintProgress(selectedSprint)}%` }}
                          />
                        </div>
                      </div>
                      
                      {selectedSprint.analytics && (
                        <div>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="font-medium text-gray-700">Task Completion</span>
                            <span className="text-gray-600">
                              {selectedSprint.analytics.completion_percentage || 0}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: `${selectedSprint.analytics.completion_percentage || 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Comments */}
                {selectedSprint.comments && selectedSprint.comments.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Comments</h3>
                    <div className="space-y-3">
                      {selectedSprint.comments.slice(0, 3).map((comment) => (
                        <div key={comment.id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-900">{comment.user_email}</span>
                            <span className="text-xs text-gray-500">{comment.time}</span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center py-12 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Select a sprint to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Sprint Modal */}
      {showEditModal && editingData && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Sprint</h3>
            <form onSubmit={handleUpdateSprint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sprint Name</label>
                <input
                  type="text"
                  value={editingData.name}
                  onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={editingData.startDate}
                    onChange={(e) => setEditingData({ ...editingData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editingData.endDate}
                    onChange={(e) => setEditingData({ ...editingData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goals</label>
                {editingData.goals.map((goal, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => {
                        const newGoals = [...editingData.goals];
                        newGoals[index] = e.target.value;
                        setEditingData({ ...editingData, goals: newGoals });
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                    />
                    {editingData.goals.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newGoals = editingData.goals.filter((_, i) => i !== index);
                          setEditingData({ ...editingData, goals: newGoals });
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditingData({ ...editingData, goals: [...editingData.goals, ''] })}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  + Add goal
                </button>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingData(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SprintManagement; 