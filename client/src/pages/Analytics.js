import React, { useState, useEffect } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { 
  ChartBarIcon, 
  RocketLaunchIcon, 
  ExclamationTriangleIcon,
  UserGroupIcon 
} from '@heroicons/react/24/outline';

function Analytics() {
  const { currentTeam } = useTeam();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentTeam) {
      fetchAnalytics();
    }
  }, [currentTeam]);

  const fetchAnalytics = async () => {
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
  };

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
        {/* User Activity Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <UserGroupIcon className="w-8 h-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Actions</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.user_activity?.total_actions || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Sprint Count Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <RocketLaunchIcon className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Completed Sprints</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.sprint_velocity?.length || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Blocker Rate Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="w-8 h-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Blockers Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.blocker_stats?.total_standups > 0 
                  ? Math.round((analytics.blocker_stats.with_blockers / analytics.blocker_stats.total_standups) * 100)
                  : 0}%
              </p>
            </div>
          </div>
        </div>

        {/* Average Velocity Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <ChartBarIcon className="w-8 h-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg Velocity</p>
              <p className="text-2xl font-bold text-gray-900">
                {analytics?.sprint_velocity?.length > 0 
                  ? Math.round(analytics.sprint_velocity.reduce((sum, sprint) => sum + sprint.velocity, 0) / analytics.sprint_velocity.length)
                  : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sprint Velocity Chart */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
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

      {/* User Activity Breakdown */}
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
  );
}

export default Analytics;