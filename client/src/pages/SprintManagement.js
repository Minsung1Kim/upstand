import React, { useState, useEffect } from 'react';
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
  const [sprints, setSprints] = useState([]);
  const [selectedSprint, setSelectedSprint] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', assignee: 'Unassigned', estimate: 1 });
  const [newSprint, setNewSprint] = useState({
    name: '',
    startDate: '',
    endDate: '',
    goals: ['']
  });

  const teamMembers = ['Unassigned', 'Minsung Kim', 'John Doe', 'Jane Smith'];

  // Create new sprint
  const createSprint = () => {
    if (!newSprint.name.trim()) return;
    
    const sprint = {
      id: Date.now(),
      name: newSprint.name,
      status: 'planning',
      startDate: newSprint.startDate,
      endDate: newSprint.endDate,
      progress: 0,
      goals: newSprint.goals.filter(g => g.trim()),
      tasks: [],
      comments: [{
        id: Date.now(),
        author: 'System',
        text: 'Sprint created',
        time: 'just now'
      }]
    };

    setSprints([sprint, ...sprints]);
    setSelectedSprint(sprint);
    setNewSprint({ name: '', startDate: '', endDate: '', goals: [''] });
    setShowCreateSprint(false);
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

  // Add comment
  const addComment = () => {
    if (!newComment.trim() || !selectedSprint) return;
    
    const comment = {
      id: Date.now(),
      author: 'Minsung Kim',
      text: newComment,
      time: 'just now'
    };

    const updatedSprints = sprints.map(sprint => 
      sprint.id === selectedSprint.id 
        ? { ...sprint, comments: [comment, ...sprint.comments] }
        : sprint
    );

    setSprints(updatedSprints);
    setSelectedSprint(prev => ({ ...prev, comments: [comment, ...prev.comments] }));
    setNewComment('');
  };

  // Add task
  const addTask = () => {
    if (!newTask.title.trim() || !selectedSprint) return;

    const task = {
      id: Date.now(),
      title: newTask.title,
      assignee: newTask.assignee,
      status: 'todo',
      estimate: parseInt(newTask.estimate)
    };

    const updatedSprints = sprints.map(sprint =>
      sprint.id === selectedSprint.id
        ? { ...sprint, tasks: [...sprint.tasks, task] }
        : sprint
    );

    setSprints(updatedSprints);
    setSelectedSprint(prev => ({ ...prev, tasks: [...prev.tasks, task] }));
    setNewTask({ title: '', assignee: 'Unassigned', estimate: 1 });
    setShowAddTask(false);
  };

  // Update task status
  const updateTaskStatus = (taskId, newStatus) => {
    const updateTasks = (tasks) => 
      tasks.map(task => task.id === taskId ? { ...task, status: newStatus } : task);

    const updatedSprints = sprints.map(sprint =>
      sprint.id === selectedSprint.id
        ? { ...sprint, tasks: updateTasks(sprint.tasks) }
        : sprint
    );

    setSprints(updatedSprints);
    setSelectedSprint(prev => ({ ...prev, tasks: updateTasks(prev.tasks) }));
  };

  // Reassign task
  const reassignTask = (taskId, newAssignee) => {
    const updateTasks = (tasks) => 
      tasks.map(task => task.id === taskId ? { ...task, assignee: newAssignee } : task);

    const updatedSprints = sprints.map(sprint =>
      sprint.id === selectedSprint.id
        ? { ...sprint, tasks: updateTasks(sprint.tasks) }
        : sprint
    );

    setSprints(updatedSprints);
    setSelectedSprint(prev => ({ ...prev, tasks: updateTasks(prev.tasks) }));
    setShowReassignModal(null);
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
      </div>

      {/* Create Sprint Modal */}
      {showCreateSprint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw max-h-90vh overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Create New Sprint</h3>
            
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
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
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
            <p className="text-sm text-gray-600 mb-4">Task: {showReassignModal.title}</p>
            
            <div className="space-y-3">
              {teamMembers.map(member => (
                <button
                  key={member}
                  onClick={() => reassignTask(showReassignModal.id, member)}
                  className={`w-full text-left p-3 rounded-lg border hover:bg-gray-50 ${
                    showReassignModal.assignee === member ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
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
                <p className="text-sm">No sprints yet.</p>
                <p className="text-sm">Create your first sprint!</p>
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
              <p className="text-gray-600 mb-6">Select a sprint from the sidebar or create a new one to get started.</p>
              <button 
                onClick={() => setShowCreateSprint(true)}
                className="flex items-center mx-auto px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Create Your First Sprint
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
                <p className="text-gray-600 mb-4">
                  Monitor the capacity of your team. 
                  <span className="text-blue-600 ml-1">Reassign work items to get the right balance</span>
                </p>
                
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
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
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
                        <input 
                          type="checkbox" 
                          checked={task.status === 'completed'}
                          onChange={(e) => updateTaskStatus(task.id, e.target.checked ? 'completed' : 'todo')}
                          className="w-4 h-4"
                        />
                        <div>
                          <div className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                            {task.title}
                          </div>
                          <div className="text-sm text-gray-600">
                            {task.assignee} • {task.estimate}h
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${getTaskStatusColor(task.status)}`}>
                          {task.status.replace('-', ' ')}
                        </span>
                        <button 
                          onClick={() => setShowReassignModal(task)}
                          className="text-gray-400 hover:text-gray-600 p-1"
                          title="Reassign task"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
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