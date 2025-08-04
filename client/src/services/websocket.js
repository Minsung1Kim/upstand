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
        // Try polling first, then upgrade to websocket if possible
        transports: ['polling', 'websocket'],
        upgrade: true,
        timeout: 20000,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5,
        // Additional Railway-specific options
        withCredentials: false,
        autoConnect: true,
        // Ensure proper protocol handling
        secure: wsUrl.startsWith('https://'),
        // Handle CORS properly
        extraHeaders: {
          'Access-Control-Allow-Origin': '*'
        }
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
      console.log('🆔 Socket ID:', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Test the connection
      this.socket.emit('ping');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket disconnected:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Server disconnected, manual reconnection needed
        console.log('🔄 Server disconnected, attempting manual reconnection...');
        setTimeout(() => {
          this.socket.connect();
        }, 1000);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      console.log('🔄 Error details:', {
        message: error.message,
        description: error.description,
        context: error.context,
        type: error.type
      });
      
      this.isConnected = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('❌ Max reconnection attempts reached');
        console.log('💡 Switching to polling mode...');
        
        // Try with polling only as fallback
        this.socket.io.opts.transports = ['polling'];
        setTimeout(() => {
          this.socket.connect();
        }, 2000);
      }
    });

    this.socket.on('connected', (data) => {
      console.log('🎉 Server connection confirmed:', data);
    });

    this.socket.on('pong', (data) => {
      console.log('🏓 Pong received:', data);
    });

    // Real-time event handlers
    this.socket.on('standup_update', (data) => {
      console.log('📊 Standup update received:', data);
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

    this.socket.on('team_joined', (data) => {
      console.log('✅ Successfully joined team room:', data);
    });
  }

  joinTeam(teamId, companyId) {
    if (this.socket && this.isConnected) {
      console.log(`👥 Joining team room: ${teamId} in company: ${companyId}`);
      this.socket.emit('join_team', { team_id: teamId, company_id: companyId });
    } else {
      console.warn('⚠️ Socket not connected, cannot join team');
    }
  }

  leaveTeam(teamId, companyId) {
    if (this.socket && this.isConnected) {
      console.log(`👋 Leaving team room: ${teamId} in company: ${companyId}`);
      this.socket.emit('leave_team', { team_id: teamId, company_id: companyId });
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Manually disconnecting WebSocket');
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  getConnectionStatus() {
    return this.isConnected ? 'Connected' : 'Disconnected';
  }

  // Utility method to test connection
  testConnection() {
    if (this.socket && this.isConnected) {
      this.socket.emit('ping');
      return true;
    }
    return false;
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;