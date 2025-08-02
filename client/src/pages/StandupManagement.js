import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { 
  PlusIcon, 
  UserIcon, 
  ClockIcon, 
  ExclamationTriangleIcon,
  FaceSmileIcon,
  FaceFrownIcon,
  ArrowPathIcon,
  ChatBubbleLeftIcon
} from '@heroicons/react/24/outline';

function StandupManagement() {
  const { currentTeam } = useTeam();
  const { currentUser } = useAuth();
  const [standups, setStandups] = useState([]);
  const [selectedStandup, setSelectedStandup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateStandup, setShowCreateStandup] = useState(false);
  
  const [newStandup, setNewStandup] = useState({
    yesterday: '',
    today: '',
    blockers: ''
  });

  // Fetch standups when component mounts or team changes
  useEffect(() => {
    if (currentTeam?.id) {
      fetchStandups();
    } else {
      setLoading(false);
      setStandups([]);
      setSelectedStandup(null);
    }
  }, [currentTeam?.id]);

  // Fetch standups from API
  const fetchStandups = async () => {
    if (!currentTeam?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Fetching standups for team:', currentTeam.id);
      
      const response = await api.get(`/standups?team_id=${currentTeam.id}`);
      
      console.log('Standups response:', response.data);
      
      if (response.data.success && response.data.standups) {
        setStandups(response.data.standups);
        
        // Auto-select first standup if none selected and standups exist
        if (response.data.standups.length > 0 && !selectedStandup) {
          setSelectedStandup(response.data.standups[0]);
        }
      } else {
        setStandups([]);
        setSelectedStandup(null);
      }
    } catch (error) {
      console.error('Failed to fetch standups:', error);
      setStandups([]);
      setSelectedStandup(null);
    } finally {
      setLoading(false);
    }
  };

  // Create new standup
  const createStandup = async () => {
    if (!newStandup.yesterday.trim() && !newStandup.today.trim()) return;
    
    setCreating(true);
    try {
      console.log('Creating standup with data:', {
        yesterday: newStandup.yesterday,
        today: newStandup.today,
        blockers: newStandup.blockers,
        team_id: currentTeam.id
      });
      
      const response = await api.post('/submit-standup', {
        yesterday: newStandup.yesterday,
        today: newStandup.today,
        blockers: newStandup.blockers,
        team_id: currentTeam.id
      });
      
      console.log('Create standup response:', response.data);
      
      if (response.data.success) {
        // Reset form and close modal
        setNewStandup({ yesterday: '', today: '', blockers: '' });
        setShowCreateStandup(false);
        
        // Refetch standups to show the new one
        await fetchStandups();
        
        alert('Standup submitted successfully!');
      }
    } catch (error) {
      console.error('Failed to create standup:', error);
      alert('Failed to submit standup: ' + (error.response?.data?.error || error.message));
    } finally {
      setCreating(false);
    }
  };

  const getSentimentIcon = (sentiment) => {
    const sentimentType = sentiment?.sentiment || sentiment;
    switch (sentimentType) {
      case 'positive':
        return <FaceSmileIcon className="w-5 h-5 text-green-500" />;
      case 'negative':
        return <FaceFrownIcon className="w-5 h-5 text-red-500" />;
      default:
        return <FaceSmileIcon className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getSentimentColor = (sentiment) => {
    const sentimentType = sentiment?.sentiment || sentiment;
    switch (sentimentType) {
      case 'positive':
        return 'bg-green-100 text-green-800';
      case 'negative':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  if (!currentTeam) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Standup Management</h1>
          <p className="text-gray-600">Please select a team to manage standups.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-600">Loading standups...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Standup Management</h1>
            <p className="text-gray-600 mt-2">Submit daily standups and track team progress</p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={fetchStandups}
              disabled={loading}
              className="flex items-center px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button 
              onClick={() => setShowCreateStandup(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Submit Standup
            </button>
          </div>
        </div>
        
        {/* Standup Explanation for New Users */}
        {standups.length === 0 && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <UserIcon className="w-5 h-5 text-blue-600 mt-0.5" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-900">What are Daily Standups?</h3>
                <p className="mt-1 text-sm text-blue-700">
                  Daily standups are short team meetings where everyone shares: what they did yesterday, 
                  what they're working on today, and any blockers they're facing.
                </p>
                <div className="mt-2 text-sm text-blue-600">
                  <strong>Get started:</strong> Submit your first standup to share your progress with the team!
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Standup List Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Recent Standups</h2>
              <p className="text-sm text-gray-600">Last 7 days</p>
            </div>
            
            {standups.length === 0 ? (
              <div className="p-6 text-center">
                <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No standups yet</h3>
                <p className="text-gray-600 mb-4">Submit your first standup to get started.</p>
                <button 
                  onClick={() => setShowCreateStandup(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Submit Standup
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {standups.map((standup) => (
                  <div
                    key={standup.id}
                    onClick={() => setSelectedStandup(standup)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 ${
                      selectedStandup?.id === standup.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-900">
                        {formatDate(standup.date)}
                      </h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${getSentimentColor(standup.sentiment)}`}>
                        {standup.sentiment?.sentiment || 'neutral'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-1">
                      {standup.user_email}
                    </div>
                    <div className="flex items-center">
                      {getSentimentIcon(standup.sentiment)}
                      <span className="ml-2 text-xs text-gray-500">
                        {standup.blockers ? 'Has blockers' : 'No blockers'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Standup Details */}
        <div className="lg:col-span-2">
          {selectedStandup ? (
            <div className="space-y-6">
              {/* Standup Header */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Standup for {formatDate(selectedStandup.date)}
                  </h2>
                  <div className="flex items-center">
                    {getSentimentIcon(selectedStandup.sentiment)}
                    <span className={`ml-2 px-3 py-1 rounded-full text-sm ${getSentimentColor(selectedStandup.sentiment)}`}>
                      {selectedStandup.sentiment?.sentiment || 'neutral'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center text-gray-600 mb-4">
                  <UserIcon className="w-4 h-4 mr-1" />
                  <span>{selectedStandup.user_email}</span>
                  <span className="mx-2">•</span>
                  <span>{selectedStandup.time}</span>
                </div>
              </div>

              {/* Standup Content */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="space-y-6">
                  {/* Yesterday */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">What I did yesterday</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-700">
                        {selectedStandup.yesterday || 'No updates provided'}
                      </p>
                    </div>
                  </div>

                  {/* Today */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">What I'm working on today</h3>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-gray-700">
                        {selectedStandup.today || 'No plans provided'}
                      </p>
                    </div>
                  </div>

                  {/* Blockers */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                      <ExclamationTriangleIcon className="w-5 h-5 mr-2 text-red-500" />
                      Blockers
                    </h3>
                    <div className={`rounded-lg p-4 ${selectedStandup.blockers ? 'bg-red-50' : 'bg-green-50'}`}>
                      <p className="text-gray-700">
                        {selectedStandup.blockers || 'No blockers reported! 🎉'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sentiment Analysis */}
              {selectedStandup.sentiment && (
                <div className="bg-white rounded-lg shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Sentiment Analysis</h3>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Overall Sentiment</span>
                      <span className={`text-sm font-medium ${getSentimentColor(selectedStandup.sentiment)} px-2 py-1 rounded`}>
                        {selectedStandup.sentiment.sentiment || 'neutral'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <p>Confidence: {Math.round((selectedStandup.sentiment.confidence || 0) * 100)}%</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
              <ClockIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">No Standup Selected</h3>
              <p className="text-gray-600 mb-6">Choose a standup from the sidebar to view details.</p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="text-lg font-semibold text-blue-900 mb-3">Daily Standup Benefits</h4>
                <div className="text-blue-800 text-left space-y-2">
                  <p>• Keep team aligned on daily progress</p>
                  <p>• Identify and resolve blockers quickly</p>
                  <p>• Build accountability and transparency</p>
                  <p>• Track team sentiment and productivity</p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowCreateStandup(true)}
                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 mx-auto"
              >
                <PlusIcon className="w-5 h-5 mr-2" />
                Submit Today's Standup
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Standup Modal */}
      {showCreateStandup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw max-h-90vh overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Submit Daily Standup</h3>
            
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600">
                <strong>💡 Tip:</strong> Keep it brief and focus on what's most important for your team to know.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">What did you work on yesterday?</label>
                <textarea
                  value={newStandup.yesterday}
                  onChange={(e) => setNewStandup({...newStandup, yesterday: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
                  rows="3"
                  placeholder="e.g., Completed user authentication feature, fixed bug in payment system..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">What are you working on today?</label>
                <textarea
                  value={newStandup.today}
                  onChange={(e) => setNewStandup({...newStandup, today: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
                  rows="3"
                  placeholder="e.g., Working on API integration, reviewing pull requests, meeting with design team..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Any blockers or issues?</label>
                <textarea
                  value={newStandup.blockers}
                  onChange={(e) => setNewStandup({...newStandup, blockers: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md resize-none"
                  rows="2"
                  placeholder="e.g., Waiting for API documentation, need help with database query... (or leave blank if none)"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateStandup(false)}
                disabled={creating}
                className="px-4 py-2 text-gray-600 hover:text-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createStandup}
                disabled={(!newStandup.yesterday.trim() && !newStandup.today.trim()) || creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Submitting...' : 'Submit Standup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StandupManagement;