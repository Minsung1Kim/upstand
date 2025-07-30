import React, { useState } from 'react';
import { colors } from '../../utils/colors';
import { useRealTime } from '../../context/RealTimeContext';

const ActivityFeed = ({ showHeader = true, maxItems = 10 }) => {
  const { recentActivity, onlineUsers, isConnected } = useRealTime();
  const [isExpanded, setIsExpanded] = useState(false);

  const getActivityIcon = (activityType) => {
    switch (activityType) {
      case 'standup':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
               style={{ backgroundColor: colors.accent.info + '20' }}>
            <svg className="w-4 h-4" style={{ color: colors.accent.info }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'sprint':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
               style={{ backgroundColor: colors.sprint.planning + '20' }}>
            <svg className="w-4 h-4" style={{ color: colors.sprint.planning }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'retrospective':
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
               style={{ backgroundColor: colors.sprint.retrospective + '20' }}>
            <svg className="w-4 h-4" style={{ color: colors.sprint.retrospective }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
               style={{ backgroundColor: colors.primary[200] + '40' }}>
            <svg className="w-4 h-4" style={{ color: colors.secondary[400] }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
        );
    }
  };

  const formatActivityMessage = (activity) => {
    const { activity_type, details, user_name } = activity;
    
    switch (activity_type) {
      case 'standup':
        if (details.action === 'submitted') {
          return `${user_name} submitted their standup`;
        } else if (details.action === 'updated') {
          return `${user_name} updated their standup`;
        }
        break;
      case 'sprint':
        if (details.action === 'created') {
          return `${user_name} created sprint "${details.name}"`;
        } else if (details.action === 'completed') {
          return `${user_name} completed sprint "${details.name}"`;
        }
        break;
      case 'retrospective':
        return `${user_name} added retrospective feedback`;
      default:
        return `${user_name} was active`;
    }
    return `${user_name} was active`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const displayedActivities = isExpanded ? recentActivity : recentActivity.slice(0, maxItems);

  return (
    <div className="bg-white rounded-lg shadow-sm border"
         style={{ borderColor: colors.neutral[200] }}>
      {showHeader && (
        <div className="p-4 border-b" style={{ borderColor: colors.neutral[200] }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
                   style={{ backgroundColor: isConnected ? colors.accent.success : colors.neutral[400] }}>
              </div>
              <h3 className="font-semibold" style={{ color: colors.secondary[500] }}>
                Live Activity
              </h3>
              <span className="text-xs px-2 py-1 rounded-full"
                    style={{ 
                      backgroundColor: colors.primary[100], 
                      color: colors.secondary[400] 
                    }}>
                {onlineUsers.length} online
              </span>
            </div>
            {recentActivity.length > maxItems && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs font-medium hover:opacity-75 transition-opacity"
                style={{ color: colors.secondary[500] }}
              >
                {isExpanded ? 'Show less' : `View all (${recentActivity.length})`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Online Users */}
        {onlineUsers.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-2 h-2 rounded-full animate-pulse"
                   style={{ backgroundColor: colors.accent.success }}>
              </div>
              <span className="text-xs font-medium" style={{ color: colors.neutral[600] }}>
                Currently Online
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {onlineUsers.map((user) => (
                <div key={user.userId}
                     className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs"
                     style={{ backgroundColor: colors.primary[50], color: colors.secondary[500] }}>
                  <div className="w-2 h-2 rounded-full"
                       style={{ backgroundColor: colors.accent.success }}>
                  </div>
                  <span>{user.userName}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity List */}
        <div className="space-y-3">
          {displayedActivities.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full mx-auto mb-3"
                   style={{ backgroundColor: colors.neutral[100] }}>
                <svg className="w-6 h-6 mx-auto mt-3" style={{ color: colors.neutral[400] }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: colors.neutral[500] }}>
                No recent activity
              </p>
              <p className="text-xs mt-1" style={{ color: colors.neutral[400] }}>
                Team activity will appear here in real-time
              </p>
            </div>
          ) : (
            displayedActivities.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 animate-fade-in">
                {getActivityIcon(activity.activity_type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: colors.neutral[700] }}>
                    {formatActivityMessage(activity)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: colors.neutral[400] }}>
                    {formatTimestamp(activity.timestamp)}
                  </p>
                  {activity.details && activity.details.blocker && (
                    <div className="mt-2 p-2 rounded text-xs"
                         style={{ 
                           backgroundColor: colors.accent.warning + '10',
                           color: colors.accent.warning 
                         }}>
                      🚫 Blocker: {activity.details.blocker}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityFeed;