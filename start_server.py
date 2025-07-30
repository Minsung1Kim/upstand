#!/usr/bin/env python3
"""
Upstand Server Startup Script
Handles environment setup and server initialization
"""

import os
import sys
from pathlib import Path

# Add server directory to path
server_dir = Path(__file__).parent / "server"
sys.path.insert(0, str(server_dir))

# Change to server directory
os.chdir(server_dir)

# Set default environment variables
os.environ.setdefault('FLASK_DEBUG', 'True')
os.environ.setdefault('PORT', '5000')
os.environ.setdefault('HOST', '0.0.0.0')

print("Starting Upstand Server...")
print(f"Working directory: {os.getcwd()}")
print(f"Debug mode: {os.getenv('FLASK_DEBUG')}")
print(f"Port: {os.getenv('PORT')}")

try:
    # Import and run the Flask app
    from app import app, socketio
    
    # Get configuration
    debug_mode = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '0.0.0.0')
    
    print(f"Server starting on http://{host}:{port}")
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=debug_mode)
                
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you're in the correct directory and dependencies are installed")
    print("Run: pip install -r server/requirements.txt")
    sys.exit(1)
except Exception as e:
    print(f"Server startup error: {e}")
    sys.exit(1)