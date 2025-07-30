/**
 * Real-time Service using WebSockets and Firebase Real-time Database
 * Handles live updates for standups, team activity, and notifications
 */

import { io } from 'socket.io-client';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { colors } from '../utils/colors';

class RealTimeService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.notificationCallbacks = new Set();
    this.activityCallbacks = new Set();
    this.standupCallbacks = new Set();
    this.isConnected = false;
    this.currentUser = null;
    this.currentTeam = null;
    this.currentCompany = null;
  }

  // Initialize real-time connection
  async initialize(user, team, company) {
    this.currentUser = user;
    this.currentTeam = team;
    this.currentCompany = company;

    // Initialize WebSocket connection
    this.initializeWebSocket();
    
    // Set up Firebase real-time listeners
    this.setupFirebaseListeners();
  }

  // WebSocket connection setup
  initializeWebSocket() {
    const serverUrl = process.env.REACT_APP_WEBSOCKET_URL || 
                     process.env.REACT_APP_API_BASE_URL?.replace('/api', '') || 
                     'http://localhost:5000';
    
    console.log('🔗 WebSocket connecting to:', serverUrl);
    
    this.socket = io(serverUrl, {
      auth: {
        userId: this.currentUser?.uid,
        teamId: this.currentTeam?.id,
        companyId: this.currentCompany?.id
      },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('🚀 Real-time connection established');
      this.isConnected = true;
      this.joinRooms();
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Real-time connection lost');
      this.isConnected = false;
    });

    // Listen for real-time events
    this.setupWebSocketListeners();
  }

  // Join relevant rooms for real-time updates
  joinRooms() {
    if (!this.socket || !this.currentCompany || !this.currentTeam) return;

    this.socket.emit('join-company', this.currentCompany.id);
    this.socket.emit('join-team', this.currentTeam.id);
    
    console.log(`📡 Joined real-time rooms: company-${this.currentCompany.id}, team-${this.currentTeam.id}`);
  }

  // Set up WebSocket event listeners
  setupWebSocketListeners() {
    // Live standup updates
    this.socket.on('standup-submitted', (data) => {
      this.notifyStandupCallbacks('new_standup', data);
      this.showRealTimeNotification('New Standup', `${data.userName} submitted their standup`, 'info');
    });

    this.socket.on('standup-updated', (data) => {
      this.notifyStandupCallbacks('updated_standup', data);
    });

    // Team member activity
    this.socket.on('user-online', (data) => {
      this.notifyActivityCallbacks('user_online', data);
      this.showRealTimeIndicator(`${data.userName} is online`, 'success');
    });

    this.socket.on('user-offline', (data) => {
      this.notifyActivityCallbacks('user_offline', data);
    });

    this.socket.on('user-typing', (data) => {
      this.notifyActivityCallbacks('user_typing', data);
    });

    // Blocker and mention notifications
    this.socket.on('blocker-detected', (data) => {
      this.notifyNotificationCallbacks('blocker', data);
      this.showRealTimeNotification(
        '🚫 Blocker Detected', 
        `${data.userName} reported: ${data.blocker}`, 
        'warning'
      );
    });

    this.socket.on('user-mentioned', (data) => {
      this.notifyNotificationCallbacks('mention', data);
      this.showRealTimeNotification(
        '📢 You were mentioned', 
        `${data.fromUser} mentioned you in ${data.context}`, 
        'info'
      );
    });

    // Sprint updates
    this.socket.on('sprint-updated', (data) => {
      this.notifyActivityCallbacks('sprint_updated', data);
      this.showRealTimeNotification('Sprint Update', data.message, 'info');
    });
  }

  // Firebase real-time listeners setup
  setupFirebaseListeners() {
    if (!this.currentTeam || !this.currentCompany) return;

    // Listen for standup changes
    this.setupStandupListener();
    
    // Listen for team activity
    this.setupActivityListener();
    
    // Listen for notifications
    this.setupNotificationListener();
  }

  // Real-time standup listener
  setupStandupListener() {
    const today = new Date().toISOString().split('T')[0];
    const standupQuery = query(
      collection(db, 'standups'),
      where('team_id', '==', this.currentTeam.id),
      where('company_id', '==', this.currentCompany.id),
      where('date', '==', today),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(standupQuery, (snapshot) => {
      const standups = [];
      snapshot.docChanges().forEach((change) => {
        const data = { id: change.doc.id, ...change.doc.data() };
        
        if (change.type === 'added') {
          standups.push({ type: 'added', data });
          
          // Emit to WebSocket for other clients
          if (this.socket && data.user_id !== this.currentUser?.uid) {
            this.socket.emit('standup-received', data);
          }
        } else if (change.type === 'modified') {
          standups.push({ type: 'modified', data });
        }
      });

      if (standups.length > 0) {
        this.notifyStandupCallbacks('firebase_update', standups);
      }
    });

    this.listeners.set('standups', unsubscribe);
  }

  // Real-time activity listener
  setupActivityListener() {
    const activityQuery = query(
      collection(db, 'team_activity'),
      where('team_id', '==', this.currentTeam.id),
      where('company_id', '==', this.currentCompany.id),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(activityQuery, (snapshot) => {
      const activities = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = { id: change.doc.id, ...change.doc.data() };
          activities.push(data);
        }
      });

      if (activities.length > 0) {
        this.notifyActivityCallbacks('new_activities', activities);
      }
    });

    this.listeners.set('activity', unsubscribe);
  }

  // Real-time notification listener
  setupNotificationListener() {
    const notificationQuery = query(
      collection(db, 'notifications'),
      where('recipient_id', '==', this.currentUser.uid),
      where('company_id', '==', this.currentCompany.id),
      where('read', '==', false),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(notificationQuery, (snapshot) => {
      const notifications = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = { id: change.doc.id, ...change.doc.data() };
          notifications.push(data);
        }
      });

      if (notifications.length > 0) {
        this.notifyNotificationCallbacks('new_notifications', notifications);
        
        // Show desktop notifications for important ones
        notifications.forEach(notification => {
          if (notification.type === 'blocker' || notification.type === 'mention') {
            this.showDesktopNotification(notification);
          }
        });
      }
    });

    this.listeners.set('notifications', unsubscribe);
  }

  // Emit user activity
  emitUserActivity(activity) {
    if (!this.socket || !this.isConnected) return;

    const activityData = {
      user_id: this.currentUser.uid,
      user_name: this.currentUser.displayName || this.currentUser.email,
      team_id: this.currentTeam.id,
      company_id: this.currentCompany.id,
      activity_type: activity.type,
      details: activity.details,
      timestamp: new Date().toISOString()
    };

    this.socket.emit('user-activity', activityData);
    
    // Also save to Firebase for persistence
    this.saveActivity(activityData);
  }

  // Save activity to Firebase
  async saveActivity(activityData) {
    try {
      await addDoc(collection(db, 'team_activity'), {
        ...activityData,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error saving activity:', error);
    }
  }

  // Send notification
  async sendNotification(notification) {
    try {
      const notificationData = {
        ...notification,
        company_id: this.currentCompany.id,
        timestamp: serverTimestamp(),
        read: false
      };

      await addDoc(collection(db, 'notifications'), notificationData);
      
      // Emit via WebSocket for immediate delivery
      if (this.socket) {
        this.socket.emit('send-notification', notificationData);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  // Show real-time notification toast
  showRealTimeNotification(title, message, type = 'info') {
    const notification = {
      id: Date.now(),
      title,
      message,
      type,
      timestamp: new Date()
    };

    this.notifyNotificationCallbacks('toast', notification);
  }

  // Show real-time indicator
  showRealTimeIndicator(message, type = 'info') {
    const indicator = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date()
    };

    this.notifyActivityCallbacks('indicator', indicator);
  }

  // Show desktop notification
  showDesktopNotification(notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title || 'Upstand', {
        body: notification.message,
        icon: '/favicon.ico',
        tag: notification.id
      });
    }
  }

  // Request notification permission
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  // Callback registration methods
  onStandupUpdate(callback) {
    this.standupCallbacks.add(callback);
    return () => this.standupCallbacks.delete(callback);
  }

  onActivityUpdate(callback) {
    this.activityCallbacks.add(callback);
    return () => this.activityCallbacks.delete(callback);
  }

  onNotification(callback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  // Notify callbacks
  notifyStandupCallbacks(event, data) {
    this.standupCallbacks.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in standup callback:', error);
      }
    });
  }

  notifyActivityCallbacks(event, data) {
    this.activityCallbacks.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in activity callback:', error);
      }
    });
  }

  notifyNotificationCallbacks(event, data) {
    this.notificationCallbacks.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in notification callback:', error);
      }
    });
  }

  // Cleanup
  disconnect() {
    // Close WebSocket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    // Unsubscribe from Firebase listeners
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();

    // Clear callbacks
    this.standupCallbacks.clear();
    this.activityCallbacks.clear();
    this.notificationCallbacks.clear();

    this.isConnected = false;
    console.log('🔌 Real-time service disconnected');
  }

  // Update context when user changes team/company
  updateContext(user, team, company) {
    if (this.currentCompany?.id !== company?.id || this.currentTeam?.id !== team?.id) {
      this.disconnect();
      this.initialize(user, team, company);
    }
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      hasWebSocket: !!this.socket,
      activeListeners: this.listeners.size
    };
  }
}

// Create singleton instance
const realTimeService = new RealTimeService();

export default realTimeService;