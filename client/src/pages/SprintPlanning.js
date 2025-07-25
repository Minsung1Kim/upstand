import React, { useState } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { CalendarIcon, ClockIcon, FlagIcon } from '@heroicons/react/24/outline';

function SprintPlanning() {
  const { currentTeam } = useTeam();
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    goals: ['']
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentTeam) return;

    setLoading(true);
    try {
      await api.post('/create-sprint', {
        ...formData,
        team_id: currentTeam.id,
        goals: formData.goals.filter(g => g.trim())
      });
      alert('Sprint created successfully!');
      // Reset form
      setFormData({ name: '', startDate: '', endDate: '', goals: [''] });
    } catch (error) {
      alert('Failed to create sprint');
    } finally {
      setLoading(false);
    }
  };

  const addGoal = () => {
    setFormData({
      ...formData,
      goals: [...formData.goals, '']
    });
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Sprint Planning</h1>
          
          {/* Sprint Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">What is a Sprint?</h2>
            <p className="text-blue-800 mb-3">
              A <strong>sprint</strong> is a short, time-boxed period (typically 1-4 weeks) where your team focuses on completing a specific set of work. 
              It's the core building block of Agile development that helps teams deliver value incrementally and adapt quickly to changes.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="flex items-start space-x-2">
                <ClockIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900">Time-Boxed</h3>
                  <p className="text-sm text-blue-700">Fixed duration with clear start and end dates</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-2">
                <FlagIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900">Goal-Oriented</h3>
                  <p className="text-sm text-blue-700">Focused on achieving specific objectives</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-2">
                <CalendarIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-blue-900">Iterative</h3>
                  <p className="text-sm text-blue-700">Builds on previous work and learning</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Sprint Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sprint Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="e.g., Sprint 1, User Authentication Sprint, Q1 Features"
            />
            <p className="text-xs text-gray-500 mt-1">Choose a descriptive name that reflects the sprint's focus</p>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date *
              </label>
              <input
                type="date"
                required
                value={formData.startDate}
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date *
              </label>
              <input
                type="date"
                required
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Sprint Goals */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sprint Goals
            </label>
            <p className="text-sm text-gray-500 mb-3">
              Define 2-4 high-level objectives that describe what you want to achieve in this sprint
            </p>
            
            <div className="space-y-3">
              {formData.goals.map((goal, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={goal}
                    onChange={(e) => updateGoal(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={`Goal ${index + 1}: e.g., Complete user registration feature`}
                  />
                  {formData.goals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeGoal(index)}
                      className="px-3 py-2 text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            {formData.goals.length < 5 && (
              <button
                type="button"
                onClick={addGoal}
                className="mt-3 px-4 py-2 text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                + Add Another Goal
              </button>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !currentTeam}
              className={`w-full py-3 px-4 text-sm font-medium rounded-md text-white ${
                loading || !currentTeam
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating Sprint...
                </div>
              ) : (
                'Create Sprint'
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
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">💡 Sprint Planning Tips</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Keep sprints between 1-4 weeks (2 weeks is most common)</li>
          <li>• Set 2-4 clear, measurable goals that align with your product vision</li>
          <li>• Make sure your team has the capacity to complete the planned work</li>
          <li>• Include time for testing, code review, and unexpected issues</li>
          <li>• Review and adjust goals based on team feedback and past sprint performance</li>
        </ul>
      </div>
    </div>
  );
}

export default SprintPlanning;