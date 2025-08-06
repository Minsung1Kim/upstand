/**
 * Dashboard Component - Main overview page
 * Shows standup summary, sprint progress, blockers, and team sentiment
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTeam } from '../context/TeamContext';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { PageLoader } from '../components/ui/LoadingSpinner';
import Card from '../components/ui/Card';

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
  FaceSmileIcon,
  FaceFrownIcon,
  UserIcon  // Added UserIcon import here
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
  // const { currentUser } = useAuth(); // Removed unused variable
  const { currentTeam } = useTeam();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchDashboardData = useCallback(async () => {
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
  }, [currentTeam?.id]);

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
  }, [currentTeam, fetchDashboardData]); // More specific dependency

  // Add effect to refresh when navigating back to dashboard
  useEffect(() => {
    const handleFocus = () => {
      if (currentTeam?.id) {
        fetchDashboardData();
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentTeam?.id, fetchDashboardData]);

  // Refresh data when component becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentTeam?.id) {
        fetchDashboardData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentTeam?.id, fetchDashboardData]);

  const getSentimentIcon = (sentiment) => {
    switch (sentiment) {
      case 'positive':
        return <FaceSmileIcon className="w-6 h-6 text-white" />;
      case 'negative':
        return <FaceFrownIcon className="w-6 h-6 text-white" />;
      default:
        return <FaceSmileIcon className="w-6 h-6 text-white" />;
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

  // Burndown chart data
  const burndownData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        label: 'Ideal Burndown',
        data: [100, 75, 50, 25, 0],
        borderColor: '#9CA3AF',
        backgroundColor: 'transparent',
        borderDash: [5, 5]
      },
      {
        label: 'Actual Burndown',
        data: [100, 80, 45, 30, 10],
        borderColor: '#3B82F6',
        backgroundColor: 'transparent'
      }
    ]
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
    return <PageLoader message="Loading your dashboard..." />;
  }

  if (error && !dashboardData) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ExclamationTriangleIcon className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Dashboard Error</h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">{error}</p>
          <button 
            onClick={() => fetchDashboardData()} 
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-3 rounded-xl hover:from-blue-600 hover:to-purple-700 transform transition-all duration-200 hover:scale-105 shadow-lg font-semibold"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Team Dashboard</h1>
          <p className="text-lg text-gray-600">Track your team's progress and performance</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">{/* Today's Standups */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Today's Standups</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {dashboardData?.standup_count || 0}
                </p>
                <p className="text-sm text-green-600 mt-1">+12% from yesterday</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <UserGroupIcon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Active Sprint */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Active Sprint</p>
                <p className="text-lg font-bold text-gray-900 mt-2 truncate">
                  {dashboardData?.active_sprint?.name || 'No active sprint'}
                </p>
                <p className="text-sm text-blue-600 mt-1">5 days remaining</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Active Blockers */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Active Blockers</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  {dashboardData?.active_blockers?.length || 0}
                </p>
                <p className="text-sm text-red-500 mt-1">Needs attention</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-xl flex items-center justify-center">
                <ExclamationTriangleIcon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Team Sentiment */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-white/20 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Team Sentiment</p>
                <p className={`text-lg font-bold mt-2 px-3 py-1 rounded-full inline-block ${getSentimentColor(dashboardData?.sentiment_label)}`}>
                  {dashboardData?.sentiment_label || 'Neutral'}
                </p>
                <p className="text-sm text-gray-500 mt-1">Based on standups</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center">
                {getSentimentIcon(dashboardData?.sentiment_label)}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Today's Summary */}
          <Card glassmorphism>
            <h2 class="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              Today's Team Summary
            </h2>
            {dashboardData?.team_summary ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200/50">{dashboardData.team_summary}</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-500">No standups submitted yet today.</p>
              </div>
            )}
          </Card>

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
      {dashboardData?.blocker_analysis?.active_blockers && dashboardData.blocker_analysis.active_blockers.length > 0 && (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-900">Active Blockers</h2>
      <button
        onClick={() => navigate('/blockers')}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        View All →
      </button>
    </div>
    <div className="space-y-3">
      {dashboardData.blocker_analysis.active_blockers.map((blocker, index) => (
        <div 
          key={index} 
          className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
          onClick={() => navigate('/blockers')}
        >
          <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{blocker.keyword || 'Blocker'}</p>
            <p className="text-xs text-gray-600">{blocker.user} • {blocker.severity} priority</p>
            <p className="text-xs text-gray-700 mt-1">{blocker.context}</p>
          </div>
        </div>
      ))}
    </div>
    {dashboardData.blocker_analysis.total_blockers > 5 && (
      <p className="text-xs text-gray-500 mt-2 text-center">
        +{dashboardData.blocker_analysis.total_blockers - 5} more blockers
      </p>
    )}
  </div>
)}

      {/* Recent Standups */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Team Standups</h2>
        {dashboardData?.recent_standups && dashboardData.recent_standups.length > 0 ? (
          <div className="space-y-3">
            {dashboardData.recent_standups.slice(0, 5).map((standup, index) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                <UserIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">{standup.user_email}</p>
                    <span className="text-xs text-gray-500">{standup.date}</span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">{standup.today}</p>
                  {standup.blockers && (
                    <p className="text-xs text-red-600 mt-1">🚫 Has blockers</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No recent standups submitted.</p>
        )}
      </div>

      {/* Recent Retrospectives */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Retrospectives</h2>
        {dashboardData?.recent_retros && dashboardData.recent_retros.length > 0 ? (
          <div className="space-y-3">
            {dashboardData.recent_retros.slice(0, 3).map((retro, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900">{retro.sprint_name || 'General Retro'}</p>
                  <span className="text-xs text-gray-500">{retro.created_at}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {retro.what_went_well?.length || 0} positives, {retro.what_could_improve?.length || 0} improvements
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No recent retrospectives.</p>
        )}
      </div>
        </div>
    </div>
  );
}

export default Dashboard;