import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { 
  PlayIcon, 
  PauseIcon, 
  CheckCircleIcon, 
  ClockIcon,
  UserIcon,
  ChatBubbleLeftIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  CalendarIcon,
  FlagIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const SprintManagement = () => {
  const { currentTeam } = useTeam();
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assignee: 'Unassigned', estimate: 1 });
  const [newSprint, setNewSprint] = useState({
    name: '',
    startDate: '',
    endDate: '',
    goals: ['']
  });

  const teamMembers = ['Unassigned', 'Minsung Kim', 'John Doe', 'Jane Smith'];

  // Load sprints from API when component mounts or team changes
  useEffect(() => {
    if (currentTeam) {
      console.log('Fetching sprints for team:', currentTeam.id);
      fetchSprints();
    }
  }, [currentTeam]);

  // Fetch sprints from API with tasks and comments
  const fetchSprints = async () => {
    if (!currentTeam) return;
    
    setLoading(true);
    try {
      console.log('Making API call to:', `/sprints?team_id=${currentTeam.id}`);
      const response = await api.get(`/sprints?team_id=${currentTeam.id}`);
      console.log('API response:', response.data);
      const apiSprints = response.data.sprints || [];
      
      // Convert API sprints to local format with tasks and comments
      const formattedSprints = apiSprints.map(sprint => ({
        id: sprint.id,
        name: sprint.name,
        status: sprint.status || 'planning',
        startDate: sprint.start_date,
        endDate: sprint.end_date,
        progress: sprint.tasks ? Math.round((sprint.tasks.filter(t => t.status === 'completed').length / sprint.tasks.length) * 100) || 0 : 0,
        goals: sprint.goals || [],
        tasks: sprint.tasks || [],
        comments: sprint.comments || []
      }));
      
      console.log('Formatted sprints:', formattedSprints);
      setSprints(formattedSprints);
      
      // Auto-select first sprint if available
      if (formattedSprints.length > 0 && !selectedSprint) {
        setSelectedSprint(formattedSprints[0]);
      }
    } catch (error) {
      console.error('Failed to fetch sprints:', error);
      console.error('Error details:', error.response?.data);
      setSprints([]);
    } finally {
      setLoading(false);
    }
  };

  // Create new sprint
  const createSprint = async () => {
    if (!newSprint.name.trim() || !currentTeam) return;
    
    setLoading(true);
    try {
      console.log('Creating sprint with data:', {
        name: newSprint.name,
        startDate: newSprint.startDate,
        endDate: newSprint.endDate,
        team_id: currentTeam.id,
        goals: newSprint.goals.filter(g => g.trim())
      });
      
      const response = await api.post('/sprints', {
        name: newSprint.name,
        startDate: newSprint.startDate,
        endDate: newSprint.endDate,
        team_id: currentTeam.id,
        goals: newSprint.goals.filter(g => g.trim())
      });
      
      console.log('Create sprint response:', response.data);
      
      if (response.data.success) {
        const newSprintData = response.data.sprint;
        
        // Format the new sprint for local state
        const formattedSprint = {
          id: newSprintData.id,
          name: newSprintData.name,
          status: newSprintData.status || 'planning',
          startDate: newSprintData.start_date,
          endDate: newSprintData.end_date,
          progress: 0,
          goals: newSprintData.goals || [],
          tasks: [],
          comments: []
        };
        
        console.log('Formatted new sprint:', formattedSprint);
        
        // Update local state immediately
        setSprints(prev => {
          const updated = [formattedSprint, ...prev];
          console.log('Updated sprints list:', updated);
          return updated;
        });
        setSelectedSprint(formattedSprint);
        
        // Reset form and close modal
        setNewSprint({ name: '', startDate: '', endDate: '', goals: [''] });
        setShowCreateSprint(false);
        
        // Show success message
        alert('Sprint created successfully!');
        
        // Refetch sprints to ensure consistency
        fetchSprints();
      }
    } catch (error) {
      console.error('Failed to create sprint:', error);
      console.error('Create sprint error details:', error.response?.data);
      alert('Failed to create sprint: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Add comment with API persistence
  const addComment = async () => {
    if (!newComment.trim() || !selectedSprint) return;
    
    try {
      const response = await api.post(`/sprints/${selectedSprint.id}/comments`, {
        author: 'Minsung Kim',
        text: newComment
      });
      
      if (response.data.success) {
        const newCommentData = response.data.comment;
        
        // Update local state
        const updatedSprints = sprints.map(sprint => 
          sprint.id === selectedSprint.id 
            ? { ...sprint, comments: [newCommentData, ...sprint.comments] }
            : sprint
        );

        setSprints(updatedSprints);
        setSelectedSprint(prev => ({ ...prev, comments: [newCommentData, ...prev.comments] }));
        setNewComment('');
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment: ' + (error.response?.data?.error || error.message));
    }
  };

  // Add task with API persistence
  const addTask = async () => {
    if (!newTask.title.trim() || !selectedSprint) return;

    try {
      const response = await api.post('/tasks', {
        sprint_id: selectedSprint.id,
        title: newTask.title,
        assignee: newTask.assignee,
        status: 'todo',
        estimate: parseInt(newTask.estimate)
      });
      
      if (response.data.success) {
        const newTaskData = response.data.task;
        
        // Update local state
        const updatedSprints = sprints.map(sprint =>
          sprint.id === selectedSprint.id
            ? { ...sprint, tasks: [...sprint.tasks, newTaskData] }
            : sprint
        );

        setSprints(updatedSprints);
        setSelectedSprint(prev => ({ ...prev, tasks: [...prev.tasks, newTaskData] }));
        setNewTask({ title: '', assignee: 'Unassigned', estimate: 1 });
        setShowAddTask(false);
      }
    } catch (error) {
      console.error('Failed to add task:', error);
      alert('Failed to add task: ' + (error.response?.data?.error || error.message));
    }
  };

  // Update task status with API persistence
  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const response = await api.put(`/tasks/${taskId}`, {
        status: newStatus
      });
      
      if (response.data.success) {
        const updatedTask = response.data.task;
        
        // Update local state
        const updateTasks = (tasks) => 
          tasks.map(task => task.id === taskId ? updatedTask : task);

        const updatedSprints = sprints.map(sprint =>
          sprint.id === selectedSprint.id
            ? { ...sprint, tasks: updateTasks(sprint.tasks) }
            : sprint
        );

        setSprints(updatedSprints);
        setSelectedSprint(prev => ({ ...prev, tasks: updateTasks(prev.tasks) }));
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      alert('Failed to update task: ' + (error.response?.data?.error || error.message));
    }
  };

  // Reassign task with API persistence
  const reassignTask = async (taskId, newAssignee) => {
    try {
      const response = await api.put(`/tasks/${taskId}`, {
        assignee: newAssignee
      });
      
      if (response.data.success) {
        const updatedTask = response.data.task;
        
        // Update local state
        const updateTasks = (tasks) => 
          tasks.map(task => task.id === taskId ? updatedTask : task);

        const updatedSprints = sprints.map(sprint =>
          sprint.id === selectedSprint.id
            ? { ...sprint, tasks: updateTasks(sprint.tasks) }
            : sprint
        );

        setSprints(updatedSprints);
        setSelectedSprint(prev => ({ ...prev, tasks: updateTasks(prev.tasks) }));
        setShowReassignModal(null);
      }
    } catch (error) {
      console.error('Failed to reassign task:', error);
      alert('Failed to reassign task: ' + (error.response?.data?.error || error.message));
    }
  };

  // Start sprint
  const startSprint = (sprintId) => {
    const updatedSprints = sprints.map(sprint =>
      sprint.id === sprintId ? { ...sprint, status: 'active' } : sprint
    );
    setSprints(updatedSprints);
    if (selectedSprint?.id === sprintId) {
      setSelectedSprint(prev => ({ ...prev, status: 'active' }));
    }
  };

  // Calculate team workload
  const getTeamWorkload = () => {
    if (!selectedSprint) return { assigned: 0, unassigned: 100, totalHours: 0 };
    
    const activeTasks = selectedSprint.tasks.filter(task => task.status !== 'completed');
    const totalWork = activeTasks.reduce((sum, task) => sum + task.estimate, 0);
    
    if (totalWork === 0) return { assigned: 0, unassigned: 0, totalHours: 0 };
    
    const assignedWork = activeTasks
      .filter(task => task.assignee !== 'Unassigned')
      .reduce((sum, task) => sum + task.estimate, 0);
    const unassignedWork = totalWork - assignedWork;

    return {
      assigned: Math.round((assignedWork / totalWork) * 100),
      unassigned: Math.round((unassignedWork / totalWork) * 100),
      totalHours: totalWork
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'planning': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTaskStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'todo': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const workload = getTeamWorkload();

  const addSprintGoal = () => {
    setNewSprint({
      ...newSprint,
      goals: [...newSprint.goals, '']
    });
  };

  const updateSprintGoal = (index, value) => {
    const newGoals = [...newSprint.goals];
    newGoals[index] = value;
    setNewSprint({
      ...newSprint,
      goals: newGoals
    });
  };

  const removeSprintGoal = (index) => {
    const newGoals = newSprint.goals.filter((_, i) => i !== index);
    setNewSprint({
      ...newSprint,
      goals: newGoals.length > 0 ? newGoals : ['']
    });
  };

  if (loading && sprints.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Loading sprints...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sprint Management</h1>
            <p className="text-gray-600 mt-2">Manage your sprints, track progress, and coordinate team work</p>
          </div>
          <button 
            onClick={() => setShowCreateSprint(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Create Sprint
          </button>
        </div>
        
        {/* Sprint Explanation for New Users */}
        {sprints.length === 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <FlagIcon className="w-5 h-5 text-blue-600 mt-0.5" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-900">What is a Sprint?</h3>
                <p className="mt-1 text-sm text-blue-700">
                  A sprint is a short, time-boxed period (usually 1-4 weeks) where your team works on a specific set of tasks and goals. 
                  It's the core building block of agile development that helps teams deliver working software iteratively.
                </p>
                <div className="mt-2 text-sm text-blue-600">
                  <strong>Get started:</strong> Create your first sprint with clear goals, add tasks, and track your team's progress!
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Sprint Modal */}
      {showCreateSprint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw max-h-90vh overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Sprint</h3>
            
            {/* Sprint Creation Help */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>💡 Tip:</strong> A sprint typically lasts 1-4 weeks. Set clear, achievable goals and break them down into specific tasks once created.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Sprint Name</label>
                <input
                  type="text"
                  value={newSprint.name}
                  onChange={(e) => setNewSprint({...newSprint, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., User Authentication Sprint"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={newSprint.startDate}
                    onChange={(e) => setNewSprint({...newSprint, startDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={newSprint.endDate}
                    onChange={(e) => setNewSprint({...newSprint, endDate: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Sprint Goals</label>
                {newSprint.goals.map((goal, index) => (
                  <div key={index} className="flex items-center space-x-2 mb-2">
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => updateSprintGoal(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                      placeholder={`Goal ${index + 1}`}
                    />
                    {newSprint.goals.length > 1 && (
                      <button
                        onClick={() => removeSprintGoal(index)}
                        className="px-2 py-2 text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addSprintGoal}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Goal
                </button>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateSprint(false)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createSprint}
                disabled={!newSprint.name.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Sprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">Reassign Task</h3>
            
            <div className="space-y-3">
              {teamMembers.map(member => (
                <button
                  key={member}
                  onClick={() => reassignTask(showReassignModal, member)}
                  className="w-full text-left p-3 rounded-lg border hover:bg-gray-50"
                >
                  {member}
                </button>
              ))}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowReassignModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sprint List Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Sprints</h2>
            
            {sprints.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ClockIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-sm font-medium">No sprints yet</p>
                <p className="text-xs text-gray-400 mt-1">Create your first sprint to start organizing your team's work</p>
                <button 
                  onClick={() => setShowCreateSprint(true)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Create Sprint
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sprints.map(sprint => (
                  <div
                    key={sprint.id}
                    onClick={() => setSelectedSprint(sprint)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedSprint?.id === sprint.id 
                        ? 'bg-blue-50 border-2 border-blue-200' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-sm">{sprint.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(sprint.status)}`}>
                        {sprint.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {sprint.startDate} - {sprint.endDate}
                    </div>
                    {sprint.status === 'active' && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span>{sprint.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${sprint.progress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {!selectedSprint ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <ClockIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No Sprint Selected</h2>
              <p className="text-gray-600 mb-4">Choose a sprint from the sidebar to view details and manage tasks.</p>
              
              {sprints.length === 0 ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">Getting Started with Sprints</h3>
                  <p className="text-sm text-blue-700 mb-3">
                    Sprints help you organize work into manageable chunks. Each sprint has goals, tasks, and a timeline that keeps your team focused and productive.
                  </p>
                  <div className="text-sm text-blue-600">
                    <strong>Sprint workflow:</strong> Create Sprint → Add Goals → Add Tasks → Track Progress → Review & Retrospect
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 mb-6">Select an existing sprint to continue working.</p>
              )}
              
              <button 
                onClick={() => setShowCreateSprint(true)}
                className="flex items-center mx-auto px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                {sprints.length === 0 ? 'Create Your First Sprint' : 'Create New Sprint'}
              </button>
            </div>
          ) : (
            <>
              {/* Sprint Header */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedSprint.name}</h2>
                    <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                      <div className="flex items-center">
                        <CalendarIcon className="w-4 h-4 mr-1" />
                        {selectedSprint.startDate} - {selectedSprint.endDate}
                      </div>
                      <span className={`px-2 py-1 rounded-full ${getStatusColor(selectedSprint.status)}`}>
                        {selectedSprint.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {selectedSprint.status === 'planning' && (
                      <button 
                        onClick={() => startSprint(selectedSprint.id)}
                        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        <PlayIcon className="w-4 h-4 mr-2" />
                        Start Sprint
                      </button>
                    )}
                    {selectedSprint.status === 'active' && (
                      <button className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
                        <CheckCircleIcon className="w-4 h-4 mr-2" />
                        Complete Sprint
                      </button>
                    )}
                  </div>
                </div>

                {/* Sprint Goals */}
                {selectedSprint.goals && selectedSprint.goals.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2 flex items-center">
                      <FlagIcon className="w-4 h-4 mr-2" />
                      Sprint Goals
                    </h3>
                    <ul className="space-y-1">
                      {selectedSprint.goals.map((goal, index) => (
                        <li key={index} className="flex items-center text-sm">
                          <CheckCircleIcon className="w-4 h-4 mr-2 text-green-500" />
                          {goal}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Progress Bar */}
                {selectedSprint.status === 'active' && (
                  <div>
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>Overall Progress</span>
                      <span>{selectedSprint.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all" 
                        style={{ width: `${selectedSprint.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Team Workload */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <ChartBarIcon className="w-5 h-5 mr-2" />
                  Team Workload
                </h3>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium mr-3">
                        MK
                      </div>
                      <span className="font-medium">Minsung Kim</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-48 bg-gray-200 rounded-full h-4">
                        <div className="bg-blue-600 h-4 rounded-full" style={{ width: `${workload.assigned}%` }}></div>
                      </div>
                      <span className="text-sm font-medium w-12">{workload.assigned}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <UserIcon className="w-8 h-8 text-gray-400 mr-3" />
                      <span className="text-gray-600">Unassigned</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-48 bg-gray-200 rounded-full h-4">
                        <div className="bg-gray-400 h-4 rounded-full" style={{ width: `${workload.unassigned}%` }}></div>
                      </div>
                      <span className="text-sm font-medium w-12">{workload.unassigned}%</span>
                    </div>
                  </div>
                </div>
                
                {workload.unassigned > 40 && workload.totalHours > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center">
                    <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mr-2" />
                    <span className="text-yellow-800 text-sm">
                      High amount of unassigned work ({workload.unassigned}%). Consider assigning tasks to team members.
                    </span>
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Sprint Tasks</h3>
                  <button 
                    onClick={() => setShowAddTask(true)}
                    className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Task
                  </button>
                </div>

                {showAddTask && (
                  <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <input
                        type="text"
                        placeholder="Task title"
                        value={newTask.title}
                        onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                      <select
                        value={newTask.assignee}
                        onChange={(e) => setNewTask({...newTask, assignee: e.target.value})}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      >
                        {teamMembers.map(member => (
                          <option key={member} value={member}>{member}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Hours"
                        min="1"
                        value={newTask.estimate}
                        onChange={(e) => setNewTask({...newTask, estimate: e.target.value})}
                        className="px-3 py-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={addTask}
                        disabled={!newTask.title.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Add Task
                      </button>
                      <button 
                        onClick={() => setShowAddTask(false)}
                        className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  {selectedSprint.tasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => updateTaskStatus(task.id, 
                            task.status === 'todo' ? 'in-progress' : 
                            task.status === 'in-progress' ? 'completed' : 'todo'
                          )}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            task.status === 'completed' ? 'bg-green-500 border-green-500' :
                            task.status === 'in-progress' ? 'bg-yellow-500 border-yellow-500' :
                            'border-gray-300 hover:border-blue-500'
                          }`}
                        >
                          {task.status === 'completed' && (
                            <CheckCircleIcon className="w-3 h-3 text-white" />
                          )}
                        </button>
                        
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                              {task.title}
                            </span>
                            <span className={`px-2 py-1 text-xs rounded-full ${getTaskStatusColor(task.status)}`}>
                              {task.status.replace('-', ' ')}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                            <span className="flex items-center">
                              <UserIcon className="w-3 h-3 mr-1" />
                              {task.assignee}
                            </span>
                            <span className="flex items-center">
                              <ClockIcon className="w-3 h-3 mr-1" />
                              {task.estimate}h
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setShowReassignModal(task.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <UserIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateTaskStatus(task.id, 
                            task.status === 'todo' ? 'in-progress' : 
                            task.status === 'in-progress' ? 'completed' : 'todo'
                          )}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <EllipsisVerticalIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {selectedSprint.tasks.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <ClockIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No tasks yet. Add some tasks to get started!</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Comments */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <ChatBubbleLeftIcon className="w-5 h-5 mr-2" />
                  Sprint Comments
                </h3>

                {/* Add Comment */}
                <div className="mb-4">
                  <div className="flex space-x-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      MK
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment about this sprint..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
                        rows="3"
                      />
                      <button 
                        onClick={addComment}
                        disabled={!newComment.trim()}
                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>
                </div>

                {/* Comments List */}
                <div className="space-y-4">
                  {selectedSprint.comments.map(comment => (
                    <div key={comment.id} className="flex space-x-3">
                      <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {comment.author === 'System' ? 'S' : 'MK'}
                      </div>
                      <div className="flex-1">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{comment.author}</span>
                            <span className="text-xs text-gray-500">{comment.time}</span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.text}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {selectedSprint.comments.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <ChatBubbleLeftIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No comments yet. Start the conversation!</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SprintManagement;