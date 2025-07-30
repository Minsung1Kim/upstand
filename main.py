# Railway entry point - imports and runs the Flask app
import sys
import os

# Add server directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'server'))

# Import and run the Flask app
from app import app, socketio

if __name__ == '__main__':
    # Get configuration from environment
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '0.0.0.0')
    
    print(f"🚀 Starting Upstand server on {host}:{port}")
    print(f"🔧 Debug mode: {debug_mode}")
    
    # Use SocketIO run instead of Flask run for WebSocket support
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=debug_mode,
                log_output=not debug_mode)