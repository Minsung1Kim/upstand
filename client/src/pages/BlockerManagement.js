import React, { useState, useEffect } from 'react';
import api from '../services/api';
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
  XMarkIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

function BlockerManagement() {
  const { currentTeam } = useTeam();
  const { currentCompany } = useCompany();
  const currentTeamId = currentTeam?.id;
  
  const [blockers, setBlockers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // legacy filter UI
  const [tab, setTab] = useState('active'); // 'active' | 'resolved'
  const [priority, setPriority] = useState(''); // '' | 'low' | 'medium' | 'high'
  const [items, setItems] = useState([]);
  const [selectedBlocker, setSelectedBlocker] = useState(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Default to connected
  const [aiAnalyzing, setAiAnalyzing] = useState(null); // Track which blocker is being analyzed

  useEffect(() => {
    if (currentTeam?.id && currentCompany?.id) {
      fetchBlockers();
      fetchBlockerAnalytics();
    }
  }, [currentTeam?.id, currentCompany?.id]);

  // Loader for the new API
  const loadBlockers = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ team_id: currentTeamId, status: tab });
      if (priority) params.set('priority', priority);
  const { data } = await api.get(`/blockers?${params.toString()}`);
  const list = (data.blockers || []);
  setItems(list);
  setBlockers(list); // keep header counts in sync with what's displayed
    } catch (e) {
      console.error('Failed to load blockers', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlockers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, priority, currentTeamId]);

  const fetchBlockers = async () => {
    try {
      // fetch ALL blockers for header counts (no status filter)
      const params = new URLSearchParams({ team_id: currentTeam.id });
      const { data } = await api.get(`/blockers?${params.toString()}`);
      setBlockers(data.blockers || []);
    } catch (error) {
      console.error('Error fetching blockers:', error);
      setBlockers([]);
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
      await api.post(`/blockers/${blockerId}/resolve`, { resolution });
      // Update both lists
      setItems(items.filter((x) => x.id !== blockerId));
      await fetchBlockers();
      await fetchBlockerAnalytics();
      setShowResolutionModal(false);
      setSelectedBlocker(null);
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

  const updateBlockerPriority = async (blockerId, newPriority) => {
    try {
      // Use new /api/blockers endpoint for priority updates with severity payload
      await api.put(`/blockers/${blockerId}/priority`, { severity: newPriority });
      setItems(items.map((x) => (x.id === blockerId ? { ...x, severity: newPriority } : x)));
      await fetchBlockers();
      await fetchBlockerAnalytics();
    } catch (error) {
      console.error('Error updating blocker priority:', error);
    }
  };

  const analyzeWithAI = async (blocker) => {
    setAiAnalyzing(blocker.id);
    try {
      await api.post(`/blockers/${blocker.id}/analyze`, {
        context: blocker.context,
        keyword: blocker.keyword,
      });
      await loadBlockers();
      await fetchBlockers(); // Refresh analytics cards
    } catch (error) {
      console.error('Error analyzing blocker with AI:', error);
    } finally {
      setAiAnalyzing(null);
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
              AI-powered blocker detection and management
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
        {/* Tabs */}
        <div className="p-4">
          <div className="flex gap-2 mb-3">
            {['active','resolved'].map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-3 py-1 rounded ${tab === k ? 'bg-gray-900 text-white' : 'bg-gray-200'}`}
              >
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="p-4 text-sm text-gray-500">Loading blockers…</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No blockers found.</div>
          ) : (
            <ul className="divide-y border rounded">
              {items.map((b) => (
                <li key={b.id} className="p-3 flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wide border px-2 py-0.5 rounded">
                        {b.severity || 'medium'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(b.created_at?._seconds ? b.created_at._seconds * 1000 : Date.now()).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-medium mt-1">{b.keyword}</div>
                    {!!b.context && <div className="text-sm text-gray-600 mt-1">{b.context}</div>}
                    <div className="text-xs text-gray-500 mt-1">{b.user_email}</div>
                  </div>

                  {tab === 'active' && (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => resolveBlocker(b.id)}
                        className="px-3 py-1 rounded bg-green-600 text-white text-sm"
                      >
                        Resolve
                      </button>
                      <select
                        value={b.severity || 'medium'}
                        onChange={(e) => updateBlockerPriority(b.id, e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
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