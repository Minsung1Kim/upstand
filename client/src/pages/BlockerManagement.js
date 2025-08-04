import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import { useCompany } from '../context/CompanyContext';
import { 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  ClockIcon, 
  UserIcon,
  ChartBarIcon,
  FireIcon,
  ShieldCheckIcon,
  ChatBubbleLeftRightIcon,
  ArrowTrendingUpIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

function BlockerManagement() {
  const { currentTeam } = useTeam();
  const { currentCompany } = useCompany();
  
  const [blockers, setBlockers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, active, resolved, high, medium, low
  const [selectedBlocker, setSelectedBlocker] = useState(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Default to connected

  useEffect(() => {
    if (currentTeam?.id && currentCompany?.id) {
      fetchBlockers();
      fetchBlockerAnalytics();
    }
  }, [currentTeam?.id, currentCompany?.id]);

  const fetchBlockers = async () => {
    try {
      const token = await window.firebase.auth().currentUser?.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/blockers/active?team_id=${currentTeam.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': currentCompany.id
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBlockers(data.blockers || []);
      }
    } catch (error) {
      console.error('Error fetching blockers:', error);
    }
  };

  const fetchBlockerAnalytics = async () => {
    try {
      const token = await window.firebase.auth().currentUser?.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/analytics/blocker-summary?team_id=${currentTeam.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': currentCompany.id
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.blocker_analytics);
      }
    } catch (error) {
      console.error('Error fetching blocker analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const resolveBlocker = async (blockerId, resolution) => {
    try {
      const token = await window.firebase.auth().currentUser?.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/blockers/${blockerId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': currentCompany.id
        },
        body: JSON.stringify({ resolution })
      });
      
      if (response.ok) {
        await fetchBlockers();
        await fetchBlockerAnalytics();
        setShowResolutionModal(false);
        setSelectedBlocker(null);
      }
    } catch (error) {
      console.error('Error resolving blocker:', error);
    }
  };

  const escalateBlocker = async (blockerId) => {
    try {
      const token = await window.firebase.auth().currentUser?.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/blockers/${blockerId}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': currentCompany.id
        }
      });
      
      if (response.ok) {
        await fetchBlockers();
        await fetchBlockerAnalytics();
      }
    } catch (error) {
      console.error('Error escalating blocker:', error);
    }
  };

  const handleResolutionSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const resolution = formData.get('resolution');
    
    if (selectedBlocker && resolution.trim()) {
      await resolveBlocker(selectedBlocker.id, resolution.trim());
    }
  };

  const filteredBlockers = blockers.filter(blocker => {
    if (filter === 'all') return true;
    if (filter === 'active') return blocker.status === 'active';
    if (filter === 'resolved') return blocker.status === 'resolved';
    if (filter === 'high' || filter === 'medium' || filter === 'low') {
      return blocker.severity === filter;
    }
    return true;
  });

  const formatTimeAgo = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  if (!currentTeam) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-8">
          <p className="text-gray-500">Please select a team to view blockers</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{borderBottomColor: '#343148'}}></div>
          <p className="mt-4 text-gray-600">Loading blocker data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" style={{color: '#343148'}}>
              Team Blockers
            </h1>
            <p className="text-gray-600 mt-1">
              AI-detected issues and team impediments
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Live monitoring' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Blockers</p>
                <p className="text-2xl font-bold text-gray-900">
                  {blockers.filter(b => b.status === 'active').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <FireIcon className="w-8 h-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">High Severity</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.blocker_severity_counts?.high || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <ArrowTrendingUpIcon className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Blocker Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analytics.blocker_percentage || 0}%
                </p>
                <p className="text-xs text-gray-500">of standups</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <CheckCircleIcon className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Resolved</p>
                <p className="text-2xl font-bold text-gray-900">
                  {blockers.filter(b => b.status === 'resolved').length}
                </p>
                <p className="text-xs text-gray-500">this month</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b">
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Blockers', count: blockers.length },
              { key: 'active', label: 'Active', count: blockers.filter(b => b.status === 'active').length },
              { key: 'high', label: 'High Priority', count: blockers.filter(b => b.severity === 'high').length },
              { key: 'medium', label: 'Medium Priority', count: blockers.filter(b => b.severity === 'medium').length },
              { key: 'resolved', label: 'Resolved', count: blockers.filter(b => b.status === 'resolved').length }
            ].map(filterOption => (
              <button
                key={filterOption.key}
                onClick={() => setFilter(filterOption.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === filterOption.key
                    ? 'text-white'
                    : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={filter === filterOption.key ? { backgroundColor: '#343148' } : {}}
              >
                {filterOption.label} ({filterOption.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Blockers List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {filter === 'all' ? 'All Blockers' : 
             filter === 'active' ? 'Active Blockers' :
             filter === 'resolved' ? 'Resolved Blockers' :
             `${filter.charAt(0).toUpperCase() + filter.slice(1)} Priority Blockers`}
          </h2>
        </div>

        {filteredBlockers.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheckIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {filter === 'active' ? 'No Active Blockers' : 'No Blockers Found'}
            </h3>
            <p className="text-gray-600">
              {filter === 'active' 
                ? 'Great! Your team has no active blockers right now.'
                : 'Try adjusting your filters to see more results.'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredBlockers.map((blocker, index) => (
              <div key={index} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className={`w-3 h-3 rounded-full ${
                        blocker.severity === 'high' ? 'bg-red-500' :
                        blocker.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}></div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {blocker.keyword || 'General Blocker'}
                      </h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        blocker.status === 'active' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {blocker.status}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        blocker.severity === 'high' ? 'bg-red-100 text-red-800' :
                        blocker.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {blocker.severity} priority
                      </span>
                    </div>

                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center">
                        <UserIcon className="w-4 h-4 mr-1" />
                        {blocker.user_name || blocker.user_email}
                      </div>
                      <div className="flex items-center">
                        <ClockIcon className="w-4 h-4 mr-1" />
                        {formatTimeAgo(blocker.created_at)}
                      </div>
                    </div>

                    {blocker.standup_context && (
                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-gray-600 font-medium mb-1">From standup:</p>
                        <p className="text-sm text-gray-700">{blocker.standup_context}</p>
                      </div>
                    )}

                    {blocker.resolution && (
                      <div className="bg-green-50 rounded-lg p-3 mb-3">
                        <p className="text-sm text-green-800 font-medium mb-1">Resolution:</p>
                        <p className="text-sm text-green-700">{blocker.resolution}</p>
                        <p className="text-xs text-green-600 mt-1">
                          Resolved {formatTimeAgo(blocker.resolved_at)} by {blocker.resolved_by}
                        </p>
                      </div>
                    )}
                  </div>

                  {blocker.status === 'active' && (
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedBlocker(blocker);
                          setShowResolutionModal(true);
                        }}
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded-md hover:bg-green-200 transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => escalateBlocker(blocker.id)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                      >
                        Escalate
                      </button>
                      <button
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                      >
                        <ChatBubbleLeftRightIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {showResolutionModal && selectedBlocker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Resolve Blocker</h3>
              <button
                onClick={() => setShowResolutionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Blocker:</p>
              <p className="font-medium text-gray-900">{selectedBlocker.keyword}</p>
              {selectedBlocker.standup_context && (
                <p className="text-sm text-gray-600 mt-1">{selectedBlocker.standup_context}</p>
              )}
            </div>

            <form onSubmit={handleResolutionSubmit}>
              <div className="mb-4">
                <label htmlFor="resolution" className="block text-sm font-medium text-gray-700 mb-2">
                  How was this blocker resolved?
                </label>
                <textarea
                  name="resolution"
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe how this blocker was resolved..."
                  required
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                >
                  Mark as Resolved
                </button>
                <button
                  type="button"
                  onClick={() => setShowResolutionModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default BlockerManagement;