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
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const SprintManagementDashboard = () => {
  const [sprints, setSprints] = useState([
    {
      id: 1,
      name: 'User Authentication Sprint',
      status: 'active',
      startDate: '2025-01-15',
      endDate: '2025-01-29',
      progress: 65,
      goals: [
        'Implement OAuth login',
        'Add password reset functionality',
        'Create user profile management'
      ],
      tasks: [
        { id: 1, title: 'Design login UI', assignee: 'Minsung Kim', status: 'completed', estimate: 5 },
        { id: 2, title: 'Implement OAuth integration', assignee: 'Minsung Kim', status: 'in-progress', estimate: 8 },
        { id: 3, title: 'Password reset flow', assignee: 'Unassigned', status: 'todo', estimate: 3 },
        { id: 4, title: 'User profile API', assignee: 'Minsung Kim', status: 'todo', estimate: 5 },
      ],
      comments: [
        { id: 1, author: 'Minsung Kim', text: 'OAuth integration is 80% complete, need to handle edge cases', time: '2 hours ago' },
        { id: 2, author: 'System', text: 'Sprint started', time: '3 days ago' }
      ]
    },
    {
      id: 2,
      name: 'Dashboard Analytics',
      status: 'planning',
      startDate: '2025-02-01',
      endDate: '2025-02-14',
      progress: 0,
      goals: [
        'Build team metrics dashboard',
        'Add data visualization charts',
        'Implement real-time updates'
      ],
      tasks: [],
      comments: []
    }
  ]);

  const [selectedSprint, setSelectedSprint] = useState(sprints[0]);
  const [newComment, setNewComment] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assignee: 'Unassigned', estimate: 1 });

  // Calculate team workload
  const getTeamWorkload = () => {
    const activeTasks = selectedSprint.tasks.filter(task => task.status !== 'completed');
    const totalWork = activeTasks.reduce((sum, task) => sum + task.estimate, 0);
    const assignedWork = activeTasks
      .filter(task => task.assignee !== 'Unassigned')
      .reduce((sum, task) => sum + task.estimate, 0);
    const unassignedWork = totalWork - assignedWork;

    return {
      assigned: Math.round((assignedWork / Math.max(totalWork, 1)) * 100),
      unassigned: Math.round((unassignedWork / Math.max(totalWork, 1)) * 100),
      totalHours: totalWork
    };
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    
    const comment = {
      id: Date.now(),
      author: 'Minsung Kim',
      text: newComment,
      time: 'just now'
    };

    setSprints(sprints.map(sprint => 
      sprint.id === selectedSprint.id 
        ? { ...sprint, comments: [comment, ...sprint.comments] }
        : sprint
    ));

    setSelectedSprint(prev => ({ ...prev, comments: [comment, ...prev.comments] }));
    setNewComment('');
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;

    const task = {
      id: Date.now(),
      title: newTask.title,
      assignee: newTask.assignee,
      status: 'todo',
      estimate: parseInt(newTask.estimate)
    };

    setSprints(sprints.map(sprint =>
      sprint.id === selectedSprint.id
        ? { ...sprint, tasks: [...sprint.tasks, task] }
        : sprint
    ));

    setSelectedSprint(prev => ({ ...prev, tasks: [...prev.tasks, task] }));
    setNewTask({ title: '', assignee: 'Unassigned', estimate: 1 });
    setShowAddTask(false);
  };

  const updateTaskStatus = (taskId, newStatus) => {
    const updateTasks = (tasks) => 
      tasks.map(task => task.id === taskId ? { ...task, status: newStatus } : task);

    setSprints(sprints.map(sprint =>
      sprint.id === selectedSprint.id
        ? { ...sprint, tasks: updateTasks(sprint.tasks) }
        : sprint
    ));

    setSelectedSprint(prev => ({ ...prev, tasks: updateTasks(prev.tasks) }));
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Sprint Management</h1>
        <p className="text-gray-600 mt-2">Manage your sprints, track progress, and coordinate team work</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sprint List Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Sprints</h2>
            <div className="space-y-3">
              {sprints.map(sprint => (
                <div
                  key={sprint.id}
                  onClick={() => setSelectedSprint(sprint)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedSprint.id === sprint.id 
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
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
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
                  <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
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
            
            {workload.unassigned > 40 && (
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
                    <option>Unassigned</option>
                    <option>Minsung Kim</option>
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
        </div>
      </div>
    </div>
  );
};

export default SprintManagementDashboard;