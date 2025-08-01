import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 1000;
  }

  connect() {
    const wsUrl = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:5000';
    
    console.log('🔌 Attempting to connect to WebSocket:', wsUrl);
    
    try {
      this.socket = io(wsUrl, {
        transports: ['websocket', 'polling'], // Try both transports
        upgrade: true,
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5
      });

      this.setupEventHandlers();
      
    } catch (error) {
      console.error('❌ WebSocket connection error:', error);
    }
  }

  setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Server disconnected, manual reconnection needed
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.isConnected = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('❌ Max reconnection attempts reached');
      }
    });

    this.socket.on('connection_response', (data) => {
      console.log('🎉 Server connection response:', data);
    });

    this.socket.on('pong', (data) => {
      console.log('🏓 Pong received:', data);
    });

    // Real-time event handlers
    this.socket.on('standup_update', (data) => {
      console.log('📊 Standup update received:', data);
      // Emit custom event for components to listen
      window.dispatchEvent(new CustomEvent('standupUpdate', { detail: data }));
    });

    this.socket.on('team_activity', (data) => {
      console.log('👥 Team activity received:', data);
      window.dispatchEvent(new CustomEvent('teamActivity', { detail: data }));
    });

    this.socket.on('notification', (data) => {
      console.log('🔔 Notification received:', data);
      window.dispatchEvent(new CustomEvent('notification', { detail: data }));
    });
  }

  joinTeam(teamId, companyId = 'default') {
    if (this.socket && this.isConnected) {
      console.log(`🏠 Joining team: ${teamId} in company: ${companyId}`);
      this.socket.emit('join_team', { team_id: teamId, company_id: companyId });
    } else {
      console.warn('⚠️ Cannot join team - WebSocket not connected');
    }
  }

  leaveTeam(teamId, companyId = 'default') {
    if (this.socket && this.isConnected) {
      console.log(`🚪 Leaving team: ${teamId} in company: ${companyId}`);
      this.socket.emit('leave_team', { team_id: teamId, company_id: companyId });
    }
  }

  ping() {
    if (this.socket && this.isConnected) {
      console.log('🏓 Sending ping');
      this.socket.emit('ping');
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  // Check if connected
  isSocketConnected() {
    return this.socket && this.isConnected;
  }

  // Get connection status
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id || null
    };
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;