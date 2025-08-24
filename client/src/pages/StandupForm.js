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
  const [blockers, setBlockers] = useState(['']); // start with one row

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Helpers for dynamic blockers UI
  const addBlockerRow = () => {
    if (blockers.length >= 5) return; // cap at 5 to keep UX sane
    setBlockers([...blockers, '']);
  };

  const updateBlockerRow = (i, val) => {
    const next = [...blockers];
    next[i] = val;
    setBlockers(next);
  };

  const removeBlockerRow = (i) => {
    const next = blockers.filter((_, idx) => idx !== i);
    setBlockers(next.length ? next : ['']); // keep at least one row
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
      const payload = {
        yesterday: formData.yesterday,
        today: formData.today,
        team_id: currentTeam.id,
        blockers: blockers.filter((b) => b && b.trim()), // array of strings
        blockers_text: formData.blockers, // optional: keep old textarea
      };
      const result = await api.post('/submit-standup', payload);
      
      setResponse(result.data);
      // Clear form after successful submission
      setFormData({
        yesterday: '',
        today: '',
        blockers: ''
      });
      setBlockers(['']);
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

            {/* INSERT: dynamic blockers UI */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="font-medium">Add blockers (one per line)</label>
                <button type="button" onClick={addBlockerRow} className="text-sm underline">
                  + Add blocker
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {blockers.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={b}
                      onChange={(e) => updateBlockerRow(i, e.target.value)}
                      placeholder={`Blocker ${i + 1}`}
                      className="w-full border rounded px-3 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => removeBlockerRow(i)}
                      className="px-2 text-sm"
                      aria-label={`Remove blocker ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-1 text-xs text-gray-500">
                {blockers.filter((b) => b.trim()).length} blocker(s) will be submitted
              </div>
            </div>
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


      {/* Enhanced Blocker Analysis */}
      {response.blocker_analysis && response.blocker_analysis.has_blockers && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">🚨 Detected Blockers</h2>
          
          {/* AI Overall Analysis */}
          {response.blocker_analysis.ai_analysis && (
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">🤖 AI Analysis</h3>
              <p className="text-sm text-blue-800">{response.blocker_analysis.ai_analysis}</p>
            </div>
          )}
          
          {/* Individual Blockers */}
          <div className="space-y-3">
            {response.blocker_analysis.blockers.map((blocker, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start space-x-3 mb-2">
                  <ExclamationCircleIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    blocker.severity === 'high' ? 'text-red-500' :
                    blocker.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h4 className="text-sm font-medium text-gray-900">
                        {typeof blocker === 'string' ? blocker : blocker.keyword || 'Blocker detected'}
                      </h4>
                      {blocker.severity && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          blocker.severity === 'high' ? 'bg-red-100 text-red-800' :
                          blocker.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {blocker.severity} priority
                        </span>
                      )}
                      {blocker.detection_method && (
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                          {blocker.detection_method === 'ai' ? '🤖 AI' : '🔍 Keyword'}
                        </span>
                      )}
                    </div>
                    
                    {blocker.context && typeof blocker === 'object' && (
                      <p className="text-sm text-gray-600 mb-2">{blocker.context}</p>
                    )}
                    
                    {/* AI Suggestions */}
                    {blocker.ai_suggestions && blocker.ai_suggestions.length > 0 && (
                      <div className="bg-green-50 rounded p-3 mt-2">
                        <p className="text-xs font-medium text-green-800 mb-1">💡 AI Suggestions:</p>
                        <ul className="text-xs text-green-700 space-y-1">
                          {blocker.ai_suggestions.map((suggestion, i) => (
                            <li key={i} className="flex items-start">
                              <span className="mr-1">•</span>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Overall Severity: <span className={`font-medium ${
                response.blocker_analysis.severity === 'high' ? 'text-red-600' :
                response.blocker_analysis.severity === 'medium' ? 'text-yellow-600' :
                'text-green-600'
              }`}>{response.blocker_analysis.severity}</span>
            </p>
            {response.blocker_analysis.sentiment && (
              <p className="text-sm text-gray-600">
                Sentiment: <span className={`font-medium ${
                  response.blocker_analysis.sentiment === 'positive' ? 'text-green-600' :
                  response.blocker_analysis.sentiment === 'negative' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>{response.blocker_analysis.sentiment}</span>
              </p>
            )}
          </div>
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
                    response.blocker_analysis?.sentiment === 'positive' ? 'text-green-600' :
                    response.blocker_analysis?.sentiment === 'negative' ? 'text-red-600' :
                    'text-yellow-600'
                  }`}>
                    {response.blocker_analysis?.sentiment || 'neutral'}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    response.blocker_analysis?.sentiment === 'positive' ? 'bg-green-500' :
                    response.blocker_analysis?.sentiment === 'negative' ? 'bg-red-500' :
                    'bg-yellow-500'
                  }`}
                  style={{ width: `${((response.blocker_analysis?.sentiment_score ?? 0) + 1) * 50}%` }}
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