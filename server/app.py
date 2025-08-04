import os
import json
import time
import threading
import traceback
import statistics
from datetime import datetime, timedelta
from functools import wraps
from collections import defaultdict, Counter

# Flask imports
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect

# Firebase imports
import firebase_admin
from firebase_admin import credentials, firestore, auth
from google.oauth2 import service_account

# Third-party imports
from dotenv import load_dotenv
import openai

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-12345')

# Get allowed origins from environment with fallback to hardcoded values
env_origins = os.getenv('ALLOWED_ORIGINS', '')
if env_origins:
    allowed_origins = [origin.strip() for origin in env_origins.split(',')]
else:
    allowed_origins = ['http://localhost:3000']

# Add common deployment URLs
# Get allowed origins from environment with fallback to hardcoded values
allowed_origins_env = os.getenv('ALLOWED_ORIGINS', '')
if allowed_origins_env:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(',')]
else:
    # Hardcoded fallback for production
    allowed_origins = [
        'http://localhost:3000',
        'https://upstand-omega.vercel.app',
        'https://upstand-git-main-minsung1kims-projects.vercel.app',
        'https://upstand-cytbctct3-minsung1kims-projects.vercel.app'
    ]

print(f"ALLOWED_ORIGINS env var: {os.getenv('ALLOWED_ORIGINS')}")
print(f"Final allowed_origins: {allowed_origins}")

CORS(app, 
     origins=allowed_origins,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Company-ID', 'Access-Control-Allow-Origin'],
     supports_credentials=True,
     expose_headers=['Content-Type', 'Authorization'],
     max_age=3600)

socketio = SocketIO(app,
                   cors_allowed_origins=allowed_origins,
                   logger=True,
                   engineio_logger=True,
                   ping_timeout=60,
                   ping_interval=25,
                   async_mode='threading',
                   transports=['websocket', 'polling'])

# Initialize global database variable
db = None

def get_company_id():
    company_id = request.headers.get('X-Company-ID')
    if not company_id:
        return jsonify({'error': 'Company ID required'}), 400
    return company_id

def init_firestore():
    """Initialize Firestore with proper error handling"""
    global db
    try:
        # Try to get service account key from environment variable
        service_account_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
        
        if service_account_key:
            # If it's a file path
            if service_account_key.startswith('./') or service_account_key.startswith('/'):
                credentials_obj = service_account.Credentials.from_service_account_file(service_account_key)
                db = firestore.Client(credentials=credentials_obj)
                print("✅ Firestore initialized successfully with service account file")
            else:
                # If it's JSON string
                service_account_info = json.loads(service_account_key)
                credentials_obj = service_account.Credentials.from_service_account_info(service_account_info)
                db = firestore.Client(credentials=credentials_obj)
                print("✅ Firestore initialized successfully with service account JSON")
        else:
            print("❌ No Firebase service account key found in environment")
            db = None
            return False
            
        # Test the connection
        test_collection = db.collection('test')
        test_doc = test_collection.document('connection_test')
        test_doc.set({'test': True, 'timestamp': datetime.utcnow()})
        print("✅ Firestore connection test successful")
        
        return True
    except Exception as e:
        print(f"❌ Failed to initialize Firestore: {str(e)}")
        traceback.print_exc()
        db = None
        return False

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        try:
            response = make_response('', 200)
            origin = request.headers.get('Origin')
            if origin in allowed_origins:
                response.headers.add("Access-Control-Allow-Origin", origin)
            response.headers.add('Access-Control-Allow-Headers', "Content-Type,Authorization,X-Company-ID")
            response.headers.add('Access-Control-Allow-Methods', "GET,PUT,POST,DELETE,OPTIONS")
            response.headers.add('Access-Control-Allow-Credentials', "true")
            response.headers.add('Access-Control-Max-Age', "3600")
            return response
        except Exception as e:
            print(f"OPTIONS handler error: {e}")
            return make_response('', 500)

# Initialize Firebase Admin SDK first
firebase_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
if firebase_key:
    try:
        if firebase_key.startswith('{'):
            firebase_config = json.loads(firebase_key)
            cred = credentials.Certificate(firebase_config)
        else:
            cred = credentials.Certificate(firebase_key)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized successfully")
    except Exception as e:
        print(f"❌ Firebase Admin SDK initialization error: {e}")

# Initialize Firestore
firestore_initialized = init_firestore()

# Initialize OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')

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
    """Authentication decorator for protected routes"""
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
            request.user_name = decoded_token.get('name', '')
            request.user_email = decoded_token.get('email', '')
            request.company_id = request.headers.get('X-Company-ID', 'default')
        except Exception as e:
            return jsonify({'error': 'Invalid authorization token', 'details': str(e)}), 401
        return f(*args, **kwargs)
    return decorated_function

def detect_blockers(text):
    """Enhanced blocker detection with severity levels"""
    if not text:
        return {'has_blockers': False, 'blockers': [], 'severity': 'none', 'blocker_count': 0}
    
    text_lower = text.lower()
    
    blocker_keywords = {
        'high': ['blocked', 'blocker', 'urgent', 'critical', 'stuck', 'cannot proceed', 'show stopper', 'dependency', 'waiting for'],
        'medium': ['issue', 'problem', 'difficulty', 'challenge', 'concern', 'impediment', 'delay', 'slow'],
        'low': ['minor', 'small issue', 'question', 'clarification needed', 'help needed']
    }
    
    detected_blockers = []
    severity = 'none'
    
    for sev_level, keywords in blocker_keywords.items():
        for keyword in keywords:
            if keyword in text_lower:
                detected_blockers.append({
                    'keyword': keyword,
                    'severity': sev_level,
                    'context': text[:100] + '...' if len(text) > 100 else text
                })
                if sev_level == 'high':
                    severity = 'high'
                elif sev_level == 'medium' and severity != 'high':
                    severity = 'medium'
                elif severity == 'none':
                    severity = 'low'
    
    return {
        'has_blockers': len(detected_blockers) > 0,
        'blockers': detected_blockers,
        'severity': severity,
        'blocker_count': len(detected_blockers)
    }

def analyze_sentiment(text):
    """Enhanced sentiment analysis with confidence scores"""
    positive_words = ['good', 'great', 'excellent', 'finished', 'completed', 'success', 'happy', 'excited', 'progress', 
                     'amazing', 'awesome', 'fantastic', 'wonderful', 'perfect', 'brilliant', 'outstanding', 'effective',
                     'smooth', 'easy', 'helpful', 'productive', 'efficient', 'satisfied', 'pleased', 'thrilled', 'love',
                     'enjoy', 'accomplished', 'achieved', 'delivered', 'resolved', 'fixed', 'improved', 'optimized']
    
    negative_words = ['bad', 'terrible', 'stuck', 'blocked', 'failed', 'problem', 'frustrated', 'delayed', 'difficult',
                     'sad', 'stupid', 'awful', 'horrible', 'disappointing', 'annoying', 'annoyed', 'angry', 'upset',
                     'worried', 'concerned', 'stressed', 'overwhelmed', 'confused', 'lost', 'struggling', 'issues',
                     'broken', 'bugs', 'errors', 'challenges', 'obstacles', 'setbacks', 'roadblocks', 'impediments',
                     'slow', 'sluggish', 'inefficient', 'waste', 'wasted', 'useless', 'pointless', 'meaningless',
                     'disaster', 'mess', 'chaos', 'nightmare', 'crash', 'fail', 'failure', 'wrong', 'incorrect',
                     'hate', 'dislike', 'regret', 'mistake', 'error', 'fault', 'blame', 'critical', 'urgent', 'crisis']
    
    neutral_words = ['working', 'continuing', 'planned', 'meeting', 'discussing', 'reviewing', 'analyzing', 'testing',
                    'developing', 'coding', 'implementing', 'designing', 'researching', 'investigating', 'exploring',
                    'considering', 'evaluating', 'assessing', 'monitoring', 'tracking', 'updating', 'preparing']
    
    if not text:
        return {'sentiment': 'neutral', 'confidence': 0.0, 'explanation': 'No text provided'}
    
    text_lower = text.lower()
    words = text_lower.split()
    
    positive_count = sum(1 for word in words if word in positive_words)
    negative_count = sum(1 for word in words if word in negative_words)
    neutral_count = sum(1 for word in words if word in neutral_words)
    
    total_sentiment_words = positive_count + negative_count + neutral_count
    
    if total_sentiment_words == 0:
        return {'sentiment': 'neutral', 'confidence': 0.3, 'explanation': 'No sentiment indicators found'}
    
    # Calculate sentiment based on word counts
    if positive_count > negative_count:
        sentiment = 'positive'
        confidence = min(0.9, 0.5 + (positive_count - negative_count) / len(words))
    elif negative_count > positive_count:
        sentiment = 'negative'
        confidence = min(0.9, 0.5 + (negative_count - positive_count) / len(words))
    else:
        sentiment = 'neutral'
        confidence = min(0.8, 0.4 + neutral_count / len(words))
    
    return {
        'sentiment': sentiment,
        'confidence': round(confidence, 2),
        'explanation': f'Found {positive_count} positive, {negative_count} negative, {neutral_count} neutral indicators'
    }

def generate_team_summary(standups, team_info=None):
    """Generate AI-powered team summary using OpenAI"""
    try:
        if not standups or not os.getenv('OPENAI_API_KEY'):
            return "Team summary unavailable"
        
        # Prepare standup data for AI analysis
        standup_texts = []
        for standup in standups:
            entry = f"Team member update:\n"
            entry += f"Yesterday: {standup.get('yesterday', 'Not specified')}\n"
            entry += f"Today: {standup.get('today', 'Not specified')}\n"
            entry += f"Blockers: {standup.get('blockers', 'None')}\n\n"
            standup_texts.append(entry)
        
        combined_text = "\n".join(standup_texts)
        
        prompt = f"""
        Analyze the following team standups and provide a concise summary (2-3 sentences) focusing on:
        1. Overall team progress and momentum
        2. Key achievements or completed work
        3. Major blockers or challenges that need attention
        4. Team sentiment and morale
        
        Standups:
        {combined_text}
        
        Provide a professional, actionable summary suitable for managers:
        """
        
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.3
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        print(f"Error generating team summary: {e}")
        return f"Team completed {len(standups)} standups today. Check individual updates for details."

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
        print(f"Client {request.sid} joined team room: {room}")
        emit('team_joined', {'team_id': team_id, 'room': room})

@socketio.on('leave_team')
def handle_leave_team(data):
    team_id = data.get('team_id')
    company_id = data.get('company_id', 'default')
    if team_id and company_id:
        room = f"team_{company_id}_{team_id}"
        leave_room(room)
        print(f"Client {request.sid} left team room: {room}")
        emit('status', {'msg': f'Left team {team_id}'})

@socketio.on('join_analytics')
def handle_join_analytics(data):
    company_id = data.get('company_id', 'default')
    room = f"analytics_{company_id}"
    join_room(room)
    emit('status', {'msg': f'Joined analytics room for company {company_id}'})

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

# ===== HEALTH AND UTILITY ROUTES =====
@app.route('/health', methods=['GET'])
def railway_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

@app.route('/api/health', methods=['GET'])
def api_health():
    firebase_status = 'connected' if db is not None else 'disconnected'
    openai_status = 'configured' if os.getenv('OPENAI_API_KEY') else 'not configured'
    return jsonify({
        'status': 'healthy' if firebase_status == 'connected' else 'degraded',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'firebase': firebase_status,
            'openai': openai_status,
            'websocket': 'enabled',
            'analytics': 'enabled'
        }
    })

@app.route('/debug/routes', methods=['GET'])
def list_routes():
    """Debug endpoint to list all available routes"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods),
            'rule': str(rule)
        })
    return jsonify({'routes': routes, 'total': len(routes)})

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Simple test endpoint to verify API is working"""
    return jsonify({'message': 'API is working', 'timestamp': datetime.utcnow().isoformat()})

@app.route('/cors-test', methods=['GET', 'OPTIONS'])
def cors_test():
    return jsonify({
        'message': 'CORS test successful',
        'allowed_origins': allowed_origins,
        'request_origin': request.headers.get('Origin', 'No origin header')
    })

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
        
        # Check if user is the owner
        if team_data.get('owner_id') != user_id:
            return jsonify({
                'success': False,
                'error': 'Only team owner can delete team'
            }), 403
        
        # Delete the team
        team_ref.delete()
        
        track_user_action('delete_team', {'team_id': team_id})
        
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
    
# ===== STANDUP ROUTES =====
@app.route('/api/standups', methods=['POST'])
@require_auth
def submit_standup():
    """Submit a daily standup"""
    try:
        user_id = request.user_id
        user_email = request.user_email
        company_id = request.company_id
        
        data = request.get_json()
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('submit_standup', {'team_id': team_id}, team_id)
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        today = datetime.utcnow().strftime('%Y-%m-%d')
        
        # Enhanced AI analysis
        yesterday_text = data.get('yesterday', '')
        today_text = data.get('today', '')
        blockers_text = data.get('blockers', '')
        
        # Analyze text for insights
        blocker_analysis = detect_blockers(blockers_text)
        sentiment_analysis = analyze_sentiment(f"{yesterday_text} {today_text}")
        
        standup_data = {
            'user_id': user_id,
            'user_email': user_email,
            'user_name': getattr(request, 'user_name', ''),
            'team_id': team_id,
            'company_id': company_id,
            'date': today,
            'yesterday': yesterday_text,
            'today': today_text,
            'blockers': blockers_text,
            'blocker_analysis': blocker_analysis,
            'mood': data.get('mood', 5), 
            'sentiment_analysis': sentiment_analysis,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Save to Firestore
        db.collection('standups').add(standup_data)
        room = f"team_{company_id}_{team_id}"
        socketio.emit('standup_update', {
            'type': 'new_standup',
            'standup': standup_data
        }, room=room)
        
        # Get all today's standups for team summary
        today_standups = db.collection('standups').where('team_id', '==', team_id)\
                           .where('company_id', '==', company_id)\
                           .where('date', '==', today).get()

        standup_entries = []
        for doc in today_standups:
            entry = doc.to_dict()
            standup_entries.append(entry)
        
        # Generate team summary
        team_summary = generate_team_summary(standup_entries)
        
        # Emit real-time update
        socketio.emit('standup_submitted', {
            'user_email': user_email,
            'team_id': team_id,
            'sentiment': sentiment_analysis,
            'has_blockers': blocker_analysis.get('has_blockers', False)
        }, room=f"team_{company_id}_{team_id}")
        
        return jsonify({
            'success': True,
            'message': 'Standup submitted successfully',
            'blocker_analysis': blocker_analysis,
            'sentiment': sentiment_analysis,
            'team_summary': team_summary,
            'team_standup_count': len(standup_entries)
        })
        
    except Exception as e:
        print(f"Error submitting standup: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/standups', methods=['GET'])
@require_auth
def get_standups():
    """Get standups for a team"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_standups', {'team_id': team_id}, team_id)
        
        # Get last 7 days of standups
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=7)
        
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))\
                          .order_by('date', direction=firestore.Query.DESCENDING)
        
        standups = list(query.stream())
        
        standup_list = []
        for standup in standups:
            standup_data = standup.to_dict()
            standup_data['id'] = standup.id
            standup_data['time'] = 'recently'  # Simple time display
            standup_list.append(standup_data)
        
        return jsonify({'success': True, 'standups': standup_list})
        
    except Exception as e:
        print(f"Error fetching standups: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch standups'}), 500

# ===== DASHBOARD ROUTES =====
@app.route('/api/dashboard', methods=['GET'])
@require_auth
def get_dashboard():
    """Get enhanced dashboard data for current user in current company"""
    try:
        user_id = request.user_id
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_dashboard', {'team_id': team_id}, team_id)
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Get today's date
        today = datetime.utcnow().strftime('%Y-%m-%d')
        
        # Get today's standups for the team in current company
        team_standups = db.collection('standups').where('team_id', '==', team_id)\
                         .where('company_id', '==', company_id)\
                         .where('date', '==', today).get()
        
        standup_count = len(list(team_standups))
        
        # Enhanced analysis of standups
        team_summary = ""
        sentiment_data = {'positive': 0, 'neutral': 0, 'negative': 0}
        active_blockers = []
        blocker_severity_counts = {'high': 0, 'medium': 0, 'low': 0}
        
        if standup_count > 0:
            standup_entries = []
            all_sentiments = []
            
            for doc in team_standups:
                entry = doc.to_dict()
                standup_entries.append({
                    'user': entry.get('user_email', 'Unknown'),
                    'yesterday': entry.get('yesterday', ''),
                    'today': entry.get('today', ''),
                    'blockers': entry.get('blockers', '')
                })
                
                # Collect enhanced blocker data
                blocker_analysis = entry.get('blocker_analysis', {})
                if blocker_analysis.get('has_blockers'):
                    severity = blocker_analysis.get('severity', 'low')
                    blocker_severity_counts[severity] += 1
                    
                    for blocker in blocker_analysis.get('blockers', []):
                        active_blockers.append({
                            'user': entry.get('user_email', 'Unknown'),
                            'text': blocker.get('context', ''),
                            'severity': blocker.get('severity', 'low'),
                            'keyword': blocker.get('keyword', '')
                        })
                
                # Collect sentiment data  
                sentiment_analysis = entry.get('sentiment_analysis', {})
                sentiment = sentiment_analysis.get('sentiment', 'neutral')
                all_sentiments.append(sentiment)
                if sentiment in sentiment_data:
                    sentiment_data[sentiment] += 1
            
            # Generate team summary
            team_summary = generate_team_summary(standup_entries)
        
        # Calculate sentiment percentages
        total_sentiments = sum(sentiment_data.values())
        sentiment_percentages = {}
        for sentiment, count in sentiment_data.items():
            sentiment_percentages[sentiment] = round((count / total_sentiments * 100), 1) if total_sentiments > 0 else 0
        
        # Get recent retrospectives
        recent_retros = []
        try:
            retros_ref = db.collection('retrospectives')
            retros_query = retros_ref.where('team_id', '==', team_id)\
                                   .where('company_id', '==', company_id)\
                                   .order_by('created_at', direction=firestore.Query.DESCENDING)\
                                   .limit(3)
            for retro in retros_query.stream():
                retro_data = retro.to_dict()
                recent_retros.append({
                    'id': retro.id,
                    'sprint_name': retro_data.get('sprint_name', 'Sprint Retrospective'),
                    'created_at': retro_data.get('created_at'),
                    'action_items_count': len(retro_data.get('action_items', []))
                })
        except Exception as e:
            print(f"Error fetching retrospectives: {e}")
        
        # Get recent standups for history
        recent_standups = []
        try:
            week_ago = (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')
            recent_standups_query = db.collection('standups')\
                                    .where('team_id', '==', team_id)\
                                    .where('company_id', '==', company_id)\
                                    .where('date', '>=', week_ago)\
                                    .order_by('date', direction=firestore.Query.DESCENDING)\
                                    .limit(10)
            
            for standup in recent_standups_query.stream():
                standup_data = standup.to_dict()
                recent_standups.append({
                'user': standup_data.get('user_email', 'Unknown'),
                'user_name': standup_data.get('user_name', standup_data.get('user_email', 'Unknown')),
                'date': standup_data.get('date'),
                'yesterday': standup_data.get('yesterday', ''),
                'today': standup_data.get('today', ''),
                'blockers': standup_data.get('blockers', ''),
                'sentiment': standup_data.get('sentiment_analysis', {}).get('sentiment', 'neutral'),
                'has_blockers': standup_data.get('blocker_analysis', {}).get('has_blockers', False)
            })
        except Exception as e:
            print(f"Error fetching recent standups: {e}")
        
        # Get velocity and completion metrics
        velocity_data = {'velocity': 0, 'trend': 'unknown'}
        completion_data = {'completion_rate': 0, 'total_tasks': 0}
        
        try:
            # Get last completed sprint for velocity
            sprints_ref = db.collection('sprints')
            completed_sprints = sprints_ref.where('team_id', '==', team_id)\
                                         .where('company_id', '==', company_id)\
                                         .where('status', '==', 'completed')\
                                         .order_by('completed_at', direction=firestore.Query.DESCENDING)\
                                         .limit(2).stream()
            
            completed_sprints_list = list(completed_sprints)
            if completed_sprints_list:
                latest_sprint = completed_sprints_list[0].to_dict()
                velocity_data['velocity'] = latest_sprint.get('final_analytics', {}).get('velocity', 0)
                
                # Calculate trend if we have multiple sprints
                if len(completed_sprints_list) > 1:
                    previous_sprint = completed_sprints_list[1].to_dict()
                    prev_velocity = previous_sprint.get('final_analytics', {}).get('velocity', 0)
                    current_velocity = velocity_data['velocity']
                    
                    if current_velocity > prev_velocity:
                        velocity_data['trend'] = 'up'
                    elif current_velocity < prev_velocity:
                        velocity_data['trend'] = 'down'
                    else:
                        velocity_data['trend'] = 'stable'
            
            # Get current week task completion
            week_start = datetime.utcnow() - timedelta(days=7)
            week_tasks = db.collection('tasks')\
                          .where('company_id', '==', company_id)\
                          .where('created_at', '>=', week_start.strftime('%Y-%m-%d'))\
                          .stream()
            
            total_tasks = 0
            completed_tasks = 0
            for task in week_tasks:
                task_data = task.to_dict()
                # Check if task belongs to team's sprint
                sprint_id = task_data.get('sprint_id')
                if sprint_id:
                    sprint_ref = db.collection('sprints').document(sprint_id)
                    sprint_doc = sprint_ref.get()
                    if sprint_doc.exists and sprint_doc.to_dict().get('team_id') == team_id:
                        total_tasks += 1
                        if task_data.get('status') == 'done':
                            completed_tasks += 1
            
            completion_data = {
                'completion_rate': round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0,
                'total_tasks': total_tasks
            }
            
        except Exception as e:
            print(f"Error calculating metrics: {e}")
        
        # Get active sprint
        active_sprint = None
        try:
            active_sprint_query = db.collection('sprints')\
                                   .where('team_id', '==', team_id)\
                                   .where('company_id', '==', company_id)\
                                   .where('status', '==', 'active')\
                                   .limit(1)
            
            for sprint in active_sprint_query.stream():
                sprint_data = sprint.to_dict()
                
                # Get tasks for progress calculation
                tasks_query = db.collection('tasks').where('sprint_id', '==', sprint.id)
                tasks = list(tasks_query.stream())
                
                total_tasks = len(tasks)
                completed_tasks = sum(1 for task in tasks if task.to_dict().get('status') == 'done')
                
                active_sprint = {
                    'id': sprint.id,
                    'name': sprint_data.get('name', 'Current Sprint'),
                    'start_date': sprint_data.get('start_date'),
                    'end_date': sprint_data.get('end_date'),
                    'total_tasks': total_tasks,
                    'completed_tasks': completed_tasks,
                    'progress': round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0
                }
        except Exception as e:
            print(f"Error fetching active sprint: {e}")
            active_sprint = None
        
        dashboard_data = {
            'standup_count': standup_count, 
            'team_summary': team_summary,
            'active_sprint': active_sprint,
            'recent_standups': recent_standups,
            'recent_retros': recent_retros,
            'sentiment_analysis': {
                'distribution': sentiment_data,
                'percentages': sentiment_percentages,
                'dominant_sentiment': max(sentiment_data.items(), key=lambda x: x[1])[0] if total_sentiments > 0 else 'neutral'
            },
            'blocker_analysis': {
                'active_blockers': active_blockers[:5],  # Show top 5
                'severity_counts': blocker_severity_counts,
                'total_blockers': len(active_blockers)
            },
            'quick_metrics': {
                'sprint_velocity': velocity_data.get('velocity', 0),
                'velocity_trend': velocity_data.get('trend', 'unknown'),
                'completion_rate': completion_data.get('completion_rate', 0),
                'total_tasks_week': completion_data.get('total_tasks', 0)
            }
        }
        
        return jsonify({
            'success': True,
            'dashboard': dashboard_data
        })
        
    except Exception as e:
        print(f"Error fetching dashboard data: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Failed to fetch dashboard data'
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
                if status in task_status_counts:
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
            comments_query = comments_ref.where('sprint_id', '==', sprint.id)\
                                       .order_by('created_at', direction=firestore.Query.DESCENDING)
            comments = list(comments_query.stream())
            
            sprint_data['comments'] = []
            for comment in comments:
                comment_data = comment.to_dict()
                comment_data['id'] = comment.id
                comment_data['time'] = 'recently'  # Simple time display
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
        # Check database connection first
        global db
        if not db:
            print("❌ Database connection not available, reinitializing...")
            firestore_initialized = init_firestore()
            if not firestore_initialized:
                return jsonify({'success': False, 'error': 'Database connection failed'}), 503
            
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        
        print(f"🚀 Creating sprint for team_id: {team_id}, company_id: {company_id}")
        print(f"📝 Received data: {data}")
        
        # Validate required fields (frontend sends startDate/endDate)
        if not all([team_id, data.get('name'), data.get('startDate'), data.get('endDate')]):
            print("❌ Missing required fields")
            return jsonify({'success': False, 'error': 'Missing required fields: team_id, name, startDate, endDate'}), 400
        
        track_user_action('create_sprint', {'team_id': team_id}, team_id)
        
        sprint_data = {
            'team_id': team_id,
            'company_id': company_id,
            'name': data.get('name'),
            'start_date': data.get('startDate'),  # Frontend sends startDate
            'end_date': data.get('endDate'),      # Frontend sends endDate
            'goals': data.get('goals', []),
            'description': data.get('description', ''),
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }
        
        print(f"💾 Sprint data to save: {sprint_data}")
        
        # Save to Firestore
        try:
            print("📤 Adding sprint to Firestore...")
            doc_ref = db.collection('sprints').add(sprint_data)
            sprint_id = doc_ref[1].id
            sprint_data['id'] = sprint_id
            print(f"✅ Sprint created successfully with id: {sprint_id}")
            
            # Verify the document was actually saved
            saved_doc = db.collection('sprints').document(sprint_id).get()
            if saved_doc.exists:
                print(f"✅ Verified sprint exists in database")
            else:
                print(f"❌ Sprint not found in database after creation!")
                
            # Initialize analytics
            sprint_data['analytics'] = {
                'total_story_points': 0,
                'completed_story_points': 0,
                'completion_percentage': 0,
                'task_counts': {'todo': 0, 'in_progress': 0, 'done': 0},
                'total_tasks': 0
            }
            
            # Broadcast real-time update
            try:
                socketio.emit('sprint_created', {
                    'sprint': sprint_data,
                    'team_id': team_id
                }, room=f"team_{company_id}_{team_id}")
            except Exception as socket_error:
                print(f"Socket emit error: {socket_error}")
                # Don't fail the request if socket fails
            
            return jsonify({'success': True, 'sprint': sprint_data})
            
        except Exception as firestore_error:
            print(f"💥 Firestore error: {str(firestore_error)}")
            traceback.print_exc()
            return jsonify({'success': False, 'error': f'Database save failed: {str(firestore_error)}'}), 500
            
    except Exception as e:
        print(f"💥 Sprint creation error: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to create sprint'}), 500

@app.route('/api/sprints/<sprint_id>/complete', methods=['POST'])
@require_auth
def complete_sprint(sprint_id):
    """Mark sprint as completed and calculate final analytics"""
    try:
        # Check database connection
        if not db:
            print("Database connection not available")
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        print(f"Completing sprint: {sprint_id}")
        
        track_user_action('complete_sprint', {'sprint_id': sprint_id})
        
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        
        if not sprint_doc.exists:
            print(f"Sprint {sprint_id} not found")
            return jsonify({'error': 'Sprint not found'}), 404
        
        sprint_data = sprint_doc.to_dict()
        print(f"Completing sprint: {sprint_data.get('name', 'Unnamed')}")
        
        # Calculate final sprint metrics
        tasks_ref = db.collection('tasks')
        tasks_query = tasks_ref.where('sprint_id', '==', sprint_id)
        tasks = list(tasks_query.stream())
        
        print(f"Found {len(tasks)} tasks for sprint")
        
        total_story_points = 0
        completed_story_points = 0
        task_status_counts = {'todo': 0, 'in_progress': 0, 'done': 0}
        
        for task in tasks:
            task_data = task.to_dict()
            story_points = task_data.get('estimate', 1)
            status = task_data.get('status', 'todo')
            
            total_story_points += story_points
            if status in task_status_counts:
                task_status_counts[status] += 1
            
            if status == 'done':
                completed_story_points += story_points
        
        completion_percentage = (completed_story_points / total_story_points * 100) if total_story_points > 0 else 0
        
        print(f"Sprint metrics: {completed_story_points}/{total_story_points} points ({completion_percentage:.1f}%)")
        
        # Update sprint with completion data
        update_data = {
            'status': 'completed',
            'completed_at': datetime.utcnow().isoformat(),
            'final_analytics': {
                'total_story_points': total_story_points,
                'completed_story_points': completed_story_points,
                'completion_percentage': round(completion_percentage, 1),
                'task_counts': task_status_counts,
                'total_tasks': len(tasks),
                'velocity': completed_story_points
            }
        }
        
        sprint_ref.update(update_data)
        print(f"Sprint {sprint_id} marked as completed")
        
        return jsonify({
            'success': True, 
            'message': 'Sprint completed successfully',
            'final_analytics': update_data['final_analytics']
        })
        
    except Exception as e:
        print(f"Error completing sprint: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to complete sprint'}), 500

@app.route('/api/submit-standup', methods=['POST'])
@require_auth
def submit_standup_alt():
    """Alternative endpoint for standup submission"""
    return submit_standup()
# ===== TASK ROUTES =====
@app.route('/api/tasks', methods=['POST'])
@require_auth
def create_task():
    try:
        data = request.json
        company_id = request.company_id
        
        track_user_action('create_task', {'sprint_id': data.get('sprint_id')})
        
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
        
        track_user_action('update_task', {'task_id': task_id, 'new_status': data.get('status')})
        
        task_ref = db.collection('tasks').document(task_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({'error': 'Task not found'}), 404
        
        update_data = {
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Track status changes for analytics
        old_task_data = task_doc.to_dict()
        old_status = old_task_data.get('status')
        new_status = data.get('status')
        
        # Update allowed fields
        allowed_fields = ['title', 'assignee', 'status', 'estimate']
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        task_ref.update(update_data)
        
        # Get updated task data
        updated_task = task_ref.get().to_dict()
        updated_task['id'] = task_id
        
        # Emit real-time update
        socketio.emit('task_updated', {
            'task': updated_task,
            'sprint_id': updated_task['sprint_id'],
            'status_change': {
                'old_status': old_status,
                'new_status': new_status
            }
        }, room=f'sprint_{updated_task["sprint_id"]}')
        
        return jsonify({'success': True, 'task': updated_task})
    except Exception as e:
        print(f"Error updating task: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update task'}), 500

@app.route('/api/teams/<team_id>/role', methods=['PUT'])
@require_auth
def update_team_member_role(team_id):
    """Update a team member's role"""
    try:
        user_id = request.user_id
        data = request.get_json()
        target_member_id = data.get('member_id')
        new_role = data.get('role')
        
        if not target_member_id or not new_role:
            return jsonify({'error': 'member_id and role are required'}), 400
        
        if new_role not in ['OWNER', 'MANAGER', 'DEVELOPER']:
            return jsonify({'error': 'Invalid role'}), 400
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user has permission (owner or manager)
        user_role = team_data.get('member_roles', {}).get(user_id, 'DEVELOPER')
        if user_role not in ['OWNER', 'MANAGER']:
            return jsonify({'error': 'Permission denied'}), 403
        
        # Update member role
        team_ref.update({
            f'member_roles.{target_member_id}': new_role,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Role updated successfully'
        })
        
    except Exception as e:
        print(f"Error updating member role: {str(e)}")
        return jsonify({'error': 'Failed to update role'}), 500

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
        
        track_user_action('delete_task', {'task_id': task_id, 'sprint_id': sprint_id})
        
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

# ===== COMMENT ROUTES =====
@app.route('/api/sprints/<sprint_id>/comments', methods=['POST'])
@require_auth
def add_sprint_comment(sprint_id):
    try:
        # Check database connection
        if not db:
            print("Database connection not available")
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        data = request.json
        company_id = request.company_id
        
        print(f"Adding comment to sprint_id: {sprint_id}, company_id: {company_id}")
        
        track_user_action('add_comment', {'sprint_id': sprint_id})
        
        comment_data = {
            'sprint_id': sprint_id,
            'company_id': company_id,
            'author': data.get('author', 'Anonymous'),
            'text': data.get('text'),
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat()
        }
        
        print(f"Comment data: {comment_data}")
        
        if not comment_data['text']:
            print("Comment text is required")
            return jsonify({'error': 'Comment text is required'}), 400
        
        print("Adding comment to database...")
        doc_ref = db.collection('sprint_comments').add(comment_data)
        comment_data['id'] = doc_ref[1].id
        comment_data['time'] = 'just now'  # For UI compatibility
        
        print(f"Comment created with id: {comment_data['id']}")
        
        # Emit real-time update
        try:
            socketio.emit('comment_added', {
                'comment': comment_data,
                'sprint_id': sprint_id
            }, room=f'sprint_{sprint_id}')
        except Exception as socket_error:
            print(f"Socket emit error: {socket_error}")
            # Don't fail the request if socket fails
        
        return jsonify({'success': True, 'comment': comment_data})
    except Exception as e:
        print(f"Error adding comment: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to add comment'}), 500

@app.route('/api/sprints/<sprint_id>/comments', methods=['GET'])
@require_auth
def get_sprint_comments(sprint_id):
    try:
        track_user_action('view_comments', {'sprint_id': sprint_id})
        
        comments_ref = db.collection('sprint_comments')
        query = comments_ref.where('sprint_id', '==', sprint_id)\
                          .order_by('created_at', direction=firestore.Query.DESCENDING)
        comments = query.stream()
        
        comment_list = []
        for comment in comments:
            comment_data = comment.to_dict()
            comment_data['id'] = comment.id
            comment_data['time'] = 'recently'  # Simple time display
            comment_list.append(comment_data)
        
        return jsonify({'success': True, 'comments': comment_list})
    except Exception as e:
        print(f"Error fetching comments: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch comments'}), 500

# ===== RETROSPECTIVE ROUTES =====

@app.route('/api/retrospectives', methods=['GET'])
@require_auth
def get_retrospectives():
    """Get retrospectives for a team"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_retrospectives', {'team_id': team_id}, team_id)
        
        retros_ref = db.collection('retrospectives')
        query = retros_ref.where('team_id', '==', team_id)\
                         .where('company_id', '==', company_id)\
                         .order_by('created_at', direction=firestore.Query.DESCENDING)\
                         .limit(10)
        
        retros = query.stream()
        
        retro_list = []
        for retro in retros:
            retro_data = retro.to_dict()
            retro_data['id'] = retro.id
            retro_list.append(retro_data)
        
        return jsonify({'success': True, 'retrospectives': retro_list})
        
    except Exception as e:
        print(f"Error fetching retrospectives: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch retrospectives'}), 500

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
            'created_at': datetime.utcnow().isoformat()
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
    
@app.route('/api/retrospective-feedback', methods=['POST'])
@require_auth
def submit_retrospective_feedback():
    """Submit retrospective feedback with AI analysis"""
    try:
        # Check database connection
        if not db:
            print("Database connection not available")
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        data = request.get_json()
        company_id = request.company_id
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('submit_retrospective_feedback', {'team_id': team_id}, team_id)
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Use ISO timestamp instead of SERVER_TIMESTAMP for WebSocket compatibility
        current_time = datetime.utcnow().isoformat()
        
        feedback_data = {
            'team_id': team_id,
            'company_id': company_id,
            'category': data.get('category'),  # went_well, could_improve, action_items
            'feedback': data.get('feedback'),
            'anonymous': data.get('anonymous', True),
            'created_by': request.user_id if not data.get('anonymous') else None,
            'created_at': current_time
        }
        
        # Basic AI analysis for the feedback
        feedback_text = feedback_data['feedback']
        category = feedback_data['category']
        
        analysis = {
            'themes': [{
                'title': f"{category.replace('_', ' ').title()} Feedback",
                'sentiment': 'positive' if category == 'went_well' else 'neutral' if category == 'action_items' else 'negative',
                'items': [feedback_text],
                'actionable': category == 'action_items' or 'should' in feedback_text.lower()
            }],
            'overall_sentiment': f"Team member provided {category.replace('_', ' ')} feedback",
            'suggested_actions': [f"Review and discuss: {feedback_text[:50]}..."] if len(feedback_text) > 50 else [f"Review: {feedback_text}"]
        }
        
        # Save to Firestore
        doc_ref = db.collection('retrospective_feedback').add(feedback_data)
        feedback_id = doc_ref[1].id
        
        print(f"✅ Retrospective feedback saved with ID: {feedback_id}")
        
        # Emit real-time update
        try:
            socketio.emit('retrospective_feedback_added', {
                'feedback_id': feedback_id,
                'team_id': team_id,
                'category': category,
                'anonymous': feedback_data['anonymous']
            }, room=f"team_{company_id}_{team_id}")
        except Exception as socket_error:
            print(f"Socket emit error: {socket_error}")
            # Don't fail the request if socket fails
        
        return jsonify({
            'success': True,
            'feedback_id': feedback_id,
            'analysis': analysis,
            'message': 'Feedback submitted successfully'
        })
        
    except Exception as e:
        print(f"Error submitting retrospective feedback: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to submit feedback'}), 500


# ===== ANALYTICS ROUTES =====
@app.route('/api/analytics/team-velocity', methods=['GET'])
@require_auth
def get_team_velocity():
    """Get team velocity analytics"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_velocity_analytics', {'team_id': team_id}, team_id)
        
        # Get completed sprints for velocity calculation
        sprints_ref = db.collection('sprints')
        completed_sprints = sprints_ref.where('team_id', '==', team_id)\
                                     .where('company_id', '==', company_id)\
                                     .where('status', '==', 'completed')\
                                     .order_by('completed_at', direction=firestore.Query.DESCENDING)\
                                     .limit(10)
        
        velocity_data = []
        for sprint in completed_sprints.stream():
            sprint_data = sprint.to_dict()
            final_analytics = sprint_data.get('final_analytics', {})
            
            velocity_data.append({
                'sprint_name': sprint_data.get('name', 'Sprint'),
                'velocity': final_analytics.get('velocity', 0),
                'completion_percentage': final_analytics.get('completion_percentage', 0),
                'total_tasks': final_analytics.get('total_tasks', 0),
                'completed_at': sprint_data.get('completed_at')
            })
        
        # Calculate average velocity
        velocities = [sprint['velocity'] for sprint in velocity_data if sprint['velocity'] > 0]
        avg_velocity = statistics.mean(velocities) if velocities else 0
        
        return jsonify({
            'success': True,
            'velocity_data': velocity_data,
            'average_velocity': round(avg_velocity, 1),
            'sprint_count': len(velocity_data)
        })
        
    except Exception as e:
        print(f"Error fetching velocity analytics: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch velocity data'}), 500

@app.route('/api/analytics/sentiment-trends', methods=['GET'])
@require_auth
def get_sentiment_trends():
    """Get team sentiment trends over time"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_sentiment_analytics', {'team_id': team_id}, team_id)
        
        # Get last 30 days of standups
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))\
                          .order_by('date')
        
        standups = query.stream()
        
        # Group by date and calculate daily sentiment
        daily_sentiment = defaultdict(list)
        
        for standup in standups:
            standup_data = standup.to_dict()
            date = standup_data.get('date')
            sentiment_analysis = standup_data.get('sentiment_analysis', {})
            sentiment = sentiment_analysis.get('sentiment', 'neutral')
            
            daily_sentiment[date].append(sentiment)
        
        # Calculate sentiment trends
        trend_data = []
        for date, sentiments in daily_sentiment.items():
            sentiment_counts = Counter(sentiments)
            
            trend_data.append({
                'date': date,
                'positive': sentiment_counts.get('positive', 0),
                'neutral': sentiment_counts.get('neutral', 0),
                'negative': sentiment_counts.get('negative', 0),
                'total_standups': len(sentiments)
            })
        
        # Sort by date
        trend_data.sort(key=lambda x: x['date'])
        
        return jsonify({
            'success': True,
            'sentiment_trends': trend_data,
            'date_range': {
                'start': start_date.strftime('%Y-%m-%d'),
                'end': end_date.strftime('%Y-%m-%d')
            }
        })
        
    except Exception as e:
        print(f"Error fetching sentiment trends: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch sentiment trends'}), 500

@app.route('/api/analytics/blocker-summary', methods=['GET'])
@require_auth
def get_blocker_summary():
    """Get team blocker analytics"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_blocker_analytics', {'team_id': team_id}, team_id)
        
        # Get last 30 days of standups with blockers
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))
        
        standups = query.stream()
        
        blocker_data = {
            'total_standups': 0,
            'standups_with_blockers': 0,
            'blocker_severity_counts': {'high': 0, 'medium': 0, 'low': 0},
            'common_blocker_keywords': {},
            'blocker_trend': []
        }
        
        daily_blockers = defaultdict(int)
        
        for standup in standups:
            standup_data = standup.to_dict()
            blocker_data['total_standups'] += 1
            
            blocker_analysis = standup_data.get('blocker_analysis', {})
            if blocker_analysis.get('has_blockers'):
                blocker_data['standups_with_blockers'] += 1
                
                # Count severity
                severity = blocker_analysis.get('severity', 'low')
                if severity in blocker_data['blocker_severity_counts']:
                    blocker_data['blocker_severity_counts'][severity] += 1
                
                # Count common keywords
                for blocker in blocker_analysis.get('blockers', []):
                    keyword = blocker.get('keyword', '')
                    if keyword:
                        blocker_data['common_blocker_keywords'][keyword] = blocker_data['common_blocker_keywords'].get(keyword, 0) + 1
                
                # Daily trend
                date = standup_data.get('date')
                if date:
                    daily_blockers[date] += 1
        
        # Convert daily blockers to trend data
        for date, count in sorted(daily_blockers.items()):
            blocker_data['blocker_trend'].append({
                'date': date,
                'blocker_count': count
            })
        
        # Calculate percentage
        blocker_percentage = (blocker_data['standups_with_blockers'] / blocker_data['total_standups'] * 100) if blocker_data['total_standups'] > 0 else 0
        blocker_data['blocker_percentage'] = round(blocker_percentage, 1)
        
        return jsonify({
            'success': True,
            'blocker_analytics': blocker_data
        })
        
    except Exception as e:
        print(f"Error fetching blocker analytics: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch blocker analytics'}), 500

@app.route('/api/analytics/productivity-metrics', methods=['GET'])
@require_auth
def get_productivity_metrics():
    """Get team productivity metrics"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_productivity_metrics', {'team_id': team_id}, team_id)
        
        # Get last 90 days of data
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=90)
        
        # Get standups count per week
        standups_ref = db.collection('standups')
        standups_query = standups_ref.where('team_id', '==', team_id)\
                                    .where('company_id', '==', company_id)\
                                    .where('date', '>=', start_date.strftime('%Y-%m-%d'))
        
        standups = list(standups_query.stream())
        
        # Group standups by week
        weekly_standups = defaultdict(int)
        for standup in standups:
            standup_data = standup.to_dict()
            date_str = standup_data.get('date')
            if date_str:
                date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                week_start = (date_obj - timedelta(days=date_obj.weekday())).strftime('%Y-%m-%d')
                weekly_standups[week_start] += 1
        
        # Get sprint completion rates
        sprints_ref = db.collection('sprints')
        sprints_query = sprints_ref.where('team_id', '==', team_id)\
                                  .where('company_id', '==', company_id)\
                                  .where('status', '==', 'completed')
        
        completed_sprints = list(sprints_query.stream())
        
        sprint_completion_rates = []
        total_velocity = 0
        
        for sprint in completed_sprints:
            sprint_data = sprint.to_dict()
            final_analytics = sprint_data.get('final_analytics', {})
            completion_rate = final_analytics.get('completion_percentage', 0)
            velocity = final_analytics.get('velocity', 0)
            
            sprint_completion_rates.append(completion_rate)
            total_velocity += velocity
        
        # Calculate metrics
        avg_completion_rate = statistics.mean(sprint_completion_rates) if sprint_completion_rates else 0
        avg_velocity = total_velocity / len(completed_sprints) if completed_sprints else 0
        avg_standups_per_week = statistics.mean(weekly_standups.values()) if weekly_standups else 0
        
        productivity_metrics = {
            'average_sprint_completion': round(avg_completion_rate, 1),
            'average_velocity': round(avg_velocity, 1),
            'average_standups_per_week': round(avg_standups_per_week, 1),
            'total_completed_sprints': len(completed_sprints),
            'weekly_standup_trend': [
                {'week': week, 'count': count} 
                for week, count in sorted(weekly_standups.items())
            ],
            'sprint_completion_trend': [
                {
                    'sprint_name': sprint.to_dict().get('name', 'Sprint'),
                    'completion_rate': sprint.to_dict().get('final_analytics', {}).get('completion_percentage', 0),
                    'completed_at': sprint.to_dict().get('completed_at')
                }
                for sprint in completed_sprints[-10:]  # Last 10 sprints
            ]
        }
        
        return jsonify({
            'success': True,
            'productivity_metrics': productivity_metrics
        })
        
    except Exception as e:
        print(f"Error fetching productivity metrics: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch productivity metrics'}), 500

# ===== TEAM MEMBER ROUTES =====
@app.route('/api/teams/<team_id>/members', methods=['POST'])
@require_auth
def add_team_member(team_id):
    """Add member to team (owner/manager only)"""
    try:
        user_id = request.user_id
        data = request.get_json()
        member_email = data.get('email', '').strip()
        member_role = data.get('role', 'DEVELOPER')
        
        if not member_email:
            return jsonify({'error': 'Member email is required'}), 400
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user has permission to add members
        user_role = team_data.get('member_roles', {}).get(user_id, 'DEVELOPER')
        if user_role not in ['OWNER', 'MANAGER']:
            return jsonify({'error': 'Permission denied'}), 403
        
        # Get member by email
        try:
            member_user = auth.get_user_by_email(member_email)
            member_id = member_user.uid
        except:
            return jsonify({'error': 'User not found'}), 404
        
        # Check if already a member
        if member_id in team_data.get('members', []):
            return jsonify({'error': 'User is already a team member'}), 400
        
        # Add member to team
        team_ref.update({
            'members': firestore.ArrayUnion([member_id]),
            f'member_roles.{member_id}': member_role,
            f'member_joined.{member_id}': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        })
        
        track_user_action('add_team_member', {
            'team_id': team_id,
            'member_email': member_email,
            'member_role': member_role
        })
        
        return jsonify({
            'success': True,
            'message': 'Member added successfully',
            'member': {
                'id': member_id,
                'email': member_email,
                'role': member_role,
                'joined_at': datetime.utcnow().isoformat()
            }
        })
        
    except Exception as e:
        print(f"Error adding team member: {str(e)}")
        return jsonify({'error': 'Failed to add team member'}), 500

@app.route('/api/teams/<team_id>/members/<member_id>', methods=['DELETE'])
@require_auth
def remove_team_member(team_id, member_id):
    """Remove member from team (owner only)"""
    try:
        user_id = request.user_id
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user is owner
        if team_data.get('owner_id') != user_id:
            return jsonify({'error': 'Only team owner can remove members'}), 403
        
        # Can't remove owner
        if member_id == team_data.get('owner_id'):
            return jsonify({'error': 'Cannot remove team owner'}), 400
        
        # Remove member from team
        team_ref.update({
            'members': firestore.ArrayRemove([member_id]),
            f'member_roles.{member_id}': firestore.DELETE_FIELD,
            f'member_joined.{member_id}': firestore.DELETE_FIELD,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        track_user_action('remove_team_member', {
            'team_id': team_id,
            'member_id': member_id
        })
        
        return jsonify({
            'success': True,
            'message': 'Member removed successfully'
        })
        
    except Exception as e:
        print(f"Error removing team member: {str(e)}")
        return jsonify({'error': 'Failed to remove team member'}), 500

@app.route('/api/teams/<team_id>/members/<member_id>/role', methods=['PUT'])
@require_auth
def update_member_role(team_id, member_id):
    """Update team member role"""
    try:
        user_id = request.user_id
        data = request.get_json()
        new_role = data.get('role')
        
        if new_role not in ['OWNER', 'MANAGER', 'DEVELOPER']:
            return jsonify({'error': 'Invalid role'}), 400
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        # Check if user has permission (owner or manager)
        user_role = team_data.get('member_roles', {}).get(user_id, 'DEVELOPER')
        if user_role not in ['OWNER', 'MANAGER']:
            return jsonify({'error': 'Permission denied'}), 403
        
        # Update member role
        team_ref.update({
            f'member_roles.{member_id}': new_role,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Role updated successfully'
        })
        
    except Exception as e:
        print(f"Error updating member role: {str(e)}")
        return jsonify({'error': 'Failed to update role'}), 500

@app.route('/api/teams/<team_id>/join', methods=['POST'])
@require_auth
def join_team(team_id):
    """Join a team"""
    try:
        user_id = request.user_id
        user_email = request.user_email
        
        # Get team document
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        
        if not team_doc.exists:
            return jsonify({'error': 'Team not found'}), 404
        
        team_data = team_doc.to_dict()
        
        # Check if already a member
        if user_id in team_data.get('members', []):
            return jsonify({'error': 'Already a team member'}), 400
        
        # Add user to team
        team_ref.update({
            'members': firestore.ArrayUnion([user_id]),
            f'member_roles.{user_id}': 'DEVELOPER',
            f'member_joined.{user_id}': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Successfully joined team'
        })
        
    except Exception as e:
        print(f"Error joining team: {str(e)}")
        return jsonify({'error': 'Failed to join team'}), 500
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

# ===== MAIN APPLICATION ENTRY POINT =====
if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', '5000'))
    host = '0.0.0.0'  
    
    print(f"Starting Upstand server on {host}:{port}")
    print(f"Debug mode: {debug_mode}")
    print(f"Allowed origins: {allowed_origins}")
    print(f"Firebase status: {'Connected' if db else 'Not connected'}")
    print(f"OpenAI status: {'Configured' if os.getenv('OPENAI_API_KEY') else 'Not configured'}")
    print(f"WebSocket support: Enabled")
    print(f"Analytics: Enabled")
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)