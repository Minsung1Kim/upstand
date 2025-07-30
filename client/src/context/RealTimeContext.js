/**
 * Real-Time Context
 * Manages real-time updates, notifications, and live activity feeds
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useTeam } from './TeamContext';
import { useCompany } from './CompanyContext';
import realTimeService from '../services/realtime';

const RealTimeContext = createContext();

export const useRealTime = () => {
  const context = useContext(RealTimeContext);
  if (!context) {
    throw new Error('useRealTime must be used within a RealTimeProvider');
  }
  return context;
};

export const RealTimeProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const { currentTeam } = useTeam();
  const { currentCompany } = useCompany();

  // State for real-time data
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [standupUpdates, setStandupUpdates] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // Initialize real-time service when dependencies are ready
  useEffect(() => {
    if (currentUser && currentTeam && currentCompany) {
      console.log('🚀 Initializing real-time service...');
      realTimeService.initialize(currentUser, currentTeam, currentCompany);
      setIsConnected(true);

      // Request notification permission
      realTimeService.requestNotificationPermission();
    }

    return () => {
      if (realTimeService) {
        realTimeService.disconnect();
        setIsConnected(false);
      }
    };
  }, [currentUser, currentTeam, currentCompany]);

  // Update service context when team/company changes
  useEffect(() => {
    if (currentUser && currentTeam && currentCompany && isConnected) {
      realTimeService.updateContext(currentUser, currentTeam, currentCompany);
    }
  }, [currentUser, currentTeam, currentCompany, isConnected]);

  // Set up real-time event listeners
  useEffect(() => {
    if (!isConnected) return;

    // Standup updates
    const unsubscribeStandup = realTimeService.onStandupUpdate((event, data) => {
      switch (event) {
        case 'new_standup':
          setStandupUpdates(prev => [data, ...prev.slice(0, 9)]); // Keep last 10
          break;
        case 'updated_standup':
          setStandupUpdates(prev => 
            prev.map(standup => standup.id === data.id ? data : standup)
          );
          break;
        case 'firebase_update':
          // Handle Firebase real-time updates
          data.forEach(change => {
            if (change.type === 'added') {
              setStandupUpdates(prev => {
                const exists = prev.find(s => s.id === change.data.id);
                if (!exists) {
                  return [change.data, ...prev.slice(0, 9)];
                }
                return prev;
              });
            }
          });
          break;
      }
    });

    // Activity updates
    const unsubscribeActivity = realTimeService.onActivityUpdate((event, data) => {
      switch (event) {
        case 'user_online':
          setOnlineUsers(prev => {
            const exists = prev.find(u => u.userId === data.userId);
            if (!exists) {
              return [...prev, { ...data, lastSeen: new Date() }];
            }
            return prev.map(u => u.userId === data.userId ? { ...u, lastSeen: new Date() } : u);
          });
          break;
        case 'user_offline':
          setOnlineUsers(prev => prev.filter(u => u.userId !== data.userId));
          break;
        case 'user_typing':
          setTypingUsers(prev => {
            const filtered = prev.filter(u => u.userId !== data.userId);
            return [...filtered, { ...data, timestamp: new Date() }];
          });
          // Remove typing indicator after 3 seconds
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
          }, 3000);
          break;
        case 'new_activities':
          setRecentActivity(prev => {
            const newActivities = data.filter(activity => 
              !prev.find(existing => existing.id === activity.id)
            );
            return [...newActivities, ...prev].slice(0, 50);
          });
          break;
        case 'sprint_updated':
          setRecentActivity(prev => [data, ...prev.slice(0, 49)]);
          break;
        case 'indicator':
          // Handle real-time indicators (like "user is online")
          break;
      }
    });

    // Notification updates
    const unsubscribeNotifications = realTimeService.onNotification((event, data) => {
      switch (event) {
        case 'blocker':
        case 'mention':
          setNotifications(prev => [data, ...prev.slice(0, 19)]);
          break;
        case 'new_notifications':
          setNotifications(prev => {
            const newNotifs = data.filter(notif => 
              !prev.find(existing => existing.id === notif.id)
            );
            return [...newNotifs, ...prev].slice(0, 20);
          });
          break;
        case 'toast':
          setToastNotifications(prev => [data, ...prev.slice(0, 4)]);
          // Auto-remove toast after 5 seconds
          setTimeout(() => {
            setToastNotifications(prev => prev.filter(t => t.id !== data.id));
          }, 5000);
          break;
      }
    });

    return () => {
      unsubscribeStandup();
      unsubscribeActivity();
      unsubscribeNotifications();
    };
  }, [isConnected]);

  // Helper functions for emitting events
  const emitUserActivity = useCallback((activity) => {
    if (realTimeService && isConnected) {
      realTimeService.emitUserActivity(activity);
    }
  }, [isConnected]);

  const sendNotification = useCallback(async (notification) => {
    if (realTimeService && isConnected) {
      await realTimeService.sendNotification(notification);
    }
  }, [isConnected]);

  const markNotificationAsRead = useCallback(async (notificationId) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    // TODO: Update in Firebase
  }, []);

  const clearToastNotification = useCallback((toastId) => {
    setToastNotifications(prev => prev.filter(t => t.id !== toastId));
  }, []);

  // Real-time status
  const getConnectionStatus = useCallback(() => {
    return realTimeService ? realTimeService.getStatus() : {
      isConnected: false,
      hasWebSocket: false,
      activeListeners: 0
    };
  }, []);

  // Activity tracking helpers
  const trackActivity = useCallback((type, details) => {
    emitUserActivity({ type, details });
  }, [emitUserActivity]);

  const trackStandupActivity = useCallback((action, standupData) => {
    trackActivity('standup', { action, ...standupData });
  }, [trackActivity]);

  const trackSprintActivity = useCallback((action, sprintData) => {
    trackActivity('sprint', { action, ...sprintData });
  }, [trackActivity]);

  // Notification helpers
  const notifyBlocker = useCallback(async (blocker, standupId) => {
    await sendNotification({
      type: 'blocker',
      title: 'Blocker Detected',
      message: blocker,
      recipient_id: 'team', // Notify all team members
      metadata: { standupId }
    });
  }, [sendNotification]);

  const notifyMention = useCallback(async (mentionedUserId, context, message) => {
    await sendNotification({
      type: 'mention',
      title: 'You were mentioned',
      message: message,
      recipient_id: mentionedUserId,
      metadata: { context }
    });
  }, [sendNotification]);

  const value = {
    // Connection status
    isConnected,
    connectionStatus: getConnectionStatus(),

    // Real-time data
    onlineUsers,
    recentActivity,
    notifications,
    standupUpdates,
    toastNotifications,
    typingUsers,

    // Activity tracking
    trackActivity,
    trackStandupActivity,
    trackSprintActivity,
    emitUserActivity,

    // Notifications
    sendNotification,
    notifyBlocker,
    notifyMention,
    markNotificationAsRead,
    clearToastNotification,

    // Computed values
    unreadNotifications: notifications.filter(n => !n.read).length,
    hasRecentActivity: recentActivity.length > 0,
    teamOnlineCount: onlineUsers.length
  };

  return (
    <RealTimeContext.Provider value={value}>
      {children}
    </RealTimeContext.Provider>
  );
};

export default RealTimeContext;