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

# Hardcode allowed origins for testing - Railway env vars seem to have issues
allowed_origins = [
    'http://localhost:3000',
    'https://upstand-omega.vercel.app',
    'https://upstand-git-main-minsung1kims-projects.vercel.app',
    'https://upstand-cytbctct3-minsung1kims-projects.vercel.app/'
]

print(f"🔍 ALLOWED_ORIGINS env var: {os.getenv('ALLOWED_ORIGINS')}")
print(f"🔍 Hardcoded allowed_origins: {allowed_origins}")

CORS(app, 
     origins=allowed_origins,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Company-ID', 'Access-Control-Allow-Origin'],
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'])

socketio = SocketIO(app, 
                   cors_allowed_origins=allowed_origins,
                   logger=False, 
                   engineio_logger=False,
                   ping_timeout=60,
                   ping_interval=25)

# Firebase Admin SDK
firebase_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
if firebase_key:
    try:
        if firebase_key.startswith('{'):
            firebase_config = json.loads(firebase_key)
            cred = credentials.Certificate(firebase_config)
        else:
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

openai.api_key = os.getenv('OPENAI_API_KEY')

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization')
        if not id_token:
            return jsonify({'error': 'No authorization token provided'}), 401
        try:
            if id_token.startswith('Bearer '):
                id_token = id_token[7:]
            decoded_token = auth.verify_id_token(id_token)
            request.user_id = decoded_token['uid']
            request.user_email = decoded_token.get('email', '')
            request.company_id = request.headers.get('X-Company-ID', 'default')
        except Exception as e:
            return jsonify({'error': 'Invalid authorization token', 'details': str(e)}), 401
        return f(*args, **kwargs)
    return decorated_function

# ===== HELPER FUNCTIONS =====

def detect_blockers(text):
    """Simple blocker detection"""
    blocker_keywords = ['blocked', 'stuck', 'issue', 'problem', 'waiting', 'cant', "can't", 'unable']
    text_lower = text.lower()
    has_blockers = any(keyword in text_lower for keyword in blocker_keywords)
    
    return {
        'has_blockers': has_blockers,
        'blockers': [text] if has_blockers else []
    }

def analyze_sentiment(text):
    """Simple sentiment analysis"""
    positive_words = ['good', 'great', 'excellent', 'finished', 'completed', 'success']
    negative_words = ['bad', 'terrible', 'stuck', 'blocked', 'failed', 'problem']
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    
    if positive_count > negative_count:
        sentiment = 'positive'
    elif negative_count > positive_count:
        sentiment = 'negative'
    else:
        sentiment = 'neutral'
    
    return {'sentiment': sentiment}

def summarize_standups(entries):
    """Generate team summary"""
    return f"Team completed {len(entries)} standups today"

def summarize_blockers(blockers):
    """Summarize active blockers"""
    return {'blockers': blockers[:3]}  # Return first 3 blockers

def broadcast_standup_update(company_id, team_id, data):
    """Broadcast standup update to team room"""
    room = f"team_{company_id}_{team_id}"
    socketio.emit('standup_update', data, room=room)

def broadcast_activity(company_id, team_id, data):
    """Broadcast activity update to team room"""
    room = f"team_{company_id}_{team_id}"
    socketio.emit('team_activity', data, room=room)

# ===== SOCKET.IO EVENT HANDLERS =====

@socketio.on('connect')
def handle_connect(auth):
    print(f'Client connected: {request.sid}')
    emit('connection_response', {'status': 'Connected to Upstand server'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')

@socketio.on('join_team')
def handle_join_team(data):
    team_id = data.get('team_id')
    company_id = data.get('company_id', 'default')
    if team_id and company_id:
        room = f"team_{company_id}_{team_id}"
        join_room(room)
        emit('status', {'msg': f'Joined team {team_id}'})

@socketio.on('leave_team')
def handle_leave_team(data):
    team_id = data.get('team_id')
    company_id = data.get('company_id', 'default')
    if team_id and company_id:
        room = f"team_{company_id}_{team_id}"
        leave_room(room)
        emit('status', {'msg': f'Left team {team_id}'})

@socketio.on('join_sprint')
def handle_join_sprint(data):
    sprint_id = data.get('sprint_id')
    if sprint_id:
        join_room(f'sprint_{sprint_id}')
        emit('status', {'msg': f'Joined sprint {sprint_id}'})

@socketio.on('leave_sprint')
def handle_leave_sprint(data):
    sprint_id = data.get('sprint_id')
    if sprint_id:
        leave_room(f'sprint_{sprint_id}')
        emit('status', {'msg': f'Left sprint {sprint_id}'})

@socketio.on('ping')
def handle_ping():
    emit('pong', {'timestamp': datetime.utcnow().isoformat()})

# ===== BASIC ROUTES =====

@app.route('/api/health', methods=['GET'])
def health_check():
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

@app.route('/api/teams/<team_id>/role', methods=['PUT'])
@require_auth
def update_user_role(team_id):
    """Update user's role in a team"""
    try:
        user_id = request.user_id
        data = request.get_json()
        new_role = data.get('role')
        
        if not new_role or new_role not in ['OWNER', 'MANAGER', 'DEVELOPER', 'VIEWER']:
            return jsonify({
                'success': False,
                'error': 'Invalid role'
            }), 400
        
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
            }), 403
        
        # Update user's role
        member_roles = team_data.get('member_roles', {})
        member_roles[user_id] = new_role
        
        team_ref.update({
            'member_roles': member_roles,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': f'Role updated to {new_role}'
        })
        
    except Exception as e:
        print(f"Error updating role: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update role'
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
            
            # Summarize blockers
            if all_blockers:
                blocker_summary = summarize_blockers(all_blockers)
                active_blockers = blocker_summary.get('blockers', [])
            
            # Determine overall sentiment
            if sentiments:
                avg_sentiment = sum([1 if s == 'positive' else -1 if s == 'negative' else 0 for s in sentiments]) / len(sentiments)
                if avg_sentiment > 0:
                    sentiment_label = 'Positive'
                elif avg_sentiment < 0:
                    sentiment_label = 'Negative'
                else:
                    sentiment_label = 'Neutral'
            
            # Generate team summary if multiple entries exist
            if len(standup_entries) > 1:
                team_summary = summarize_standups(standup_entries)
        
        return jsonify({
            'success': True,
            'standup_count': standup_count,
            'team_summary': team_summary,
            'sentiment': sentiment_label,
            'active_blockers': active_blockers
        })
        
    except Exception as e:
        print(f"Error fetching dashboard data: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch dashboard data'
        }), 500

# ===== SPRINT ROUTES =====

@app.route('/api/sprints', methods=['GET'])
@require_auth
def get_sprints():
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        sprints_ref = db.collection('sprints')
        query = sprints_ref.where('team_id', '==', team_id).where('company_id', '==', company_id)
        sprints = query.stream()
        
        sprint_list = []
        for sprint in sprints:
            sprint_data = sprint.to_dict()
            sprint_data['id'] = sprint.id
            
            # Get tasks for this sprint
            tasks_ref = db.collection('tasks')
            tasks_query = tasks_ref.where('sprint_id', '==', sprint.id)
            tasks = list(tasks_query.stream())
            sprint_data['tasks'] = []
            for task in tasks:
                task_data = task.to_dict()
                task_data['id'] = task.id
                sprint_data['tasks'].append(task_data)
            
            # Get comments for this sprint
            comments_ref = db.collection('sprint_comments')
            comments_query = comments_ref.where('sprint_id', '==', sprint.id).order_by('created_at', direction=firestore.Query.DESCENDING)
            comments = list(comments_query.stream())
            sprint_data['comments'] = []
            for comment in comments:
                comment_data = comment.to_dict()
                comment_data['id'] = comment.id
                # Format time for display
                comment_data['time'] = 'just now' if comment_data.get('created_at') else 'unknown'
                sprint_data['comments'].append(comment_data)
            
            sprint_list.append(sprint_data)
        
        return jsonify({'success': True, 'sprints': sprint_list})
    except Exception as e:
        print(f"Error fetching sprints: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch sprints'}), 500

@app.route('/api/sprints', methods=['POST'])
@require_auth
def create_sprint():
    try:
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        sprint_data = {
            'team_id': team_id,
            'company_id': company_id,
            'name': data.get('name'),
            'start_date': data.get('startDate'),
            'end_date': data.get('endDate'),
            'goals': data.get('goals', []),
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }
        if not all([sprint_data['team_id'], sprint_data['name'], sprint_data['start_date'], sprint_data['end_date']]):
            return jsonify({'error': 'Missing required fields'}), 400
        doc_ref = db.collection('sprints').add(sprint_data)
        sprint_data['id'] = doc_ref[1].id
        return jsonify({'success': True, 'sprint': sprint_data})
    except Exception as e:
        print(f"Error creating sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create sprint'}), 500

@app.route('/api/sprints/<sprint_id>', methods=['PUT'])
@require_auth
def update_sprint(sprint_id):
    try:
        data = request.json
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        if not sprint_doc.exists:
            return jsonify({'error': 'Sprint not found'}), 404
        update_data = {
            'name': data.get('name'),
            'start_date': data.get('startDate'),
            'end_date': data.get('endDate'),
            'goals': data.get('goals', []),
            'updated_at': datetime.utcnow().isoformat()
        }
        sprint_ref.update(update_data)
        return jsonify({'success': True, 'message': 'Sprint updated'})
    except Exception as e:
        print(f"Error updating sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update sprint'}), 500

@app.route('/api/sprints/<sprint_id>', methods=['DELETE'])
@require_auth
def delete_sprint(sprint_id):
    try:
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        if not sprint_doc.exists:
            return jsonify({'error': 'Sprint not found'}), 404
        sprint_ref.delete()
        return jsonify({'success': True, 'message': 'Sprint deleted'})
    except Exception as e:
        print(f"Error deleting sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to delete sprint'}), 500

@app.route('/api/sprints/<sprint_id>/assign', methods=['POST'])
@require_auth
def assign_sprint(sprint_id):
    try:
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        if not sprint_doc.exists:
            return jsonify({'error': 'Sprint not found'}), 404
        sprint_ref.update({'status': 'assigned', 'assigned_at': datetime.utcnow().isoformat()})
        return jsonify({'success': True, 'message': 'Sprint assigned'})
    except Exception as e:
        print(f"Error assigning sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to assign sprint'}), 500

# ===== TASK ROUTES (NEW) =====

@app.route('/api/tasks', methods=['POST'])
@require_auth
def create_task():
    try:
        data = request.json
        company_id = request.company_id
        
        task_data = {
            'sprint_id': data.get('sprint_id'),
            'company_id': company_id,
            'title': data.get('title'),
            'assignee': data.get('assignee', 'Unassigned'),
            'status': data.get('status', 'todo'),
            'estimate': int(data.get('estimate', 1)),
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat()
        }
        
        if not all([task_data['sprint_id'], task_data['title']]):
            return jsonify({'error': 'Missing required fields'}), 400
        
        doc_ref = db.collection('tasks').add(task_data)
        task_data['id'] = doc_ref[1].id
        
        # Emit real-time update
        socketio.emit('task_created', {
            'task': task_data,
            'sprint_id': task_data['sprint_id']
        }, room=f'sprint_{task_data["sprint_id"]}')
        
        return jsonify({'success': True, 'task': task_data})
    except Exception as e:
        print(f"Error creating task: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create task'}), 500

@app.route('/api/tasks/<task_id>', methods=['PUT'])
@require_auth
def update_task(task_id):
    try:
        data = request.json
        task_ref = db.collection('tasks').document(task_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({'error': 'Task not found'}), 404
        
        update_data = {
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Only update fields that are provided
        if 'status' in data:
            update_data['status'] = data['status']
        if 'assignee' in data:
            update_data['assignee'] = data['assignee']
        if 'title' in data:
            update_data['title'] = data['title']
        if 'estimate' in data:
            update_data['estimate'] = int(data['estimate'])
        
        task_ref.update(update_data)
        
        # Get updated task data
        updated_task_doc = task_ref.get()
        updated_task = updated_task_doc.to_dict()
        updated_task['id'] = task_id
        
        # Emit real-time update
        socketio.emit('task_updated', {
            'task': updated_task,
            'sprint_id': updated_task['sprint_id']
        }, room=f'sprint_{updated_task["sprint_id"]}')
        
        return jsonify({'success': True, 'task': updated_task})
    except Exception as e:
        print(f"Error updating task: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update task'}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id):
    try:
        task_ref = db.collection('tasks').document(task_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({'error': 'Task not found'}), 404
        
        task_data = task_doc.to_dict()
        sprint_id = task_data.get('sprint_id')
        
        task_ref.delete()
        
        # Emit real-time update
        socketio.emit('task_deleted', {
            'task_id': task_id,
            'sprint_id': sprint_id
        }, room=f'sprint_{sprint_id}')
        
        return jsonify({'success': True, 'message': 'Task deleted'})
    except Exception as e:
        print(f"Error deleting task: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to delete task'}), 500

# ===== COMMENT ROUTES (NEW) =====

@app.route('/api/sprints/<sprint_id>/comments', methods=['POST'])
@require_auth
def add_sprint_comment(sprint_id):
    try:
        data = request.json
        company_id = request.company_id
        
        comment_data = {
            'sprint_id': sprint_id,
            'company_id': company_id,
            'author': data.get('author', 'Anonymous'),
            'text': data.get('text'),
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat()
        }
        
        if not comment_data['text']:
            return jsonify({'error': 'Comment text is required'}), 400
        
        doc_ref = db.collection('sprint_comments').add(comment_data)
        comment_data['id'] = doc_ref[1].id
        comment_data['time'] = 'just now'  # For UI compatibility
        
        # Emit real-time update
        socketio.emit('comment_added', {
            'comment': comment_data,
            'sprint_id': sprint_id
        }, room=f'sprint_{sprint_id}')
        
        return jsonify({'success': True, 'comment': comment_data})
    except Exception as e:
        print(f"Error adding comment: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to add comment'}), 500

@app.route('/api/sprints/<sprint_id>/comments', methods=['GET'])
@require_auth
def get_sprint_comments(sprint_id):
    try:
        comments_ref = db.collection('sprint_comments')
        comments_query = comments_ref.where('sprint_id', '==', sprint_id).order_by('created_at', direction=firestore.Query.DESCENDING)
        comments = list(comments_query.stream())
        
        comment_list = []
        for comment in comments:
            comment_data = comment.to_dict()
            comment_data['id'] = comment.id
            comment_data['time'] = 'just now' if comment_data.get('created_at') else 'unknown'
            comment_list.append(comment_data)
        
        return jsonify({'success': True, 'comments': comment_list})
    except Exception as e:
        print(f"Error fetching comments: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch comments'}), 500

# ===== RETRO ROUTES =====

@app.route('/api/retrospectives', methods=['POST'])
@require_auth
def create_retrospective():
    """Create a retrospective session"""
    try:
        data = request.get_json()
        company_id = request.company_id
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        retro_data = {
            'team_id': team_id,
            'company_id': company_id,
            'sprint_name': data.get('sprint_name', ''),
            'what_went_well': data.get('what_went_well', []),
            'what_could_improve': data.get('what_could_improve', []),
            'action_items': data.get('action_items', []),
            'created_by': request.user_id,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        # Analyze feedback using basic AI (if OpenAI key available)
        all_feedback = (
            retro_data['what_went_well'] + 
            retro_data['what_could_improve']
        )
        
        if all_feedback and openai.api_key:
            try:
                # Simple feedback analysis
                feedback_text = '\n'.join(all_feedback)
                retro_data['ai_analysis'] = {
                    'feedback_count': len(all_feedback),
                    'positive_items': len(retro_data['what_went_well']),
                    'improvement_items': len(retro_data['what_could_improve']),
                    'summary': f"Team provided {len(all_feedback)} feedback items for retrospective"
                }
            except Exception as e:
                print(f"AI analysis error: {e}")
                retro_data['ai_analysis'] = {'error': 'AI analysis failed'}
        
        # Save to Firestore
        doc_ref = db.collection('retrospectives').add(retro_data)
        
        return jsonify({
            'success': True,
            'retrospective_id': doc_ref[1].id,
            'ai_analysis': retro_data.get('ai_analysis', {}),
            'message': 'Retrospective created successfully'
        })
        
    except Exception as e:
        print(f"Error creating retrospective: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/retrospectives', methods=['GET'])
@require_auth
def get_retrospectives():
    """Get retrospectives for a team"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Get retrospectives for the team
        retros_ref = db.collection('retrospectives')
        query = retros_ref.where('team_id', '==', team_id).where('company_id', '==', company_id).order_by('created_at', direction=firestore.Query.DESCENDING)
        retros = query.stream()
        
        retro_list = []
        for retro in retros:
            retro_data = retro.to_dict()
            retro_data['id'] = retro.id
            # Convert timestamp to ISO string for JSON serialization
            if 'created_at' in retro_data and retro_data['created_at']:
                retro_data['created_at'] = retro_data['created_at'].isoformat()
            retro_list.append(retro_data)
        
        return jsonify({
            'success': True,
            'retrospectives': retro_list
        })
        
    except Exception as e:
        print(f"Error fetching retrospectives: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch retrospectives'}), 500

# ===== BASIC HEALTH ROUTES =====

@app.route('/health', methods=['GET'])
def railway_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

@app.route('/cors-test', methods=['GET', 'OPTIONS'])
def cors_test():
    return jsonify({
        'message': 'CORS test successful',
        'allowed_origins': allowed_origins,
        'request_origin': request.headers.get('Origin', 'No origin header')
    })

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = '0.0.0.0'
    
    print(f"Starting Upstand server on {host}:{port}")
    print(f"Debug mode: {debug_mode}")
    print(f"Allowed origins: {allowed_origins}")
    print(f"Firebase status: {'Connected' if db else 'Not connected'}")
    print(f"WebSocket support: {socketio.server.eio.async_mode}")
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)