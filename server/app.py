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

# ===== RETRO ROUTES =====
# ... (your existing retro routes here, unchanged) ...

# Railway deployment health check
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
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)

