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
  CheckCircleIcon
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
      data: dashboardData?.active_sprint ? [
        dashboardData.active_sprint.completed_tasks || 0,
        Math.max(0, (dashboardData.active_sprint.total_tasks || 0) - (dashboardData.active_sprint.completed_tasks || 0))
      ] : [0, 1], // Show 100% remaining when no data
      backgroundColor: ['#10b981', '#e5e7eb'],
      borderWidth: 0
    }]
  };

  // Burndown chart data (mock data for demo)
  const burndownData = {
    labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Today'],
    datasets: [{
      label: 'Ideal',
      data: [100, 80, 60, 40, 20, 0],
      borderColor: '#6b7280',
      borderDash: [5, 5],
      tension: 0.1,
      fill: false
    }, {
      label: 'Actual',
      data: [100, 85, 75, 65, 45, 35],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.3,
      fill: true
    }]
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-4 text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error && !dashboardData) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
        <button 
          onClick={fetchDashboardData}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back, {currentUser?.email || 'User'}</p>
        <p className="text-sm text-gray-500 mt-2">Team: {currentTeam?.name || 'No team selected'}</p>
      </div>

      {/* Show error banner if there was an error but we have fallback data */}
      {error && dashboardData && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded">
          <div className="flex justify-between items-center">
            <span>{error} - Showing cached data.</span>
            <button 
              onClick={fetchDashboardData}
              className="text-yellow-800 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Standups */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today's Standups</p>
              <p className="text-2xl font-semibold text-gray-900">{dashboardData?.standup_count || 0}</p>
            </div>
            <UserGroupIcon className="w-8 h-8 text-blue-500" />
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
            <p className="text-gray-500">No active sprint. Create one to track progress.</p>
          )}
        </div>
      </div>

      {/* Burndown Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sprint Burndown</h2>
        {dashboardData?.active_sprint ? (
          <div className="h-64">
            <Line 
              data={burndownData}
              options={{
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Story Points'
                    }
                  }
                },
                plugins: {
                  legend: {
                    position: 'top'
                  }
                }
              }}
            />
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No active sprint data available</p>
        )}
      </div>

      {/* Active Blockers List */}
      {dashboardData?.active_blockers && dashboardData.active_blockers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Blockers</h2>
          <div className="space-y-3">
            {dashboardData.active_blockers.map((blocker, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">{blocker}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;