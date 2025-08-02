import os
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, auth
from dotenv import load_dotenv
import openai
from functools import wraps
import json
import threading
import time
import traceback
from collections import defaultdict, Counter
import statistics

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-12345')

# Get allowed origins from environment
allowed_origins_env = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000')
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(',')]

print(f"ALLOWED_ORIGINS env var: {os.getenv('ALLOWED_ORIGINS')}")
print(f"Parsed allowed_origins: {allowed_origins}")

CORS(app, 
     origins=allowed_origins,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Company-ID', 'Access-Control-Allow-Origin'],
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'],
     max_age=3600)

socketio = SocketIO(app, 
                   cors_allowed_origins=allowed_origins,
                   logger=False, 
                   engineio_logger=False,
                   ping_timeout=60,
                   ping_interval=25)

# Add explicit OPTIONS handler for CORS preflight
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "Content-Type,Authorization,X-Company-ID")
        response.headers.add('Access-Control-Allow-Methods', "GET,PUT,POST,DELETE,OPTIONS")
        response.headers.add('Access-Control-Allow-Credentials', "true")
        return response

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

# ===== ANALYTICS & TRACKING =====

def track_user_action(action, metadata=None, team_id=None):
    """Track user actions for analytics"""
    try:
        if not db:
            return
            
        # Get user info from request context
        user_id = getattr(request, 'user_id', 'anonymous')
        company_id = getattr(request, 'company_id', 'default')
        
        analytics_data = {
            'user_id': user_id,
            'company_id': company_id,
            'team_id': team_id,
            'action': action,
            'metadata': metadata or {},
            'timestamp': datetime.utcnow().isoformat(),
            'user_agent': request.headers.get('User-Agent', ''),
            'ip_address': request.remote_addr
        }
        
        # Store in Firestore
        db.collection('user_analytics').add(analytics_data)
        
        print(f"Tracked action: {action} for user {user_id}")
        
    except Exception as e:
        print(f"Error tracking user action: {str(e)}")
        # Don't fail the main request if analytics fails

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

# ===== TEAMS ROUTES =====

@app.route('/api/teams', methods=['GET'])
@require_auth
def get_teams():
    """Get all teams for current user in the current company"""
    try:
        # Check database connection
        if not db:
            return jsonify({'error': 'Database connection not available'}), 503
            
        user_id = request.user_id
        company_id = request.company_id
        
        track_user_action('view_teams', {'company_id': company_id})
        
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
                    owner_name = owner_user.display_name or owner_user.email
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
        
        track_user_action('create_team', {'team_name': team_name})
        
        # Create team document
        team_doc = {
            'name': team_name,
            'description': data.get('description', ''),
            'owner_id': user_id,
            'company_id': company_id,
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
                'company_id': company_id,
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

# ===== SPRINT ROUTES =====

@app.route('/api/sprints', methods=['GET'])
@require_auth
def get_sprints():
    try:
        # Check database connection
        if not db:
            return jsonify({'error': 'Database connection not available'}), 503
        
        company_id = request.company_id
        team_id = request.args.get('team_id')
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_sprints', {'team_id': team_id}, team_id)
        
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
            
            # Calculate sprint metrics
            total_story_points = 0
            completed_story_points = 0
            task_status_counts = {'todo': 0, 'in_progress': 0, 'done': 0}
            
            for task in tasks:
                task_data = task.to_dict()
                task_data['id'] = task.id
                sprint_data['tasks'].append(task_data)
                
                # Track task metrics
                story_points = task_data.get('estimate', 1)
                status = task_data.get('status', 'todo')
                
                total_story_points += story_points
                task_status_counts[status] += 1
                
                if status == 'done':
                    completed_story_points += story_points
            
            # Calculate completion percentage
            completion_percentage = (completed_story_points / total_story_points * 100) if total_story_points > 0 else 0
            
            # Add analytics to sprint data
            sprint_data['analytics'] = {
                'total_story_points': total_story_points,
                'completed_story_points': completed_story_points,
                'completion_percentage': round(completion_percentage, 1),
                'task_counts': task_status_counts,
                'total_tasks': len(tasks)
            }
            
            # Get comments for this sprint
            comments_ref = db.collection('sprint_comments')
            comments_query = comments_ref.where('sprint_id', '==', sprint.id).order_by('created_at', direction=firestore.Query.DESCENDING)
            comments = list(comments_query.stream())
            sprint_data['comments'] = []
            for comment in comments:
                comment_data = comment.to_dict()
                comment_data['id'] = comment.id
                comment_data['time'] = 'just now' if comment_data.get('created_at') else 'unknown'
                sprint_data['comments'].append(comment_data)
            
            sprint_list.append(sprint_data)
        
        return jsonify({'success': True, 'sprints': sprint_list})
    except Exception as e:
        print(f"Error fetching sprints: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to fetch sprints'}), 500

@app.route('/api/sprints', methods=['POST'])
@require_auth
def create_sprint():
    try:
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        
        track_user_action('create_sprint', {'team_id': team_id}, team_id)
        
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
        
        # Initialize analytics
        sprint_data['analytics'] = {
            'total_story_points': 0,
            'completed_story_points': 0,
            'completion_percentage': 0,
            'task_counts': {'todo': 0, 'in_progress': 0, 'done': 0},
            'total_tasks': 0
        }
        
        return jsonify({'success': True, 'sprint': sprint_data})
    except Exception as e:
        print(f"Error creating sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create sprint'}), 500

# ===== RETROSPECTIVE ROUTES =====

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
        
        track_user_action('create_retrospective', {'team_id': team_id}, team_id)
        
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
        
        # Save retrospective
        doc_ref = db.collection('retrospectives').add(retro_data)
        retro_id = doc_ref[1].id
        
        return jsonify({
            'success': True,
            'retrospective_id': retro_id,
            'message': 'Retrospective created successfully'
        })
        
    except Exception as e:
        print(f"Error creating retrospective: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create retrospective'}), 500

# ===== HEALTH AND UTILITY ROUTES =====

@app.route('/health', methods=['GET'])
def railway_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend-api'})

@app.route('/cors-test', methods=['GET', 'OPTIONS'])
def cors_test():
    return jsonify({
        'message': 'CORS test successful',
        'allowed_origins': allowed_origins,
        'request_origin': request.headers.get('Origin', 'No origin header')
    })

# ===== ERROR HANDLERS =====

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(403)
def forbidden(error):
    return jsonify({'error': 'Access forbidden'}), 403

@app.errorhandler(401)
def unauthorized(error):
    return jsonify({'error': 'Unauthorized access'}), 401

# ===== WEBSOCKET EVENTS =====

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    emit('connected', {'message': 'Successfully connected to Upstand backend'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on('join_team')
def handle_join_team(data):
    team_id = data.get('team_id')
    company_id = data.get('company_id')
    if team_id and company_id:
        room = f"team_{company_id}_{team_id}"
        join_room(room)
        print(f"Client {request.sid} joined team room: {room}")
        emit('team_joined', {'team_id': team_id, 'room': room})

@socketio.on('leave_team')
def handle_leave_team(data):
    team_id = data.get('team_id')
    company_id = data.get('company_id')
    if team_id and company_id:
        room = f"team_{company_id}_{team_id}"
        leave_room(room)
        print(f"Client {request.sid} left team room: {room}")

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '0.0.0.0')
    
    print(f"Starting Upstand server on {host}:{port}")
    print(f"Debug mode: {debug_mode}")
    print(f"Allowed origins: {allowed_origins}")
    print(f"Firebase status: {'Connected' if db else 'Not connected'}")
    print(f"WebSocket support: Enabled")
    print(f"Analytics: Enabled")
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)