/**
 * Dashboard Component - Main overview page
 * Shows standup summary, sprint progress, blockers, and team sentiment
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { 
  CalendarIcon, 
  UserGroupIcon, 
  ExclamationTriangleIcon,
  ChartBarIcon,
  FaceSmileIcon,
  FaceFrownIcon,
  CheckCircleIcon,
  UserIcon
} from '@heroicons/react/24/outline';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function Dashboard() {
  const { currentUser } = useAuth();
  const { currentTeam } = useTeam();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    console.log('Dashboard useEffect triggered', { currentTeam });
    
    if (currentTeam?.id) {
      fetchDashboardData();
      // Refresh data every 5 minutes
      const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      // If no team is selected, set loading to false and show appropriate message
      setLoading(false);
      setError('No team selected. Please select a team to view dashboard.');
    }
  }, [currentTeam?.id]); // More specific dependency

  // Add effect to refresh when navigating back to dashboard
  useEffect(() => {
    const handleFocus = () => {
      if (currentTeam?.id) {
        fetchDashboardData();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentTeam?.id]);

  // Refresh data when component becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentTeam?.id) {
        fetchDashboardData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentTeam?.id]);

  const fetchDashboardData = async () => {
    try {
      console.log('Fetching dashboard data for team:', currentTeam?.id);
      setLoading(true);
      setError(''); // Clear any previous errors
      
      const response = await api.get(`/dashboard?team_id=${currentTeam.id}`);
      console.log('Dashboard data received:', response.data);
      
      setDashboardData(response.data.dashboard);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard data');
      // Set some default data to prevent UI issues
      setDashboardData({
        standup_count: 0,
        active_sprint: null,
        active_blockers: [],
        sentiment_label: 'neutral',
        team_summary: null
      });
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive':
        return <FaceSmileIcon className="w-8 h-8 text-green-500" />;
      case 'negative':
        return <FaceFrownIcon className="w-8 h-8 text-red-500" />;
      default:
        return <FaceSmileIcon className="w-8 h-8 text-yellow-500" />;
    }
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment) {
      case 'positive':
        return 'text-green-600 bg-green-100';
      case 'negative':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  // Sprint progress chart data
  const sprintProgressData = {
    labels: ['Completed', 'Remaining'],
    datasets: [{
      data: dashboardData?.active_sprint ? 
        [
          dashboardData.active_sprint.completed_tasks || 0,
          (dashboardData.active_sprint.total_tasks || 0) - (dashboardData.active_sprint.completed_tasks || 0)
        ] : [0, 1],
      backgroundColor: ['#10B981', '#E5E7EB'],
      borderWidth: 0
    }]
  };

  // If no team is selected
  if (!currentTeam) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <UserGroupIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Upstand</h1>
          <p className="text-gray-600 mb-6">Select a team from the sidebar to view your dashboard</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="text-center py-12">
          <ExclamationTriangleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Dashboard Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Overview for {currentTeam?.name} • {new Date().toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="flex items-center px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
            >
              <ChartBarIcon className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {/* Today's Standups */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Standups</p>
              <p className="text-2xl font-semibold text-gray-900">
                {dashboardData?.standup_count || 0}
              </p>
            </div>
            <UserIcon className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        {/* Active Sprint */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Sprint</p>
              <p className="text-lg font-semibold text-gray-900">
                {dashboardData?.active_sprint?.name || 'No active sprint'}
              </p>
            </div>
            <CalendarIcon className="w-8 h-8 text-green-500" />
          </div>
        </div>

        {/* Active Blockers */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Blockers</p>
              <p className="text-2xl font-semibold text-red-600">
                {dashboardData?.active_blockers?.length || 0}
              </p>
            </div>
            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
          </div>
        </div>

        {/* Team Sentiment */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Team Sentiment</p>
              <p className={`text-lg font-semibold ${getSentimentColor(dashboardData?.sentiment_label)} px-3 py-1 rounded-full inline-block`}>
                {dashboardData?.sentiment_label || 'Neutral'}
              </p>
            </div>
            {getSentimentIcon(dashboardData?.sentiment_label)}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Today's Team Summary</h2>
          {dashboardData?.team_summary ? (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 whitespace-pre-wrap">{dashboardData.team_summary}</p>
            </div>
          ) : (
            <p className="text-gray-500">No standups submitted yet today.</p>
          )}
        </div>

        {/* Sprint Progress */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sprint Progress</h2>
          {dashboardData?.active_sprint ? (
            <div className="space-y-4">
              <div className="h-48">
                <Doughnut 
                  data={sprintProgressData}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }}
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">
                  {dashboardData.active_sprint.completed_tasks || 0} of {dashboardData.active_sprint.total_tasks || 0} tasks completed
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No active sprint.</p>
          )}
        </div>

        {/* Recent Blockers */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Blockers</h2>
          {dashboardData?.active_blockers && dashboardData.active_blockers.length > 0 ? (
            <div className="space-y-3">
              {dashboardData.active_blockers.slice(0, 3).map((blocker, index) => (
                <div key={index} className="border-l-4 border-red-400 pl-4 py-2">
                  <p className="text-sm font-medium text-gray-900">{blocker.author}</p>
                  <p className="text-sm text-gray-600">{blocker.text}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(blocker.timestamp).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {dashboardData.active_blockers.length > 3 && (
                <p className="text-sm text-gray-500 text-center">
                  +{dashboardData.active_blockers.length - 3} more blockers
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircleIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500">No active blockers! 🎉</p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <a
              href="/standup"
              className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
            >
              <UserIcon className="w-5 h-5 text-blue-600 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Submit Standup</p>
                <p className="text-sm text-gray-600">Share your daily progress</p>
              </div>
            </a>
            
            <a
              href="/sprints"
              className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors"
            >
              <CalendarIcon className="w-5 h-5 text-green-600 mr-3" />
              <div>
                <p className="font-medium text-gray-900">Manage Sprints</p>
                <p className="text-sm text-gray-600">Create and track sprint progress</p>
              </div>
            </a>
            
            <a
              href="/analytics"
              className="flex items-center p-3 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
            >
              <ChartBarIcon className="w-5 h-5 text-purple-600 mr-3" />
              <div>
                <p className="font-medium text-gray-900">View Analytics</p>
                <p className="text-sm text-gray-600">Team performance insights</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;