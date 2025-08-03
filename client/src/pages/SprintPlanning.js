import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  CalendarIcon, 
  ClockIcon, 
  FlagIcon, 
  CheckIcon,
  PlusIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  RocketLaunchIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';

function SprintPlanning() {
  const { currentTeam } = useTeam();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    goals: [''],
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sprintSuggestion, setSprintSuggestion] = useState('');

  // Reset success message after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Generate sprint name suggestion
  useEffect(() => {
    if (currentTeam && !formData.name) {
      const date = new Date();
      const month = date.toLocaleString('default', { month: 'short' });
      const year = date.getFullYear();
      setSprintSuggestion(`Sprint ${month} ${year} - ${currentTeam.name}`);
    }
  }, [currentTeam, formData.name]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentTeam) {
      setError('Please select a team first');
      return;
    }

    // Validate dates
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    if (start >= end) {
      setError('End date must be after start date');
      return;
    }

    setLoading(true);
    setSuccess(false);
    setError('');
    
    try {
      const response = await api.post('/sprints', {
        name: formData.name,
        startDate: formData.startDate,
        endDate: formData.endDate,
        team_id: currentTeam.id,
        goals: formData.goals.filter(g => g.trim()),
        description: formData.description
      });

      if (response.data.success) {
        // Reset form
        setFormData({ name: '', startDate: '', endDate: '', goals: [''], description: '' });
        setSuccess(true);
        
        // Navigate to Sprint Management after a short delay
        setTimeout(() => {
          navigate('/sprint-management');
        }, 1500);
      }
    } catch (error) {
      console.error('Sprint creation error:', error);
      setError(error.response?.data?.error || 'Failed to create sprint. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addGoal = () => {
    if (formData.goals.length < 10) {
      setFormData({
        ...formData,
        goals: [...formData.goals, '']
      });
    }
  };

  const removeGoal = (index) => {
    const newGoals = formData.goals.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      goals: newGoals.length > 0 ? newGoals : ['']
    });
  };

  const updateGoal = (index, value) => {
    const newGoals = [...formData.goals];
    newGoals[index] = value;
    setFormData({
      ...formData,
      goals: newGoals
    });
  };

  const useSuggestedName = () => {
    setFormData({ ...formData, name: sprintSuggestion });
  };

  const setQuickDuration = (weeks) => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + (weeks * 7) - 1);
    
    setFormData({
      ...formData,
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    });
  };

  // Calculate minimum start date (today)
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate minimum end date (day after start date)
  const minEndDate = formData.startDate ? 
    new Date(new Date(formData.startDate).getTime() + 86400000).toISOString().split('T')[0] : 
    today;

  // Calculate sprint metrics
  const getSprintMetrics = () => {
    if (!formData.startDate || !formData.endDate) return null;
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const weeks = (days / 7).toFixed(1);
    const workDays = calculateWorkDays(start, end);
    
    return { days, weeks, workDays };
  };

  const calculateWorkDays = (startDate, endDate) => {
    let count = 0;
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  const metrics = getSprintMetrics();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <RocketLaunchIcon className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-2xl font-bold text-gray-900">Sprint Planning</h1>
          </div>
          
          {/* Success Message */}
          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
              <CheckIcon className="w-5 h-5 text-green-600 mr-2" />
              <p className="text-green-800">Sprint created successfully! Redirecting to Sprint Management...</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-red-800">{error}</p>
            </div>
          )}
          
          {/* Sprint Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
              <LightBulbIcon className="w-5 h-5 mr-2" />
              What is a Sprint?
            </h2>
            <p className="text-blue-800 mb-3">
              A <strong>sprint</strong> is a short, time-boxed period (typically 1-4 weeks) where your team focuses on completing a specific set of work. 
              It's the core building block of Agile development that helps teams deliver value incrementally and adapt quickly to changes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="flex items-start">
                <CalendarIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900">Time-boxed</h3>
                  <p className="text-sm text-blue-700">Fixed duration with clear start and end dates</p>
                </div>
              </div>
              <div className="flex items-start">
                <FlagIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900">Goal-oriented</h3>
                  <p className="text-sm text-blue-700">Focused on specific, achievable objectives</p>
                </div>
              </div>
              <div className="flex items-start">
                <ClockIcon className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900">Iterative</h3>
                  <p className="text-sm text-blue-700">Regular cycles enable continuous improvement</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sprint Creation Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sprint Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Sprint Name
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Sprint 23 - User Dashboard"
                required
              />
              {sprintSuggestion && !formData.name && (
                <button
                  type="button"
                  onClick={useSuggestedName}
                  className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
                >
                  Use suggestion
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">Give your sprint a descriptive name</p>
          </div>

          {/* Quick Duration Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quick Duration</label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => setQuickDuration(1)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                1 week
              </button>
              <button
                type="button"
                onClick={() => setQuickDuration(2)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                2 weeks
              </button>
              <button
                type="button"
                onClick={() => setQuickDuration(3)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                3 weeks
              </button>
              <button
                type="button"
                onClick={() => setQuickDuration(4)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                4 weeks
              </button>
            </div>
          </div>

          {/* Date Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                min={today}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                min={minEndDate}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Sprint Duration Display */}
          {metrics && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{metrics.days}</p>
                  <p className="text-sm text-gray-600">Total Days</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{metrics.workDays}</p>
                  <p className="text-sm text-gray-600">Work Days</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">{metrics.weeks}</p>
                  <p className="text-sm text-gray-600">Weeks</p>
                </div>
              </div>
              
              {metrics.days < 7 && (
                <p className="text-sm text-yellow-600 mt-3 flex items-center">
                  <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                  Short sprint - consider at least 1 week for meaningful progress
                </p>
              )}
              {metrics.days > 30 && (
                <p className="text-sm text-yellow-600 mt-3 flex items-center">
                  <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                  Long sprint - consider 2-4 weeks for better adaptability
                </p>
              )}
            </div>
          )}

          {/* Sprint Goals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Sprint Goals
              </label>
              <span className="text-sm text-gray-500">{formData.goals.filter(g => g.trim()).length} of 10 max</span>
            </div>
            <p className="text-sm text-gray-500 mb-3">Define clear, measurable goals for this sprint</p>
            
            <div className="space-y-3">
              {formData.goals.map((goal, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <div className="flex items-center justify-center w-6 h-6 mt-2 rounded-full bg-blue-100 text-blue-600 text-xs font-medium flex-shrink-0">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => updateGoal(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Goal ${index + 1} - e.g., Complete user authentication feature`}
                    required={index === 0}
                  />
                  {formData.goals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGoal(index)}
                      className="mt-2 text-red-600 hover:text-red-800"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
              
              {formData.goals.length < 10 && (
                <button
                  type="button"
                  onClick={addGoal}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center"
                >
                  <PlusIcon className="w-4 h-4 mr-1" />
                  Add another goal
                </button>
              )}
            </div>
          </div>

          {/* Advanced Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
            >
              <ChartBarIcon className="w-4 h-4 mr-1" />
              {showAdvanced ? 'Hide' : 'Show'} advanced options
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Sprint Description (Optional)
                  </label>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add any additional context or notes about this sprint..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !currentTeam}
              className={`w-full py-3 px-4 rounded-md text-white font-medium transition-colors ${
                loading || !currentTeam
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Creating Sprint...
                </div>
              ) : (
                <div className="flex items-center justify-center">
                  <RocketLaunchIcon className="w-5 h-5 mr-2" />
                  Create Sprint
                </div>
              )}
            </button>
          </div>

          {!currentTeam && (
            <p className="text-sm text-red-600 text-center">
              Please select a team before creating a sprint
            </p>
          )}
        </form>
      </div>

      {/* Sprint Planning Tips */}
      <div className="mt-6 bg-gray-50 rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <LightBulbIcon className="w-5 h-5 mr-2 text-yellow-500" />
          Sprint Planning Best Practices
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">Duration Guidelines</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• <strong>1 week:</strong> Quick iterations, hot fixes</li>
              <li>• <strong>2 weeks:</strong> Most common, good balance</li>
              <li>• <strong>3 weeks:</strong> Complex features, larger teams</li>
              <li>• <strong>4 weeks:</strong> Major releases, extensive testing</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">Goal Setting Tips</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Make goals specific and measurable</li>
              <li>• Align with product roadmap</li>
              <li>• Consider team capacity (70-80% allocation)</li>
              <li>• Include time for reviews and fixes</li>
            </ul>
          </div>
        </div>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Pro tip:</strong> Start with shorter sprints (1-2 weeks) when beginning with Agile. 
            You can always adjust duration as your team finds its rhythm.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SprintPlanning;