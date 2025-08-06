/**
 * Retrospective Component
 * Collects anonymous feedback and displays AI analysis
 */

import React, { useState } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { 
  HandThumbUpIcon, 
  HandThumbDownIcon, 
  LightBulbIcon,
  SparklesIcon,
  ChartBarIcon 
} from '@heroicons/react/24/outline';

function Retrospective() {
  const { currentTeam } = useTeam();
  const [activeTab, setActiveTab] = useState('went_well');
  const [feedback, setFeedback] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const sprintId = 'current'; // Simple sprint ID for demo

  const categories = [
    { id: 'went_well', label: 'What went well?', icon: HandThumbUpIcon, color: 'green' },
    { id: 'could_improve', label: 'What could be improved?', icon: HandThumbDownIcon, color: 'yellow' },
    { id: 'action_items', label: 'Action items', icon: LightBulbIcon, color: 'blue' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!currentTeam || !feedback.trim()) {
      return;
    }
 
    setLoading(true);
    
    try {
      const response = await api.post('/retrospectives', {
        team_id: currentTeam.id,
        sprint_id: sprintId,
        feedback: feedback,
        category: activeTab,
        anonymous: anonymous
      });
      
      setAnalysis(response.data.analysis);
      setFeedback('');
      
      // Show success message
      alert('Feedback submitted successfully!');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Sprint Retrospective</h1>
        <p className="text-gray-600">Reflect on the sprint and provide feedback to improve team performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feedback Form */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Submit Feedback</h2>
          
          {/* Category Tabs */}
          <div className="flex space-x-1 mb-6">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveTab(category.id)}
                  className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === category.id
                      ? `bg-${category.color}-100 text-${category.color}-700 border-${category.color}-300 border`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{category.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Share your thoughts on what ${
                  activeTab === 'went_well' ? 'went well' :
                  activeTab === 'could_improve' ? 'could be improved' :
                  'actions we should take'
                }...`}
                required
              />
            </div>

            <div className="mb-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Submit anonymously</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !currentTeam || !feedback.trim()}
              className={`w-full py-2 px-4 rounded-md text-white font-medium ${
                loading || !currentTeam || !feedback.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
              }`}
            >
              {loading ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>

        {/* AI Analysis */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">AI Analysis</h2>
            <SparklesIcon className="w-5 h-5 text-purple-500" />
          </div>

          {analysis ? (
            <div className="space-y-4">
              {/* Themes */}
              {analysis.themes && analysis.themes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Key Themes</h3>
                  <div className="space-y-2">
                    {analysis.themes.map((theme, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <h4 className="font-medium text-gray-900">{theme.title}</h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            theme.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                            theme.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {theme.sentiment}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {theme.items.length} related feedback items
                        </p>
                        {theme.actionable && (
                          <span className="text-xs text-blue-600 mt-1 inline-block">
                            ✓ Actionable
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overall Sentiment */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Team Sentiment</h3>
                <p className="text-gray-900">{analysis.overall_sentiment || 'Analyzing team feedback...'}</p>
              </div>

              {/* Suggested Actions */}
              {analysis.suggested_actions && analysis.suggested_actions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Suggested Actions</h3>
                  <ul className="space-y-2">
                    {analysis.suggested_actions.map((action, index) => (
                      <li key={index} className="flex items-start">
                        <ChartBarIcon className="w-4 h-4 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <SparklesIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                Submit feedback to see AI-powered insights and analysis
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Guidelines */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Tips for Effective Retrospectives</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Be specific and provide examples when possible</li>
          <li>• Focus on behaviors and processes, not individuals</li>
          <li>• Suggest actionable improvements</li>
          <li>• Keep feedback constructive and professional</li>
        </ul>
      </div>
    </div>
  );
}

export default Retrospective;