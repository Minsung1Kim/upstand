import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { auth } from '../firebase';
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
  
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('active'); // 'active' | 'resolved'
  const [priority, setPriority] = useState(''); // '' | 'low' | 'medium' | 'high'
  const [items, setItems] = useState([]);            // the table you render
  const [stats, setStats] = useState({               // header chips
    all: 0, active: 0, resolved: 0, high: 0, medium: 0, low: 0
  });
  const [selectedBlocker, setSelectedBlocker] = useState(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // Default to connected
  const [aiAnalyzing, setAiAnalyzing] = useState(null); // Track which blocker is being analyzed

  // Stats-only KPIs for the cards
  const activeCount = (stats?.active_total ?? stats?.active ?? 0);
  const highCount = (stats?.high_total ?? stats?.by_priority?.high ?? 0);
  const resolvedThisMonth = (stats?.resolved_month ?? 0);
  const blockerRate = (stats?.blocker_rate ?? 0);

  useEffect(() => {
    if (currentTeam?.id && currentCompany?.id) {
      loadStats();
      fetchBlockerAnalytics();
    }
  }, [currentTeam?.id, currentCompany?.id]);

  // Loader for stats (chips)
  const loadStats = async () => {
    if (!currentTeam?.id) return;
    try {
      const { data } = await api.get(`/blockers/stats`, { params: { team_id: currentTeam.id } });
      setStats(data.stats || { all:0, active:0, resolved:0, high:0, medium:0, low:0 });
    } catch (e) {
      console.error('stats failed', e);
      setStats({ all:0, active:0, resolved:0, high:0, medium:0, low:0 });
    }
  };

  // Loader for the list (table)
  const loadList = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ team_id: currentTeamId, status: tab });
      if (priority) params.set('priority', priority);
      const { data } = await api.get(`/blockers?${params.toString()}`);
      setItems(data.blockers || []);
    } catch (e) {
      console.error('list failed', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, priority, currentTeamId]);


  const fetchBlockerAnalytics = async () => {
    try {
  const token = await auth?.currentUser?.getIdToken();
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
      // Optimistically update table and stats
      setItems((prev) => prev.filter((x) => x.id !== blockerId));
      setStats((s) => ({ ...s, active: Math.max(0, s.active - 1), resolved: s.resolved + 1 }));
      await fetchBlockerAnalytics();
      setShowResolutionModal(false);
      setSelectedBlocker(null);
    } catch (error) {
      console.error('Error resolving blocker:', error);
    }
  };

  const escalateBlocker = async (blockerId) => {
    try {
  const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/blockers/${blockerId}/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Company-ID': currentCompany.id
        }
      });
      
      if (response.ok) {
        await Promise.all([loadStats(), loadList()]);
        await fetchBlockerAnalytics();
      }
    } catch (error) {
      console.error('Error escalating blocker:', error);
    }
  };

  const updateBlockerPriority = async (blockerId, newPriority) => {
    try {
      await api.put(`/blockers/${blockerId}/priority`, { severity: newPriority });
      setItems((prev) => prev.map((x) => (x.id === blockerId ? { ...x, severity: newPriority } : x)));
      if (tab === 'active') loadStats();
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
  await loadList();
  await loadStats(); // Refresh stats for chips
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

  // Legacy filter UI no longer used for counts; items are fetched server-side.
  const filteredBlockers = items;

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
                <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <FireIcon className="w-8 h-8 text-orange-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">High Severity</p>
                <p className="text-2xl font-bold text-gray-900">{highCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <ArrowTrendingUpIcon className="w-8 h-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Blocker Rate</p>
                <p className="text-2xl font-bold text-gray-900">{Math.round(blockerRate)}%</p>
                <p className="text-xs text-gray-500">of standups</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <CheckCircleIcon className="w-8 h-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Resolved</p>
                <p className="text-2xl font-bold text-gray-900">{resolvedThisMonth}</p>
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
            <button
              onClick={() => { setTab('active'); setPriority(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'active' && !priority ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={tab === 'active' && !priority ? { backgroundColor: '#343148' } : {}}
            >
              All Blockers ({stats.all})
            </button>
            <button
              onClick={() => { setTab('active'); setPriority(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'active' && !priority ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={tab === 'active' && !priority ? { backgroundColor: '#343148' } : {}}
            >
              Active ({stats.active})
            </button>
            <button
              onClick={() => { setTab('active'); setPriority('high'); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'active' && priority === 'high' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={tab === 'active' && priority === 'high' ? { backgroundColor: '#343148' } : {}}
            >
              High Priority ({stats.high})
            </button>
            <button
              onClick={() => { setTab('active'); setPriority('medium'); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'active' && priority === 'medium' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={tab === 'active' && priority === 'medium' ? { backgroundColor: '#343148' } : {}}
            >
              Medium Priority ({stats.medium})
            </button>
            <button
              onClick={() => { setTab('resolved'); setPriority(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === 'resolved' ? 'text-white' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
              }`}
              style={tab === 'resolved' ? { backgroundColor: '#343148' } : {}}
            >
              Resolved ({stats.resolved})
            </button>
          </div>
        </div>
      </div>

      {/* Blockers List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {priority === 'all' ? 'All Blockers' : 
             priority === 'active' ? 'Active Blockers' :
             priority === 'resolved' ? 'Resolved Blockers' :
             `${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority Blockers`}
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
                value={priority || 'All'}
                onChange={(e) => setPriority(e.target.value === 'All' ? '' : e.target.value)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="All">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* List header */}
          <h3 className="text-lg font-semibold mb-3">
            {tab === 'resolved' ? 'Resolved' : 'Active'} Blockers
          </h3>

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="py-12 text-center text-gray-500">No blockers found.</div>
          )}

          {/* Loading */}
          {loading && (
            <div className="py-12 text-center text-gray-500">Loading…</div>
          )}

          {/* List */}
          {!loading && items.length > 0 && (
            <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
              {items.map((b) => (
                <li key={b.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                          b.severity === 'high'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : b.severity === 'medium'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        {b.severity || 'medium'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-900 break-words">
                      {b.text || b.description || b.keyword || '(no details)'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {b.user_email || b.user || ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {tab === 'active' && (
                      <button
                        onClick={() => resolveBlocker(b.id)}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                      >
                        Resolve
                      </button>
                    )}

                    <select
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={b.severity || 'medium'}
                      onChange={(e) => updateBlockerPriority(b.id, e.target.value)}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
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