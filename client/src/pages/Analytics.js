import React, { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { 
  ChartBarIcon, 
  RocketLaunchIcon, 
  ExclamationTriangleIcon,
  UserGroupIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

function Analytics() {
  const { currentTeam } = useTeam();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/analytics/dashboard?team_id=${currentTeam.id}`);
      if (response.data.success) {
        setAnalytics(response.data.analytics);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [currentTeam]);

  useEffect(() => {
    if (currentTeam) {
      fetchAnalytics();
    }
  }, [currentTeam, fetchAnalytics]);

  if (!currentTeam) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Please select a team to view analytics</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <ChartBarIcon className="w-8 h-8 mr-3 text-blue-600" />
          Team Analytics
        </h1>
        <p className="text-gray-600 mt-2">
          Performance insights for {currentTeam.name} 
          ({analytics?.date_range?.start} to {analytics?.date_range?.end})
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Team Participation Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <UserGroupIcon className="w-8 h-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Team Participation</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.team_participation?.participation_rate || 0}%
              </p>
              <p className="text-xs text-gray-500">
                {analytics?.team_participation?.active_members || 0} of {analytics?.team_participation?.total_members || 0} members
              </p>
            </div>
          </div>
        </div>

        {/* Standup Consistency Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <ClockIcon className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Standup Consistency</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.team_participation?.standup_consistency || 0}%
              </p>
              <p className="text-xs text-gray-500">Daily standup participation</p>
            </div>
          </div>
        </div>

        {/* Lead Time Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <RocketLaunchIcon className="w-8 h-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Lead Time</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.performance_metrics?.avg_lead_time_days || 0} days
              </p>
              <p className="text-xs text-gray-500">Task creation to completion</p>
            </div>
          </div>
        </div>

        {/* Blocker Resolution Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Blocker Resolution</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.performance_metrics?.avg_blocker_resolution_days || 0} days
              </p>
              <p className="text-xs text-gray-500">Avg time to resolve blockers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Sprint Velocity Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Sprint Velocity Trend</h2>
          {analytics?.sprint_velocity?.length > 0 ? (
            <div className="space-y-4">
              {analytics.sprint_velocity.slice(0, 5).map((sprint, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-32 truncate">
                    <p className="text-sm font-medium text-gray-900">{sprint.name}</p>
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="bg-gray-200 rounded-full h-4">
                      <div 
                        className="bg-blue-600 h-4 rounded-full"
                        style={{ width: `${Math.min(sprint.velocity * 2, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-16 text-right">
                    <p className="text-sm font-bold text-gray-900">{sprint.velocity}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No completed sprints yet</p>
          )}
        </div>

        {/* Sentiment Trend Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Team Sentiment Trend (Last 7 Days)</h2>
          {analytics?.sentiment_trend?.length > 0 ? (
            <div className="space-y-3">
              {analytics.sentiment_trend.map((day, index) => (
                <div key={index} className="flex items-center">
                  <div className="w-20 text-sm text-gray-600">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="flex bg-gray-200 rounded-full h-6">
                      <div 
                        className="bg-green-500 h-6 rounded-l-full flex items-center justify-center"
                        style={{ width: `${day.positive_pct}%` }}
                      >
                        {day.positive_pct > 10 && <span className="text-xs text-white font-medium">{day.positive_pct}%</span>}
                      </div>
                      <div 
                        className="bg-yellow-400 h-6 flex items-center justify-center"
                        style={{ width: `${day.neutral_pct}%` }}
                      >
                        {day.neutral_pct > 15 && <span className="text-xs text-gray-700 font-medium">{day.neutral_pct}%</span>}
                      </div>
                      <div 
                        className="bg-red-500 h-6 rounded-r-full flex items-center justify-center"
                        style={{ width: `${day.negative_pct}%` }}
                      >
                        {day.negative_pct > 10 && <span className="text-xs text-white font-medium">{day.negative_pct}%</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-center space-x-6 mt-4 text-sm">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded mr-2"></div>
                  <span>Positive</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-yellow-400 rounded mr-2"></div>
                  <span>Neutral</span>
                </div>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded mr-2"></div>
                  <span>Negative</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No sentiment data available</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Performance Metrics Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Tasks Completed</span>
              <span className="text-lg font-bold text-blue-600">
                {analytics?.performance_metrics?.tasks_completed || 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Blockers Resolved</span>
              <span className="text-lg font-bold text-green-600">
                {analytics?.performance_metrics?.blockers_resolved || 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Total Standups</span>
              <span className="text-lg font-bold text-purple-600">
                {analytics?.blocker_stats?.total_standups || 0}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">High Priority Blockers</span>
              <span className="text-lg font-bold text-red-600">
                {analytics?.blocker_stats?.high_severity || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Team Activity Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Team Activity Breakdown</h2>
          {analytics?.user_activity?.by_type && Object.keys(analytics.user_activity.by_type).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(analytics.user_activity.by_type)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 8)
                .map(([action, count]) => (
                <div key={action} className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 capitalize">{action.replace('_', ' ')}</p>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm font-medium">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No activity data available</p>
          )}
        </div>
      </div>

      {/* Key Insights Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Key Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Team Engagement</h3>
            <p className="text-sm text-gray-600">
              {analytics?.team_participation?.participation_rate > 80 
                ? "🟢 Excellent team participation! Most members are actively contributing."
                : analytics?.team_participation?.participation_rate > 60
                ? "🟡 Good participation, but some team members could be more active."
                : "🔴 Low participation detected. Consider checking in with inactive team members."
              }
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Process Efficiency</h3>
            <p className="text-sm text-gray-600">
              {analytics?.performance_metrics?.avg_lead_time_days < 3
                ? "🟢 Fast delivery! Tasks are completed quickly."
                : analytics?.performance_metrics?.avg_lead_time_days < 7
                ? "🟡 Moderate lead times. Room for optimization."
                : "🔴 Long lead times detected. Consider breaking down tasks or removing blockers."
              }
            </p>
          </div>
          
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Blocker Management</h3>
            <p className="text-sm text-gray-600">
              {analytics?.performance_metrics?.avg_blocker_resolution_days < 2
                ? "🟢 Excellent blocker resolution! Issues are handled quickly."
                : analytics?.performance_metrics?.avg_blocker_resolution_days < 5
                ? "🟡 Good blocker resolution times with room for improvement."
                : "🔴 Blockers taking too long to resolve. Consider improving escalation process."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;