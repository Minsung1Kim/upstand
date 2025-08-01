import { useEffect, useState, useCallback } from 'react';
import webSocketService from '../services/websocket';

export const useWebSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastStandupUpdate, setLastStandupUpdate] = useState(null);
  const [lastActivity, setLastActivity] = useState(null);
  const [lastNotification, setLastNotification] = useState(null);

  useEffect(() => {
    // Set up event listeners for real-time updates
    const handleStandupUpdate = (event) => {
      console.log('🔄 Standup update received in hook:', event.detail);
      setLastStandupUpdate(event.detail);
    };

    const handleTeamActivity = (event) => {
      console.log('👥 Team activity received in hook:', event.detail);
      setLastActivity(event.detail);
    };

    const handleNotification = (event) => {
      console.log('🔔 Notification received in hook:', event.detail);
      setLastNotification(event.detail);
    };

    // Add event listeners
    window.addEventListener('standupUpdate', handleStandupUpdate);
    window.addEventListener('teamActivity', handleTeamActivity);
    window.addEventListener('notification', handleNotification);

    // Check connection status periodically
    const checkConnection = () => {
      setIsConnected(webSocketService.isSocketConnected());
    };

    const connectionInterval = setInterval(checkConnection, 2000);
    checkConnection(); // Initial check

    return () => {
      // Cleanup event listeners
      window.removeEventListener('standupUpdate', handleStandupUpdate);
      window.removeEventListener('teamActivity', handleTeamActivity);
      window.removeEventListener('notification', handleNotification);
      clearInterval(connectionInterval);
    };
  }, []);

  const joinTeam = useCallback((teamId, companyId) => {
    webSocketService.joinTeam(teamId, companyId);
  }, []);

  const leaveTeam = useCallback((teamId, companyId) => {
    webSocketService.leaveTeam(teamId, companyId);
  }, []);

  const getConnectionStatus = useCallback(() => {
    return webSocketService.getConnectionStatus();
  }, []);

  return {
    isConnected,
    lastStandupUpdate,
    lastActivity,
    lastNotification,
    joinTeam,
    leaveTeam,
    getConnectionStatus
  };
};

export default useWebSocket;