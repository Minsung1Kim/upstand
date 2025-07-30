"""
Upstand Backend - AI-Powered Agile Scrum Assistant
Main Flask application with routes for standup meetings, sprint planning, and retrospectives
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, auth
from dotenv import load_dotenv
import openai
from functools import wraps
import json
import threading
import time

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-12345')

# Get allowed origins from environment or use defaults
allowed_origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,https://upstand-omega.vercel.app')
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(',')]

# Configure CORS with more permissive settings for debugging
CORS(app, 
     origins=allowed_origins,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Company-ID', 'Access-Control-Allow-Origin'],
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'])

# Initialize Socket.IO with proper configuration
socketio = SocketIO(app, 
                   cors_allowed_origins=allowed_origins,
                   logger=False, 
                   engineio_logger=False,
                   ping_timeout=60,
                   ping_interval=25)

# Initialize Firebase Admin SDK
firebase_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
if firebase_key:
    try:
        # Try to parse as JSON string (for deployment)
        if firebase_key.startswith('{'):
            import json
            firebase_config = json.loads(firebase_key)
            cred = credentials.Certificate(firebase_config)
        else:
            # Use as file path (for local development)
            cred = credentials.Certificate(firebase_key)
        
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firebase initialized successfully")
    except Exception as e:
        print(f"Firebase initialization error: {e}")
        db = None
else:
    print("Warning: FIREBASE_SERVICE_ACCOUNT_KEY not found")
    db = None

# Initialize OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')

# Authentication decorator
def require_auth(f):
    """Decorator to verify Firebase Auth token and extract company context"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'error': 'No authorization token provided'}), 401
        
        try:
            # Remove 'Bearer ' prefix if present
            if id_token.startswith('Bearer '):
                id_token = id_token[7:]
            
            # Verify the token
            decoded_token = auth.verify_id_token(id_token)
            request.user_id = decoded_token['uid']
            request.user_email = decoded_token.get('email', '')
            
            # Extract company context from header
            request.company_id = request.headers.get('X-Company-ID', 'default')
            
        except Exception as e:
            return jsonify({'error': 'Invalid authorization token', 'details': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated_function

# WebSocket authentication helper
def verify_socket_auth(auth_data):
    """Verify authentication for WebSocket connections"""
    try:
        token = auth_data.get('token')
        company_id = auth_data.get('company_id', 'default')
        
        if not token:
            return None, None, None
            
        # Remove 'Bearer ' prefix if present
        if token.startswith('Bearer '):
            token = token[7:]
            
        # Verify the token
        decoded_token = auth.verify_id_token(token)
        user_id = decoded_token['uid']
        user_email = decoded_token.get('email', '')
        
        return user_id, user_email, company_id
    except Exception as e:
        print(f"Socket auth error: {e}")
        return None, None, None

# Store active connections
active_connections = {}  # {session_id: {user_id, user_email, company_id, team_id}}
online_users = {}  # {company_id: {team_id: [user_objects]}}

# AI Service Functions
def summarize_standups(standup_entries):
    """Use GPT to summarize multiple standup entries"""
    prompt = f"""
    Summarize the following standup meeting entries into a concise team update.
    Highlight key accomplishments, today's focus areas, and any blockers.
    
    Standup Entries:
    {json.dumps(standup_entries, indent=2)}
    
    Provide:
    1. Team Summary (2-3 sentences)
    2. Key Accomplishments
    3. Today's Focus
    4. Active Blockers (if any)
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an agile scrum master providing concise team updates."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=500
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error generating summary: {str(e)}"

def detect_blockers(text):
    """Use GPT to detect potential blockers in standup text"""
    prompt = f"""
    Analyze the following standup update and identify any blockers or impediments.
    Look for phrases indicating delays, dependencies, waiting, stuck, blocked, etc.
    
    Text: {text}
    
    Return JSON with:
    - has_blockers: boolean
    - blockers: array of identified blocker descriptions
    - severity: "low", "medium", "high"
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an AI assistant that identifies blockers in agile standups. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=200
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"has_blockers": False, "blockers": [], "severity": "low", "error": str(e)}

def analyze_sentiment(text):
    """Use GPT to analyze sentiment of standup text"""
    prompt = f"""
    Analyze the sentiment of this standup update.
    
    Text: {text}
    
    Return JSON with:
    - sentiment: "positive", "neutral", or "negative"
    - score: float between -1 and 1
    - confidence: float between 0 and 1
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a sentiment analysis AI. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=100
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"sentiment": "neutral", "score": 0, "confidence": 0, "error": str(e)}

def cluster_retrospective_feedback(feedback_list):
    """Use GPT to cluster and analyze retrospective feedback"""
    prompt = f"""
    Analyze the following retrospective feedback from team members.
    Group similar themes together and provide insights.
    
    Feedback:
    {json.dumps(feedback_list, indent=2)}
    
    Return a JSON object with:
    - themes: array of theme objects, each with:
      - title: string
      - items: array of related feedback items
      - sentiment: "positive", "neutral", or "negative"
      - actionable: boolean
    - overall_sentiment: team sentiment summary
    - suggested_actions: array of recommended action items
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an agile coach analyzing team retrospective feedback. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=800
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"themes": [], "overall_sentiment": "neutral", "suggested_actions": [], "error": str(e)}

# ===== WEBSOCKET EVENT HANDLERS =====

@socketio.on('connect')
def handle_connect(auth):
    """Handle client connection"""
    print(f"Client connecting with auth: {auth}")
    
    # Verify authentication
    user_id, user_email, company_id = verify_socket_auth(auth)
    if not user_id:
        print("Authentication failed for socket connection")
        disconnect()
        return False
    
    # Store connection info
    session_id = request.sid
    active_connections[session_id] = {
        'user_id': user_id,
        'user_email': user_email,
        'company_id': company_id,
        'connected_at': datetime.utcnow().isoformat()
    }
    
    # Join company room
    join_room(f"company_{company_id}")
    
    print(f"User {user_email} connected to company {company_id}")
    emit('connected', {'status': 'connected', 'user_id': user_id})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    session_id = request.sid
    if session_id in active_connections:
        user_info = active_connections[session_id]
        company_id = user_info['company_id']
        team_id = user_info.get('team_id')
        
        # Remove from online users
        if company_id in online_users and team_id and team_id in online_users[company_id]:
            online_users[company_id][team_id] = [
                u for u in online_users[company_id][team_id] 
                if u['userId'] != user_info['user_id']
            ]
            
            # Broadcast updated online users to team
            socketio.emit('users_online_updated', {
                'online_users': online_users[company_id][team_id]
            }, room=f"team_{company_id}_{team_id}")
        
        # Clean up connection
        del active_connections[session_id]
        print(f"User {user_info['user_email']} disconnected")

@socketio.on('join_team')
def handle_join_team(data):
    """Join a team room for real-time updates"""
    session_id = request.sid
    if session_id not in active_connections:
        emit('error', {'message': 'Not authenticated'})
        return
    
    user_info = active_connections[session_id]
    team_id = data.get('team_id')
    company_id = user_info['company_id']
    
    if not team_id:
        emit('error', {'message': 'team_id required'})
        return
    
    # Verify team access
    try:
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists:
            emit('error', {'message': 'Team not found'})
            return
            
        team_data = team_doc.to_dict()
        if (team_data.get('company_id') != company_id or 
            user_info['user_id'] not in team_data.get('members', [])):
            emit('error', {'message': 'Access denied'})
            return
    except Exception as e:
        emit('error', {'message': 'Failed to verify team access'})
        return
    
    # Join team room
    team_room = f"team_{company_id}_{team_id}"
    join_room(team_room)
    
    # Update connection info
    active_connections[session_id]['team_id'] = team_id
    
    # Add to online users
    if company_id not in online_users:
        online_users[company_id] = {}
    if team_id not in online_users[company_id]:
        online_users[company_id][team_id] = []
    
    # Check if user already in online list
    user_exists = any(u['userId'] == user_info['user_id'] for u in online_users[company_id][team_id])
    if not user_exists:
        online_users[company_id][team_id].append({
            'userId': user_info['user_id'],
            'userEmail': user_info['user_email'],
            'userName': user_info['user_email'].split('@')[0]
        })
    
    # Broadcast updated online users to team
    socketio.emit('users_online_updated', {
        'online_users': online_users[company_id][team_id]
    }, room=team_room)
    
    emit('team_joined', {'team_id': team_id, 'room': team_room})
    print(f"User {user_info['user_email']} joined team {team_id}")

@socketio.on('leave_team')
def handle_leave_team(data):
    """Leave a team room"""
    session_id = request.sid
    if session_id not in active_connections:
        return
    
    user_info = active_connections[session_id]
    team_id = data.get('team_id')
    company_id = user_info['company_id']
    
    if team_id:
        team_room = f"team_{company_id}_{team_id}"
        leave_room(team_room)
        
        # Remove from online users
        if company_id in online_users and team_id in online_users[company_id]:
            online_users[company_id][team_id] = [
                u for u in online_users[company_id][team_id] 
                if u['userId'] != user_info['user_id']
            ]
            
            # Broadcast updated online users
            socketio.emit('users_online_updated', {
                'online_users': online_users[company_id][team_id]
            }, room=team_room)
        
        # Remove team from connection info
        if 'team_id' in active_connections[session_id]:
            del active_connections[session_id]['team_id']
        
        emit('team_left', {'team_id': team_id})
        print(f"User {user_info['user_email']} left team {team_id}")

@socketio.on('send_notification')
def handle_send_notification(data):
    """Send real-time notification"""
    session_id = request.sid
    if session_id not in active_connections:
        emit('error', {'message': 'Not authenticated'})
        return
    
    user_info = active_connections[session_id]
    company_id = user_info['company_id']
    team_id = data.get('team_id')
    
    notification = {
        'id': f"notif_{int(time.time() * 1000)}",
        'type': data.get('type', 'info'),
        'title': data.get('title', 'Notification'),
        'message': data.get('message', ''),
        'sender': user_info['user_email'],
        'timestamp': datetime.utcnow().isoformat(),
        'team_id': team_id
    }
    
    # Send to team room
    if team_id:
        team_room = f"team_{company_id}_{team_id}"
        socketio.emit('notification', notification, room=team_room)
    else:
        # Send to company room
        socketio.emit('notification', notification, room=f"company_{company_id}")
    
    print(f"Notification sent by {user_info['user_email']}: {notification['title']}")

# Real-time activity tracking
def broadcast_activity(company_id, team_id, activity_data):
    """Broadcast activity to team members"""
    if not team_id:
        return
        
    team_room = f"team_{company_id}_{team_id}"
    socketio.emit('activity_update', activity_data, room=team_room)
    print(f"Activity broadcasted to team {team_id}: {activity_data.get('activity_type')}")

def broadcast_standup_update(company_id, team_id, standup_data):
    """Broadcast standup update to team members"""
    if not team_id:
        return
        
    team_room = f"team_{company_id}_{team_id}"
    socketio.emit('standup_update', standup_data, room=team_room)
    print(f"Standup update broadcasted to team {team_id}")

# ===== BASIC ROUTES =====

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    firebase_status = 'connected' if db is not None else 'disconnected'
    openai_status = 'configured' if os.getenv('OPENAI_API_KEY') else 'not configured'
    
    return jsonify({
        'status': 'healthy' if firebase_status == 'connected' else 'degraded',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'firebase': firebase_status,
            'openai': openai_status,
            'websocket': 'enabled'
        }
    })

# ===== TEAMS ROUTES =====

@app.route('/api/teams', methods=['GET'])
@require_auth
def get_teams():
    """Get all teams for current user in the current company"""
    try:
        user_id = request.user_id
        company_id = request.company_id
        
        # Query teams where user is a member and belongs to current company
        teams_ref = db.collection('teams')
        query = teams_ref.where('members', 'array_contains', user_id).where('company_id', '==', company_id)
        teams = query.stream()
        
        team_list = []
        for team in teams:
            team_data = team.to_dict()
            team_data['id'] = team.id
            
            # Get user's role in this team
            user_role = 'DEVELOPER'  # default
            if 'member_roles' in team_data and user_id in team_data['member_roles']:
                user_role = team_data['member_roles'][user_id]
            
            # Count members
            member_count = len(team_data.get('members', []))
            
            # Get owner info
            owner_id = team_data.get('owner_id')
            owner_name = 'Unknown'
            if owner_id:
                try:
                    owner_user = auth.get_user(owner_id)
                    owner_name = owner_user.email or owner_user.display_name or 'Unknown'
                except:
                    owner_name = 'Unknown'
            
            team_list.append({
                'id': team_data['id'],
                'name': team_data.get('name', 'Unnamed Team'),
                'role': user_role,
                'member_count': member_count,
                'owner_name': owner_name,
                'owner_id': owner_id,
                'company_id': team_data.get('company_id'),
                'created_at': team_data.get('created_at'),
                'description': team_data.get('description', '')
            })
        
        return jsonify({
            'success': True,
            'teams': team_list
        })
        
    except Exception as e:
        print(f"Error fetching teams: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch teams'
        }), 500

@app.route('/api/teams', methods=['POST'])
@require_auth
def create_team():
    """Create a new team in the current company"""
    try:
        user_id = request.user_id
        user_email = request.user_email
        company_id = request.company_id
        
        data = request.get_json()
        team_name = data.get('name', '').strip()
        
        if not team_name:
            return jsonify({
                'success': False,
                'error': 'Team name is required'
            }), 400
        
        # Create team document
        team_doc = {
            'name': team_name,
            'description': data.get('description', ''),
            'owner_id': user_id,
            'company_id': company_id,  # Use company from request context
            'members': [user_id],  # Owner is automatically a member
            'member_roles': {
                user_id: 'OWNER'
            },
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Add to Firestore
        teams_ref = db.collection('teams')
        team_ref = teams_ref.add(team_doc)
        team_id = team_ref[1].id
        
        # Return created team info
        return jsonify({
            'success': True,
            'team': {
                'id': team_id,
                'name': team_name,
                'role': 'OWNER',
                'member_count': 1,
                'owner_name': user_email,
                'owner_id': user_id,
                'company_id': team_doc['company_id'],
                'created_at': team_doc['created_at'],
                'description': team_doc['description']
            }
        })
        
    except Exception as e:
        print(f"Error creating team: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to create team'
        }), 500

@app.route('/api/teams/<team_id>', methods=['GET'])
@require_auth
def get_team(team_id):
    """Get specific team details"""
    try:
        user_id = request.user_id
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Team not found'
            }), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user is a member
        if user_id not in team_data.get('members', []):
            return jsonify({
                'success': False,
                'error': 'Access denied - not a team member'
            }), 403
        
        # Get detailed member info
        members = []
        for member_id in team_data.get('members', []):
            try:
                member_user = auth.get_user(member_id)
                member_role = team_data.get('member_roles', {}).get(member_id, 'DEVELOPER')
                
                members.append({
                    'id': member_id,
                    'email': member_user.email,
                    'display_name': member_user.display_name,
                    'role': member_role,
                    'joined_at': team_data.get('member_joined', {}).get(member_id, team_data.get('created_at'))
                })
            except Exception as e:
                print(f"Error getting member info for {member_id}: {e}")
                continue
        
        return jsonify({
            'success': True,
            'team': {
                'id': team_id,
                'name': team_data.get('name'),
                'description': team_data.get('description', ''),
                'owner_id': team_data.get('owner_id'),
                'company_id': team_data.get('company_id'),
                'created_at': team_data.get('created_at'),
                'members': members,
                'member_count': len(members)
            }
        })
        
    except Exception as e:
        print(f"Error fetching team details: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch team details'
        }), 500

@app.route('/api/teams/<team_id>', methods=['DELETE'])
@require_auth
def delete_team(team_id):
    """Delete team (owner only)"""
    try:
        user_id = request.user_id
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Team not found'
            }), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user is owner
        if team_data.get('owner_id') != user_id:
            return jsonify({
                'success': False,
                'error': 'Access denied - only team owner can delete team'
            }), 403
        
        # Delete team document
        team_ref.delete()
        
        return jsonify({
            'success': True,
            'message': 'Team deleted successfully'
        })
        
    except Exception as e:
        print(f"Error deleting team: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to delete team'
        }), 500

@app.route('/api/teams/<team_id>/join', methods=['POST'])
@require_auth
def join_team(team_id):
    """Join a team"""
    try:
        user_id = request.user_id
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Team not found'
            }), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user is already a member
        if user_id in team_data.get('members', []):
            return jsonify({
                'success': False,
                'error': 'You are already a member of this team'
            }), 400
        
        # Add user to team
        members = team_data.get('members', [])
        members.append(user_id)
        
        member_roles = team_data.get('member_roles', {})
        member_roles[user_id] = 'DEVELOPER'  # Default role
        
        member_joined = team_data.get('member_joined', {})
        member_joined[user_id] = datetime.utcnow().isoformat()
        
        team_ref.update({
            'members': members,
            'member_roles': member_roles,
            'member_joined': member_joined,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Successfully joined team'
        })
        
    except Exception as e:
        print(f"Error joining team: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to join team'
        }), 500

@app.route('/api/teams/<team_id>/leave', methods=['POST'])
@require_auth
def leave_team(team_id):
    """Leave a team"""
    try:
        user_id = request.user_id
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({
                'success': False,
                'error': 'Team not found'
            }), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user is a member
        if user_id not in team_data.get('members', []):
            return jsonify({
                'success': False,
                'error': 'You are not a member of this team'
            }), 400
        
        # Check if user is owner
        if team_data.get('owner_id') == user_id:
            return jsonify({
                'success': False,
                'error': 'Team owner cannot leave team. Transfer ownership or delete the team.'
            }), 400
        
        # Remove user from team
        members = team_data.get('members', [])
        members.remove(user_id)
        
        member_roles = team_data.get('member_roles', {})
        if user_id in member_roles:
            del member_roles[user_id]
        
        member_joined = team_data.get('member_joined', {})
        if user_id in member_joined:
            del member_joined[user_id]
        
        team_ref.update({
            'members': members,
            'member_roles': member_roles,
            'member_joined': member_joined,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Successfully left team'
        })
        
    except Exception as e:
        print(f"Error leaving team: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to leave team'
        }), 500

# ===== STANDUP ROUTES =====

@app.route('/api/submit-standup', methods=['POST'])
@require_auth
def submit_standup():
    """Submit daily standup and receive AI summary for current company"""
    try:
        data = request.json
        team_id = data.get('team_id')
        company_id = request.company_id
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Create standup entry
        standup_data = {
            'user_id': request.user_id,
            'user_email': request.user_email,
            'team_id': team_id,
            'company_id': company_id,
            'yesterday': data.get('yesterday', ''),
            'today': data.get('today', ''),
            'blockers': data.get('blockers', ''),
            'timestamp': firestore.SERVER_TIMESTAMP,
            'date': datetime.utcnow().strftime('%Y-%m-%d')
        }
        
        # Detect blockers
        blocker_analysis = detect_blockers(f"{data.get('yesterday', '')} {data.get('today', '')} {data.get('blockers', '')}")
        standup_data['blocker_analysis'] = blocker_analysis
        
        # Analyze sentiment
        sentiment_analysis = analyze_sentiment(f"{data.get('yesterday', '')} {data.get('today', '')} {data.get('blockers', '')}")
        standup_data['sentiment'] = sentiment_analysis
        
        # Save to Firestore
        doc_ref = db.collection('standups').add(standup_data)
        standup_id = doc_ref[1].id
        
        # Get today's standups for the team in current company
        today = datetime.utcnow().strftime('%Y-%m-%d')
        team_standups = db.collection('standups').where('team_id', '==', team_id).where('company_id', '==', company_id).where('date', '==', today).get()
        
        standup_entries = []
        for doc in team_standups:
            entry = doc.to_dict()
            standup_entries.append({
                'user': entry.get('user_email', 'Unknown'),
                'yesterday': entry.get('yesterday', ''),
                'today': entry.get('today', ''),
                'blockers': entry.get('blockers', '')
            })
        
        # Generate team summary if multiple entries exist
        team_summary = ""
        if len(standup_entries) > 1:
            team_summary = summarize_standups(standup_entries)
        
        # Broadcast real-time standup update
        standup_broadcast_data = {
            'id': standup_id,
            'user_id': request.user_id,
            'user_email': request.user_email,
            'team_id': team_id,
            'yesterday': data.get('yesterday', ''),
            'today': data.get('today', ''),
            'blockers': data.get('blockers', ''),
            'blocker_analysis': blocker_analysis,
            'sentiment': sentiment_analysis,
            'timestamp': datetime.utcnow().isoformat()
        }
        broadcast_standup_update(company_id, team_id, standup_broadcast_data)
        
        # Broadcast activity update
        activity_data = {
            'id': f"activity_{int(time.time() * 1000)}",
            'activity_type': 'standup',
            'user_name': request.user_email.split('@')[0],
            'user_id': request.user_id,
            'details': {
                'action': 'submitted',
                'blocker': data.get('blockers', '') if data.get('blockers', '') else None
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        broadcast_activity(company_id, team_id, activity_data)
        
        # Send notification for blockers
        if blocker_analysis.get('has_blockers'):
            notification_data = {
                'type': 'warning',
                'title': 'Blocker Detected',
                'message': f"{request.user_email.split('@')[0]} reported blockers in their standup",
                'team_id': team_id
            }
            team_room = f"team_{company_id}_{team_id}"
            socketio.emit('notification', {
                'id': f"notif_{int(time.time() * 1000)}",
                'type': notification_data['type'],
                'title': notification_data['title'],
                'message': notification_data['message'],
                'sender': 'System',
                'timestamp': datetime.utcnow().isoformat(),
                'team_id': team_id
            }, room=team_room)
        
        return jsonify({
            'success': True,
            'standup_id': standup_id,
            'blocker_analysis': blocker_analysis,
            'sentiment': sentiment_analysis,
            'team_summary': team_summary,
            'team_standup_count': len(standup_entries)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard', methods=['GET'])
@require_auth
def get_dashboard():
    """Get dashboard data for current user in current company"""
    try:
        user_id = request.user_id
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Get today's date
        today = datetime.utcnow().strftime('%Y-%m-%d')
        
        # Get today's standups for the team in current company
        team_standups = db.collection('standups').where('team_id', '==', team_id).where('company_id', '==', company_id).where('date', '==', today).get()
        
        standup_count = len(list(team_standups))
        
        # Get team summary if standups exist
        team_summary = ""
        sentiment_label = "Neutral"
        active_blockers = []
        
        if standup_count > 0:
            standup_entries = []
            all_blockers = []
            sentiments = []
            
            for doc in team_standups:
                entry = doc.to_dict()
                standup_entries.append({
                    'user': entry.get('user_email', 'Unknown'),
                    'yesterday': entry.get('yesterday', ''),
                    'today': entry.get('today', ''),
                    'blockers': entry.get('blockers', '')
                })
                
                # Collect blockers
                blocker_analysis = entry.get('blocker_analysis', {})
                if blocker_analysis.get('has_blockers'):
                    all_blockers.extend(blocker_analysis.get('blockers', []))
                
                # Collect sentiments
                sentiment = entry.get('sentiment', {})
                if sentiment.get('sentiment'):
                    sentiments.append(sentiment.get('sentiment'))
            
            # Generate team summary
            if len(standup_entries) > 1:
                team_summary = summarize_standups(standup_entries)
            
            # Determine overall sentiment
            if sentiments:
                positive_count = sentiments.count('positive')
                negative_count = sentiments.count('negative')
                if positive_count > negative_count:
                    sentiment_label = "Positive 😊"
                elif negative_count > positive_count:
                    sentiment_label = "Needs attention 😐"
                else:
                    sentiment_label = "Neutral 😐"
            
            active_blockers = list(set(all_blockers))  # Remove duplicates
        
        # Get active sprint (mock data for now)
        active_sprint = {
            'name': 'Sprint 15',
            'total_tasks': 12,
            'completed_tasks': 7
        }
        
        return jsonify({
            'success': True,
            'standup_count': standup_count,
            'team_summary': team_summary,
            'sentiment_label': sentiment_label,
            'active_blockers': active_blockers,
            'active_sprint': active_sprint
        })
        
    except Exception as e:
        print(f"Dashboard error: {str(e)}")
        return jsonify({'error': str(e)}), 500

# ===== SPRINT ROUTES =====

@app.route('/api/create-sprint', methods=['POST'])
@require_auth
def create_sprint():
    """Create a new sprint in current company"""
    try:
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        
        # Verify team belongs to current company
        if team_id:
            team_ref = db.collection('teams').document(team_id)
            team_doc = team_ref.get()
            if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
                return jsonify({'error': 'Team not found or access denied'}), 403
        
        sprint_data = {
            'team_id': team_id,
            'company_id': company_id,
            'name': data.get('name'),
            'start_date': data.get('start_date'),
            'end_date': data.get('end_date'),
            'goals': data.get('goals', []),
            'tasks': data.get('tasks', []),
            'created_by': request.user_id,
            'created_at': firestore.SERVER_TIMESTAMP,
            'status': 'active'
        }
        
        # Validate required fields
        if not all([sprint_data['team_id'], sprint_data['name'], sprint_data['start_date'], sprint_data['end_date']]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Save to Firestore
        doc_ref = db.collection('sprints').add(sprint_data)
        
        return jsonify({
            'success': True,
            'sprint_id': doc_ref[1].id,
            'message': 'Sprint created successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create-retrospective', methods=['POST'])
@require_auth
def create_retrospective():
    """Create a new retrospective in current company"""
    try:
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        
        # Verify team belongs to current company
        if team_id:
            team_ref = db.collection('teams').document(team_id)
            team_doc = team_ref.get()
            if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
                return jsonify({'error': 'Team not found or access denied'}), 403
        
        retro_data = {
            'team_id': team_id,
            'company_id': company_id,
            'sprint_id': data.get('sprint_id'),
            'what_went_well': data.get('what_went_well', []),
            'what_could_improve': data.get('what_could_improve', []),
            'action_items': data.get('action_items', []),
            'created_by': request.user_id,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        # Validate required fields
        if not retro_data['team_id']:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Analyze feedback using AI
        all_feedback = (
            retro_data['what_went_well'] + 
            retro_data['what_could_improve']
        )
        
        if all_feedback:
            analysis = cluster_retrospective_feedback(all_feedback)
            retro_data['ai_analysis'] = analysis
        
        # Save to Firestore
        doc_ref = db.collection('retrospectives').add(retro_data)
        
        return jsonify({
            'success': True,
            'retrospective_id': doc_ref[1].id,
            'ai_analysis': retro_data.get('ai_analysis', {}),
            'message': 'Retrospective created successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Railway deployment health check
@app.route('/health', methods=['GET'])
def railway_health():
    """Railway health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

# CORS test endpoint
@app.route('/cors-test', methods=['GET', 'OPTIONS'])
def cors_test():
    """Test CORS configuration"""
    return jsonify({
        'message': 'CORS test successful',
        'allowed_origins': allowed_origins,
        'request_origin': request.headers.get('Origin', 'No origin header')
    })

if __name__ == '__main__':
    # Get configuration from environment - Railway sets PORT automatically
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = '0.0.0.0'  # Always bind to all interfaces for Railway
    
    print(f"Starting Upstand server on {host}:{port}")
    print(f"Debug mode: {debug_mode}")
    print(f"Allowed origins: {allowed_origins}")
    print(f"Firebase status: {'Connected' if db else 'Not connected'}")
    
    # Use SocketIO run instead of Flask run for WebSocket support
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)  # Allow for production deployment