import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { 
  PlusIcon, 
  FlagIcon, 
  ClockIcon, 
  UserIcon, 
  ChatBubbleLeftIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

function SprintManagement() {
  const { currentTeam } = useTeam();
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(null);
  
  const [newSprint, setNewSprint] = useState({
    name: '',
    startDate: '',
    endDate: '',
    goals: ['']
  });
  
  const [newTask, setNewTask] = useState({
    title: '',
    assignee: 'Unassigned',
    estimate: 1
  });
  
  const [newComment, setNewComment] = useState('');

  // Fetch sprints when component mounts or team changes
  useEffect(() => {
    if (currentTeam?.id) {
      fetchSprints();
    } else {
      setLoading(false);
      setSprints([]);
      setSelectedSprint(null);
    }
  }, [currentTeam?.id]);

  // Fetch sprints from API
  const fetchSprints = async () => {
    if (!currentTeam?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Fetching sprints for team:', currentTeam.id);
      
      const response = await api.get('/sprints', {
        params: { team_id: currentTeam.id }
      });
      
      console.log('Fetch sprints response:', response.data);
      
      if (response.data.success && response.data.sprints) {
        const formattedSprints = response.data.sprints.map(sprint => ({
          id: sprint.id,
          name: sprint.name,
          status: sprint.status || 'planning',
          startDate: sprint.start_date,
          endDate: sprint.end_date,
          progress: sprint.tasks && sprint.tasks.length > 0 
            ? Math.round((sprint.tasks.filter(t => t.status === 'completed').length / sprint.tasks.length) * 100) 
            : 0,
          goals: sprint.goals || [],
          tasks: sprint.tasks || [],
          comments: sprint.comments || []
        }));
        
        console.log('Formatted sprints:', formattedSprints);
        setSprints(formattedSprints);
        
        // Auto-select first sprint if none selected and sprints exist
        if (formattedSprints.length > 0 && !selectedSprint) {
          setSelectedSprint(formattedSprints[0]);
        }
      } else {
        setSprints([]);
        setSelectedSprint(null);
      }
    } catch (error) {
      console.error('Failed to fetch sprints:', error);
      console.error('Error details:', error.response?.data);
      setSprints([]);
      setSelectedSprint(null);
    } finally {
      setLoading(false);
    }
  };

  // Create new sprint
  const createSprint = async () => {
    if (!newSprint.name.trim() || !currentTeam) return;
    
    setCreating(true);
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
        // Reset form and close modal first
        setNewSprint({ name: '', startDate: '', endDate: '', goals: [''] });
        setShowCreateSprint(false);
        
        // Refetch all sprints to ensure data consistency
        await fetchSprints();
        
        alert('Sprint created successfully!');
      }
    } catch (error) {
      console.error('Failed to create sprint:', error);
      console.error('Create sprint error details:', error.response?.data);
      alert('Failed to create sprint: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
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

  // Add goal to new sprint
  const addGoal = () => {
    setNewSprint({
      ...newSprint,
      goals: [...newSprint.goals, '']
    });
  };

  // Remove goal from new sprint
  const removeGoal = (index) => {
    const newGoals = newSprint.goals.filter((_, i) => i !== index);
    setNewSprint({
      ...newSprint,
      goals: newGoals.length > 0 ? newGoals : ['']
    });
  };

  // Update goal text
  const updateGoal = (index, value) => {
    const newGoals = [...newSprint.goals];
    newGoals[index] = value;
    setNewSprint({
      ...newSprint,
      goals: newGoals
    });
  };

  if (!currentTeam) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Sprint Management</h1>
          <p className="text-gray-600">Please select a team to manage sprints.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-600">Loading sprints...</p>
        </div>
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
          <div className="flex gap-2">
            <button 
              onClick={fetchSprints}
              disabled={loading}
              className="flex items-center px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={() => setShowCreateSprint(true)}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Create Sprint
            </button>
          </div>
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

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sprint List Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Sprints</h2>
            </div>
            
            {sprints.length === 0 ? (
              <div className="p-6 text-center">
                <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No sprints yet</h3>
                <p className="text-gray-600 mb-4">Create your first sprint to start organizing your team's work.</p>
                <button 
                  onClick={() => setShowCreateSprint(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Create Sprint
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {sprints.map((sprint) => (
                  <div
                    key={sprint.id}
                    onClick={() => setSelectedSprint(sprint)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedSprint?.id === sprint.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900 truncate">{sprint.name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        sprint.status === 'active' ? 'bg-green-100 text-green-800' :
                        sprint.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sprint.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      {sprint.startDate} - {sprint.endDate}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${sprint.progress}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {sprint.progress}% complete
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sprint Details */}
        <div className="lg:col-span-2">
          {selectedSprint ? (
            <div className="space-y-6">
              {/* Sprint Header */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">{selectedSprint.name}</h2>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    selectedSprint.status === 'active' ? 'bg-green-100 text-green-800' :
                    selectedSprint.status === 'completed' ? 'bg-gray-100 text-gray-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {selectedSprint.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Start Date</p>
                    <p className="font-medium">{selectedSprint.startDate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">End Date</p>
                    <p className="font-medium">{selectedSprint.endDate}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">Progress</p>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-blue-600 h-3 rounded-full" 
                      style={{ width: `${selectedSprint.progress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{selectedSprint.progress}% complete</p>
                </div>

                {selectedSprint.goals && selectedSprint.goals.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Sprint Goals</p>
                    <ul className="list-disc list-inside text-gray-700">
                      {selectedSprint.goals.map((goal, index) => (
                        <li key={index}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Tasks Section */}
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Tasks</h3>
                  <button 
                    onClick={() => setShowAddTask(true)}
                    className="flex items-center px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    <PlusIcon className="w-4 h-4 mr-1" />
                    Add Task
                  </button>
                </div>
                
                {selectedSprint.tasks && selectedSprint.tasks.length > 0 ? (
                  <div className="divide-y">
                    {selectedSprint.tasks.map((task) => (
                      <div key={task.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{task.title}</h4>
                          <div className="flex items-center space-x-2">
                            <select
                              value={task.status}
                              onChange={(e) => updateTaskStatus(task.id, e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                            <button
                              onClick={() => setShowReassignModal(task.id)}
                              className="text-blue-600 hover:text-blue-700 text-sm"
                            >
                              Reassign
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <UserIcon className="w-4 h-4 mr-1" />
                          <span className="mr-4">{task.assignee}</span>
                          <span className="mr-4">Est: {task.estimate}h</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            task.status === 'completed' ? 'bg-green-100 text-green-800' :
                            task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-600">
                    <p>No tasks yet. Add your first task to get started!</p>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="bg-white rounded-lg shadow-sm border">
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-900">Comments</h3>
                </div>
                
                <div className="p-4">
                  <div className="flex space-x-3 mb-4">
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
                        rows="3"
                      />
                    </div>
                    <button
                      onClick={addComment}
                      disabled={!newComment.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Post
                    </button>
                  </div>
                  
                  {selectedSprint.comments && selectedSprint.comments.length > 0 ? (
                    <div className="space-y-3">
                      {selectedSprint.comments.map((comment) => (
                        <div key={comment.id} className="flex space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                              <UserIcon className="w-4 h-4 text-gray-600" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-gray-900">{comment.author}</span>
                              <span className="text-sm text-gray-500">{comment.time}</span>
                            </div>
                            <p className="text-gray-700">{comment.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-600 py-4">
                      <ChatBubbleLeftIcon className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p>No comments yet. Start the conversation!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
              <ClockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">No Sprint Selected</h3>
              <p className="text-gray-600 mb-6">Choose a sprint from the sidebar to view details and manage tasks.</p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="text-lg font-semibold text-blue-900 mb-3">Getting Started with Sprints</h4>
                <p className="text-blue-800 mb-3">
                  Sprints help you organize work into manageable chunks. Each sprint has goals, tasks, and a timeline that keeps your team 
                  focused and productive.
                </p>
                <div className="text-blue-600 text-sm">
                  <strong>Sprint workflow:</strong> Create Sprint → Add Goals → Add Tasks → Track Progress → Review & Retrospect
                </div>
              </div>
              
              <button 
                onClick={() => setShowCreateSprint(true)}
                className="flex items-center px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 mx-auto"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Create Your First Sprint
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Sprint Modal */}
      {showCreateSprint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw max-h-90vh overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Sprint</h3>
            
            {/* Sprint Creation Help */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>💡 Tip:</strong> A sprint typically lasts 1-4 weeks. 
                Set clear, achievable goals and break them down into specific tasks once created.
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
                  <div key={index} className="flex items-center mb-2">
                    <input
                      type="text"
                      value={goal}
                      onChange={(e) => updateGoal(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md mr-2"
                      placeholder={`Goal ${index + 1}`}
                    />
                    {newSprint.goals.length > 1 && (
                      <button
                        onClick={() => removeGoal(index)}
                        className="px-2 py-2 text-red-600 hover:text-red-700"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addGoal}
                  className="text-blue-600 hover:text-blue-700 text-sm"
                >
                  + Add Goal
                </button>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateSprint(false)}
                disabled={creating}
                className="px-4 py-2 text-gray-600 hover:text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createSprint}
                disabled={!newSprint.name.trim() || !newSprint.startDate || !newSprint.endDate || creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Sprint'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Add New Task</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Task Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., Implement user login form"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Assignee</label>
                <select
                  value={newTask.assignee}
                  onChange={(e) => setNewTask({...newTask, assignee: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="Unassigned">Unassigned</option>
                  <option value="Minsung Kim">Minsung Kim</option>
                  <option value="John Doe">John Doe</option>
                  <option value="Jane Smith">Jane Smith</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Estimate (hours)</label>
                <input
                  type="number"
                  value={newTask.estimate}
                  onChange={(e) => setNewTask({...newTask, estimate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="1"
                  max="40"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowAddTask(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={addTask}
                disabled={!newTask.title.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Task Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">Reassign Task</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">New Assignee</label>
                <select
                  onChange={(e) => reassignTask(showReassignModal, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  defaultValue=""
                >
                  <option value="" disabled>Select assignee...</option>
                  <option value="Unassigned">Unassigned</option>
                  <option value="Minsung Kim">Minsung Kim</option>
                  <option value="John Doe">John Doe</option>
                  <option value="Jane Smith">Jane Smith</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowReassignModal(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SprintManagement;