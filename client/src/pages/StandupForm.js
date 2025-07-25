/**
 * StandupForm Component - Daily standup submission form
 * Collects yesterday's work, today's plan, and blockers
 */

import React, { useState } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

function StandupForm() {
  const { currentTeam } = useTeam();
  const [formData, setFormData] = useState({
    yesterday: '',
    today: '',
    blockers: ''
  });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentTeam) {
      setError('Please select a team first');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const result = await api.post('/submit-standup', {
        ...formData,
        team_id: currentTeam.id
      });
      
      setResponse(result.data);
      // Clear form after successful submission
      setFormData({
        yesterday: '',
        today: '',
        blockers: ''
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit standup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Daily Standup</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Yesterday's Work */}
          <div>
            <label htmlFor="yesterday" className="block text-sm font-medium text-gray-700 mb-2">
              What did you accomplish yesterday?
            </label>
            <textarea
              id="yesterday"
              name="yesterday"
              rows={4}
              value={formData.yesterday}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe what you worked on and completed yesterday..."
            />
          </div>

          {/* Today's Plan */}
          <div>
            <label htmlFor="today" className="block text-sm font-medium text-gray-700 mb-2">
              What will you work on today?
            </label>
            <textarea
              id="today"
              name="today"
              rows={4}
              value={formData.today}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="List your priorities and tasks for today..."
            />
          </div>

          {/* Blockers */}
          <div>
            <label htmlFor="blockers" className="block text-sm font-medium text-gray-700 mb-2">
              Any blockers or impediments?
            </label>
            <textarea
              id="blockers"
              name="blockers"
              rows={3}
              value={formData.blockers}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe any issues blocking your progress (optional)..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded flex items-center">
              <ExclamationCircleIcon className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !currentTeam}
            className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
              ${loading || !currentTeam 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
          >
            {loading ? 'Submitting...' : 'Submit Standup'}
          </button>
        </form>
      </div>

      {/* AI Response */}
      {response && (
        <div className="space-y-4">
          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded flex items-center">
            <CheckCircleIcon className="w-5 h-5 mr-2" />
            Standup submitted successfully!
          </div>

          {/* Blocker Analysis */}
          {response.blocker_analysis && response.blocker_analysis.has_blockers && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">🚨 Detected Blockers</h2>
              <div className="space-y-2">
                {response.blocker_analysis.blockers.map((blocker, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700">{blocker}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm text-gray-600">
                Severity: <span className={`font-medium ${
                  response.blocker_analysis.severity === 'high' ? 'text-red-600' :
                  response.blocker_analysis.severity === 'medium' ? 'text-yellow-600' :
                  'text-green-600'
                }`}>{response.blocker_analysis.severity}</span>
              </p>
            </div>
          )}

          {/* Sentiment Analysis */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">😊 Sentiment Analysis</h2>
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Sentiment</span>
                  <span className={`text-sm font-medium ${
                    response.sentiment?.sentiment === 'positive' ? 'text-green-600' :
                    response.sentiment?.sentiment === 'negative' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {response.sentiment?.sentiment || 'neutral'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      response.sentiment?.sentiment === 'positive' ? 'bg-green-500' :
                      response.sentiment?.sentiment === 'negative' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}
                    style={{ width: `${((response.sentiment?.score || 0) + 1) * 50}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Team Summary */}
          {response.team_summary && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">📊 Team Summary</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{response.team_summary}</p>
              <p className="mt-4 text-sm text-gray-500">
                {response.team_standup_count} team members have submitted their standup today
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StandupForm;