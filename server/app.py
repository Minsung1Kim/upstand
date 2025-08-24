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

# Add this enhanced detect_blockers function to your server/app.py
# Replace the existing detect_blockers function with this:

def sentiment_to_score(sentiment):
    if sentiment == 'positive':
        return 1
    elif sentiment == 'negative':
        return -1
    else:
        return 0

def detect_blockers_keyword(text):
    """Basic keyword-based blocker detection (no recursion)"""
    keywords = ['blocker', 'stuck', 'impediment', 'issue', 'problem', 'delay', 'blocked']
    found = [kw for kw in keywords if kw in (text or '').lower()]
    return {
        'has_blockers': bool(found),
        'blockers': [{'keyword': kw, 'context': text, 'severity': 'medium'} for kw in found],
        'severity': 'medium' if found else 'none',
        'blocker_count': len(found)
    }

def detect_blockers(text, use_ai=True):
    """Enhanced blocker detection with both keyword matching and AI analysis"""
    if not text:
        return {'has_blockers': False, 'blockers': [], 'severity': 'none', 'blocker_count': 0}
    
    # Use the basic keyword detection (no recursion)
    keyword_result = detect_blockers_keyword(text)
    
    if not use_ai or not os.getenv('OPENAI_API_KEY'):
        return keyword_result
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        prompt = f"""
        Analyze the following standup text for blockers, impediments, and issues. 
        
        Text: "{text}"
        
        Please provide a JSON response with:
        1. has_blockers: boolean - whether there are any blockers
        2. blockers: array of objects with:
           - keyword: the main blocker term
           - severity: "high", "medium", or "low"
           - context: brief explanation of the blocker
           - suggestions: array of 1-2 suggested actions to resolve
        3. overall_severity: "high", "medium", "low", or "none"
        4. sentiment: "positive", "neutral", or "negative"
        5. analysis: brief overall analysis of the situation
        
        Focus on real blockers that prevent progress, not just minor issues.
        
        Respond with ONLY valid JSON, no other text.
        """
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3
        )
        
        ai_result = response.choices[0].message.content.strip()
        
        # Clean up response (remove markdown if present)
        if ai_result.startswith('```json'):
            ai_result = ai_result[7:]
        if ai_result.endswith('```'):
            ai_result = ai_result[:-3]
        
        import json
        ai_analysis = json.loads(ai_result)
        
        # Merge keyword detection with AI analysis
        enhanced_blockers = []
        
        # Add AI-detected blockers
        for blocker in ai_analysis.get('blockers', []):
            enhanced_blockers.append({
                'keyword': blocker.get('keyword', ''),
                'severity': blocker.get('severity', 'medium'),
                'context': blocker.get('context', text[:100]),
                'ai_suggestions': blocker.get('suggestions', []),
                'detection_method': 'ai'
            })
        
        # Add keyword-detected blockers that AI might have missed
        for kw_blocker in keyword_result.get('blockers', []):
            # Check if similar blocker already exists from AI
            existing = False
            for ai_blocker in enhanced_blockers:
                if kw_blocker['keyword'].lower() in ai_blocker['keyword'].lower():
                    existing = True
                    break
            
            if not existing:
                enhanced_blockers.append({
                    **kw_blocker,
                    'detection_method': 'keyword'
                })
        
        return {
            'has_blockers': len(enhanced_blockers) > 0,
            'blockers': enhanced_blockers,
            'severity': ai_analysis.get('overall_severity', keyword_result.get('severity', 'none')),
            'blocker_count': len(enhanced_blockers),
            'ai_analysis': ai_analysis.get('analysis', ''),
            'sentiment': ai_analysis.get('sentiment', 'neutral'),
            'sentiment_score': sentiment_to_score(ai_analysis.get('sentiment', 'neutral'))
        }
        
    except Exception as e:
        print(f"Error in AI blocker detection: {e}")
        # Fall back to keyword detection
        return keyword_result

# Add new API endpoints for enhanced blocker management:

@app.route('/api/blockers/<blocker_id>/priority', methods=['PUT'])
@require_auth
def update_blocker_priority():
    """Update blocker priority"""
    try:
        blocker_id = request.view_args['blocker_id']
        data = request.get_json()
        new_priority = data.get('priority')
        
        if new_priority not in ['high', 'medium', 'low']:
            return jsonify({'error': 'Invalid priority'}), 400
        
        # Update the blocker priority in your database
        # For now, we'll track this in a separate collection
        priority_update = {
            'blocker_id': blocker_id,
            'new_priority': new_priority,
            'updated_by': request.user_email,
            'updated_at': datetime.utcnow().isoformat(),
            'company_id': request.company_id
        }
        
        db.collection('blocker_updates').add(priority_update)
        
        return jsonify({'success': True, 'message': 'Priority updated'})
        
    except Exception as e:
        print(f"Error updating blocker priority: {e}")
        return jsonify({'success': False, 'error': 'Failed to update priority'}), 500

@app.route('/api/blockers/<blocker_id>/analyze', methods=['POST'])
@require_auth
def analyze_blocker_with_ai():
    """Analyze a specific blocker with AI"""
    try:
        blocker_id = request.view_args['blocker_id']
        data = request.get_json()
        context = data.get('context', '')
        keyword = data.get('keyword', '')
        
        if not os.getenv('OPENAI_API_KEY'):
            return jsonify({'error': 'AI analysis not available'}), 503
        
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        
        prompt = f"""
        Analyze this specific blocker and provide actionable insights:
        
        Blocker: "{keyword}"
        Context: "{context}"
        
        Please provide:
        1. A brief analysis of the blocker
        2. 2-3 specific, actionable suggestions to resolve it
        3. Estimated severity (high/medium/low)
        4. Potential impact on the team
        
        Respond in JSON format:
        {{
            "analysis": "brief analysis",
            "suggestions": ["suggestion1", "suggestion2"],
            "severity": "medium",
            "impact": "potential impact description"
        }}
        """
        
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.3
        )
        
        ai_result = response.choices[0].message.content.strip()
        
        # Clean and parse response
        if ai_result.startswith('```json'):
            ai_result = ai_result[7:]
        if ai_result.endswith('```'):
            ai_result = ai_result[:-3]
        
        import json
        analysis = json.loads(ai_result)
        
        # Store the analysis
        ai_analysis_doc = {
            'blocker_id': blocker_id,
            'analysis': analysis,
            'analyzed_by': 'ai',
            'analyzed_at': datetime.utcnow().isoformat(),
            'company_id': request.company_id
        }
        
        db.collection('blocker_ai_analyses').add(ai_analysis_doc)
        
        return jsonify({
            'success': True,
            'analysis': analysis
        })
        
    except Exception as e:
        print(f"Error analyzing blocker with AI: {e}")
        return jsonify({'success': False, 'error': 'Failed to analyze blocker'}), 500

# Update the standup submission to use enhanced AI detection:
# In your existing standup submission route, replace this line:
# blocker_analysis = detect_blockers(blockers_text)
# With:
# blocker_analysis = detect_blockers_with_ai(blockers_text, use_ai=True)

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
        
        # Import OpenAI with new API format
        try:
            from openai import OpenAI
            client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        except ImportError:
            print("OpenAI package not installed or wrong version. Install with: pip install openai>=1.0.0")
            return f"Team completed {len(standups)} standups today. Check individual updates for details."
        
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
        
        # Updated OpenAI API call format (v1.0+)
        response = client.chat.completions.create(  # ✅ NEW FORMAT
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

@app.route('/api/companies', methods=['POST'])
@require_auth
def create_company():
    """Create a new company"""
    try:
        data = request.get_json()
        user_id = request.user_id
        user_email = request.user_email
        
        company_name = data.get('name', '').strip()
        company_domain = data.get('domain', '').strip()
        
        if not company_name:
            return jsonify({'error': 'Company name is required'}), 400
        
        # Generate invite code
        import secrets
        invite_code = secrets.token_urlsafe(8)
        
        company_data = {
            'name': company_name,
            'domain': company_domain,
            'invite_code': invite_code,
            'owner_id': user_id,
            'members': [user_id],
            'member_roles': {user_id: 'OWNER'},
            'member_joined': {user_id: datetime.utcnow().isoformat()},
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Create company
        company_ref = db.collection('companies').add(company_data)
        company_id = company_ref[1].id
        
        # Create user-company relationship  
        user_company_data = {
            'user_id': user_id,
            'company_id': company_id,
            'role': 'OWNER', 
            'joined_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }
        
        db.collection('user_companies').add(user_company_data)
        
        track_user_action('create_company', {'company_id': company_id})
        
        return jsonify({
            'success': True,
            'company': {
                'id': company_id,
                'name': company_name,
                'role': 'OWNER',
                'invite_code': invite_code
            }
        })
        
    except Exception as e:
        print(f"Error creating company: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create company'}), 500

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

        # Create first-class Blocker docs when blockers text is present
        try:
            if blockers_text and blockers_text.strip():
                blockers_to_create = []
                # Prefer detected blockers; fallback to a single generic blocker
                detected = blocker_analysis.get('blockers') or []
                if detected:
                    for b in detected:
                        blockers_to_create.append({
                            'team_id': team_id,
                            'company_id': company_id,
                            'user_id': user_id,
                            'user_email': user_email,
                            'keyword': b.get('keyword') or 'blocker',
                            'context': b.get('context') or blockers_text,
                            'severity': b.get('severity', 'medium'),
                            'status': 'active',
                            'created_at': datetime.utcnow().isoformat()
                        })
                else:
                    blockers_to_create.append({
                        'team_id': team_id,
                        'company_id': company_id,
                        'user_id': user_id,
                        'user_email': user_email,
                        'keyword': 'blocker',
                        'context': blockers_text,
                        'severity': 'medium',
                        'status': 'active',
                        'created_at': datetime.utcnow().isoformat()
                    })

                for blocker_doc in blockers_to_create:
                    ref = db.collection('blockers').add(blocker_doc)
                    # Emit real-time update per blocker
                    socketio.emit('blocker_detected', {
                        'blocker_id': ref[1].id,
                        'team_id': team_id,
                        'userEmail': user_email,
                        'keyword': blocker_doc['keyword'],
                        'severity': blocker_doc['severity']
                    }, room=f"team_{company_id}_{team_id}")
        except Exception as e:
            print(f"Error creating blocker docs: {e}")
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
        # Check database connection (KEEPING YOUR FEATURE)
        if not db:
            print("Database connection not available")
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        print(f"Completing sprint: {sprint_id}")
        
        # Track user action (KEEPING YOUR FEATURE)
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
        
        # ADD ONLY THIS (WebSocket notification for real-time update)
        try:
            socketio.emit('sprint_completed', {
                'sprint_id': sprint_id,
                'sprint_name': sprint_data.get('name', 'Sprint'),
                'final_analytics': update_data['final_analytics']
            }, room=f"team_{sprint_data.get('company_id')}_{sprint_data.get('team_id')}")
            print(f"✅ Sent real-time sprint completion notification")
        except Exception as socket_error:
            print(f"Socket emit error: {socket_error}")
            # Don't fail the request if socket fails
        
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

# ===== FIRST-CLASS BLOCKER ROUTES (no /api prefix) =====
@app.route('/blockers/active', methods=['GET'])
@require_auth
def get_active_blockers_v2():
    """Return active blockers for a team from first-class blockers collection"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400

        q = db.collection('blockers') \
            .where('company_id', '==', company_id) \
            .where('team_id', '==', team_id) \
            .where('status', '==', 'active')

        blockers = []
        for doc in q.stream():
            data = doc.to_dict()
            data['id'] = doc.id
            blockers.append(data)

        # Newest first if created_at is available
        blockers.sort(key=lambda b: b.get('created_at', ''), reverse=True)

        return jsonify({'success': True, 'blockers': blockers, 'total_count': len(blockers)})
    except Exception as e:
        print(f"Error fetching active blockers (v2): {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch blockers'}), 500


@app.route('/blockers/<blocker_id>/resolve', methods=['POST'])
@require_auth
def resolve_blocker_v2(blocker_id):
    """Mark a blocker doc as resolved"""
    try:
        company_id = request.company_id
        user_email = request.user_email
        data = request.get_json() or {}
        resolution = (data.get('resolution') or '').strip()

        blocker_ref = db.collection('blockers').document(blocker_id)
        blocker_doc = blocker_ref.get()
        if not blocker_doc.exists:
            return jsonify({'error': 'Blocker not found'}), 404

        blocker = blocker_doc.to_dict()
        if blocker.get('company_id') != company_id:
            return jsonify({'error': 'Access denied'}), 403

        update = {
            'status': 'resolved',
            'resolved_at': datetime.utcnow().isoformat(),
            'resolved_by': user_email
        }
        if resolution:
            update['resolution'] = resolution

        blocker_ref.update(update)

        # Emit real-time update
        socketio.emit('blocker_resolved', {
            'blocker_id': blocker_id,
            'resolved_by': user_email,
            'team_id': blocker.get('team_id')
        }, room=f"team_{company_id}_{blocker.get('team_id')}")

        return jsonify({'success': True, 'message': 'Blocker resolved'})
    except Exception as e:
        print(f"Error resolving blocker (v2): {e}")
        return jsonify({'success': False, 'error': 'Failed to resolve blocker'}), 500


@app.route('/blockers/<blocker_id>/priority', methods=['PUT'])
@require_auth
def update_blocker_priority_v2(blocker_id):
    """Update blocker severity (priority)"""
    try:
        company_id = request.company_id
        user_email = request.user_email
        data = request.get_json() or {}
        new_priority = data.get('priority')
        if new_priority not in ['high', 'medium', 'low']:
            return jsonify({'error': 'Invalid priority'}), 400

        blocker_ref = db.collection('blockers').document(blocker_id)
        blocker_doc = blocker_ref.get()
        if not blocker_doc.exists:
            return jsonify({'error': 'Blocker not found'}), 404

        blocker = blocker_doc.to_dict()
        if blocker.get('company_id') != company_id:
            return jsonify({'error': 'Access denied'}), 403

        blocker_ref.update({
            'severity': new_priority,
            'updated_at': datetime.utcnow().isoformat()
        })

        # Optional audit log
        try:
            db.collection('blocker_updates').add({
                'blocker_id': blocker_id,
                'new_priority': new_priority,
                'updated_by': user_email,
                'updated_at': datetime.utcnow().isoformat(),
                'company_id': company_id
            })
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Priority updated'})
    except Exception as e:
        print(f"Error updating blocker priority (v2): {e}")
        return jsonify({'success': False, 'error': 'Failed to update priority'}), 500


@app.route('/blockers/<blocker_id>/analyze', methods=['POST'])
@require_auth
def analyze_blocker_v2(blocker_id):
    """Analyze blocker with OpenAI and store results on blocker doc"""
    try:
        if not os.getenv('OPENAI_API_KEY'):
            return jsonify({'error': 'AI analysis not available'}), 503

        company_id = request.company_id
        blocker_ref = db.collection('blockers').document(blocker_id)
        blocker_doc = blocker_ref.get()
        if not blocker_doc.exists:
            return jsonify({'error': 'Blocker not found'}), 404

        blocker = blocker_doc.to_dict()
        if blocker.get('company_id') != company_id:
            return jsonify({'error': 'Access denied'}), 403

        from openai import OpenAI
        client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

        prompt = f"""
        Analyze this specific blocker and provide actionable insights:
        Blocker: "{blocker.get('keyword', '')}"
        Context: "{blocker.get('context', '')}"

        Please provide JSON with:
        {{
          "analysis": "brief analysis",
          "suggestions": ["suggestion1", "suggestion2"],
          "severity": "medium",
          "impact": "potential impact description"
        }}
        """

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.3
        )

        ai_result = response.choices[0].message.content.strip()
        if ai_result.startswith('```json'):
            ai_result = ai_result[7:]
        if ai_result.endswith('```'):
            ai_result = ai_result[:-3]

        import json as _json
        analysis = _json.loads(ai_result)

        # Store summary on blocker doc
        blocker_ref.update({
            'ai_analysis': analysis.get('analysis', ''),
            'ai_suggestions': analysis.get('suggestions', []),
            'updated_at': datetime.utcnow().isoformat()
        })

        # Optional: historical log
        try:
            db.collection('blocker_ai_analyses').add({
                'blocker_id': blocker_id,
                'analysis': analysis,
                'analyzed_at': datetime.utcnow().isoformat(),
                'company_id': company_id
            })
        except Exception:
            pass

        return jsonify({'success': True, 'analysis': analysis})
    except Exception as e:
        print(f"Error analyzing blocker (v2): {e}")
        return jsonify({'success': False, 'error': 'Failed to analyze blocker'}), 500

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

# ===== BLOCKER MANAGEMENT ROUTES =====
# Add this entire section to your server/app.py file

@app.route('/api/blockers/active', methods=['GET'])
@require_auth
def get_active_blockers():
    """Get all active blockers for a team"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_active_blockers', {'team_id': team_id}, team_id)
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Get last 30 days of standups with blockers
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))
        
        standups = query.stream()
        
        blockers = []
        blocker_id_counter = 1
        
        for standup in standups:
            standup_data = standup.to_dict()
            blocker_analysis = standup_data.get('blocker_analysis', {})
            
            if blocker_analysis.get('has_blockers'):
                for blocker in blocker_analysis.get('blockers', []):
                    # Check if this blocker has been resolved
                    blocker_status = get_blocker_status(standup.id, blocker.get('keyword', ''))
                    
                    blockers.append({
                        'id': f"{standup.id}_{blocker_id_counter}",
                        'standup_id': standup.id,
                        'user_id': standup_data.get('user_id'),
                        'user_email': standup_data.get('user_email'),
                        'user_name': standup_data.get('user_name', standup_data.get('user_email')),
                        'keyword': blocker.get('keyword', ''),
                        'context': blocker.get('context', ''),
                        'severity': blocker.get('severity', 'low'),
                        'status': blocker_status.get('status', 'active'),
                        'created_at': standup_data.get('created_at'),
                        'date': standup_data.get('date'),
                        'standup_context': standup_data.get('blockers', ''),
                        'resolution': blocker_status.get('resolution'),
                        'resolved_at': blocker_status.get('resolved_at'),
                        'resolved_by': blocker_status.get('resolved_by'),
                        'escalated': blocker_status.get('escalated', False)
                    })
                    blocker_id_counter += 1
        
        # Sort by creation date, newest first
        blockers.sort(key=lambda x: x['created_at'], reverse=True)
        
        return jsonify({
            'success': True,
            'blockers': blockers,
            'total_count': len(blockers)
        })
        
    except Exception as e:
        print(f"Error fetching active blockers: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch blockers'}), 500

@app.route('/api/blockers/<blocker_id>/resolve', methods=['POST'])
@require_auth
def resolve_blocker(blocker_id):
    """Mark a blocker as resolved"""
    try:
        company_id = request.company_id
        user_id = request.user_id
        user_email = request.user_email
        data = request.get_json()
        
        resolution = data.get('resolution', '').strip()
        if not resolution:
            return jsonify({'error': 'Resolution description is required'}), 400
        
        # Parse blocker ID to get standup ID and blocker info
        parts = blocker_id.split('_')
        if len(parts) < 2:
            return jsonify({'error': 'Invalid blocker ID'}), 400
        
        standup_id = parts[0]
        
        # Verify the standup exists and belongs to user's company
        standup_ref = db.collection('standups').document(standup_id)
        standup_doc = standup_ref.get()
        
        if not standup_doc.exists:
            return jsonify({'error': 'Standup not found'}), 404
        
        standup_data = standup_doc.to_dict()
        if standup_data.get('company_id') != company_id:
            return jsonify({'error': 'Access denied'}), 403
        
        # Create or update blocker resolution record
        resolution_data = {
            'blocker_id': blocker_id,
            'standup_id': standup_id,
            'team_id': standup_data.get('team_id'),
            'company_id': company_id,
            'resolution': resolution,
            'resolved_by': user_email,
            'resolved_by_id': user_id,
            'resolved_at': datetime.utcnow().isoformat(),
            'status': 'resolved'
        }
        
        # Save resolution to blocker_resolutions collection
        db.collection('blocker_resolutions').add(resolution_data)
        
        track_user_action('resolve_blocker', {
            'blocker_id': blocker_id,
            'standup_id': standup_id,
            'team_id': standup_data.get('team_id')
        }, standup_data.get('team_id'))
        
        # Emit real-time update
        socketio.emit('blocker_resolved', {
            'blocker_id': blocker_id,
            'resolved_by': user_email,
            'resolution': resolution,
            'team_id': standup_data.get('team_id')
        }, room=f"team_{company_id}_{standup_data.get('team_id')}")
        
        return jsonify({
            'success': True,
            'message': 'Blocker resolved successfully'
        })
        
    except Exception as e:
        print(f"Error resolving blocker: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to resolve blocker'}), 500

@app.route('/api/blockers/<blocker_id>/escalate', methods=['POST'])
@require_auth
def escalate_blocker(blocker_id):
    """Escalate a blocker to team lead/management"""
    try:
        company_id = request.company_id
        user_id = request.user_id
        user_email = request.user_email
        
        # Parse blocker ID to get standup ID
        parts = blocker_id.split('_')
        if len(parts) < 2:
            return jsonify({'error': 'Invalid blocker ID'}), 400
        
        standup_id = parts[0]
        
        # Verify the standup exists and belongs to user's company
        standup_ref = db.collection('standups').document(standup_id)
        standup_doc = standup_ref.get()
        
        if not standup_doc.exists:
            return jsonify({'error': 'Standup not found'}), 404
        
        standup_data = standup_doc.to_dict()
        if standup_data.get('company_id') != company_id:
            return jsonify({'error': 'Access denied'}), 403
        
        # Create escalation record
        escalation_data = {
            'blocker_id': blocker_id,
            'standup_id': standup_id,
            'team_id': standup_data.get('team_id'),
            'company_id': company_id,
            'escalated_by': user_email,
            'escalated_by_id': user_id,
            'escalated_at': datetime.utcnow().isoformat(),
            'status': 'escalated',
            'original_blocker': standup_data.get('blockers', ''),
            'original_user': standup_data.get('user_email', '')
        }
        
        # Save escalation
        db.collection('blocker_escalations').add(escalation_data)
        
        track_user_action('escalate_blocker', {
            'blocker_id': blocker_id,
            'standup_id': standup_id,
            'team_id': standup_data.get('team_id')
        }, standup_data.get('team_id'))
        
        # Emit real-time update to team leads
        socketio.emit('blocker_escalated', {
            'blocker_id': blocker_id,
            'escalated_by': user_email,
            'team_id': standup_data.get('team_id'),
            'severity': 'high',  # Escalated blockers are high priority
            'context': standup_data.get('blockers', '')
        }, room=f"team_{company_id}_{standup_data.get('team_id')}")
        
        return jsonify({
            'success': True,
            'message': 'Blocker escalated successfully'
        })
        
    except Exception as e:
        print(f"Error escalating blocker: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to escalate blocker'}), 500

@app.route('/api/blockers/analytics', methods=['GET'])
@require_auth
def get_blocker_analytics():
    """Get comprehensive blocker analytics for a team"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_blocker_analytics', {'team_id': team_id}, team_id)
        
        # Get last 30 days of data
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        # Get standups with blockers
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))
        
        standups = list(query.stream())
        
        # Calculate analytics
        total_standups = len(standups)
        standups_with_blockers = 0
        severity_counts = {'high': 0, 'medium': 0, 'low': 0}
        keyword_counts = defaultdict(int)
        daily_blocker_trend = defaultdict(int)
        user_blocker_counts = defaultdict(int)
        resolution_times = []
        
        for standup in standups:
            standup_data = standup.to_dict()
            blocker_analysis = standup_data.get('blocker_analysis', {})
            
            if blocker_analysis.get('has_blockers'):
                standups_with_blockers += 1
                severity = blocker_analysis.get('severity', 'low')
                severity_counts[severity] += 1
                
                # Count by date for trend
                date = standup_data.get('date')
                if date:
                    daily_blocker_trend[date] += 1
                
                # Count by user
                user_email = standup_data.get('user_email', 'Unknown')
                user_blocker_counts[user_email] += 1
                
                # Count keywords
                for blocker in blocker_analysis.get('blockers', []):
                    keyword = blocker.get('keyword', '')
                    if keyword:
                        keyword_counts[keyword] += 1
        
        # Get resolution data
        resolutions_ref = db.collection('blocker_resolutions')
        resolutions_query = resolutions_ref.where('team_id', '==', team_id)\
                                         .where('company_id', '==', company_id)
        
        resolved_count = 0
        avg_resolution_time = 0
        
        for resolution in resolutions_query.stream():
            resolved_count += 1
            # Calculate resolution time if we have the data
            resolution_data = resolution.to_dict()
            resolved_at = resolution_data.get('resolved_at')
            # Note: We'd need to store blocker creation time to calculate this properly
        
        # Calculate blocker percentage
        blocker_percentage = (standups_with_blockers / total_standups * 100) if total_standups > 0 else 0
        
        # Prepare trend data
        trend_data = []
        for date, count in sorted(daily_blocker_trend.items()):
            trend_data.append({
                'date': date,
                'blocker_count': count
            })
        
        # Top keywords
        top_keywords = sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        # Top affected users
        top_users = sorted(user_blocker_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
        analytics = {
            'total_standups': total_standups,
            'standups_with_blockers': standups_with_blockers,
            'blocker_percentage': round(blocker_percentage, 1),
            'blocker_severity_counts': severity_counts,
            'resolved_blockers': resolved_count,
            'common_blocker_keywords': dict(top_keywords),
            'blocker_trend': trend_data,
            'top_affected_users': [{'user': user, 'count': count} for user, count in top_users],
            'summary': {
                'most_common_keyword': top_keywords[0][0] if top_keywords else 'None',
                'most_affected_user': top_users[0][0] if top_users else 'None',
                'trend_direction': 'increasing' if len(trend_data) >= 2 and trend_data[-1]['blocker_count'] > trend_data[-2]['blocker_count'] else 'stable'
            }
        }
        
        return jsonify({
            'success': True,
            'blocker_analytics': analytics
        })
        
    except Exception as e:
        print(f"Error fetching blocker analytics: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch analytics'}), 500

@app.route('/api/blockers/team-summary', methods=['GET'])
@require_auth
def get_team_blocker_summary():
    """Get a summary of team blockers for dashboard"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Get today's blockers
        today = datetime.utcnow().strftime('%Y-%m-%d')
        
        standups_ref = db.collection('standups')
        today_query = standups_ref.where('team_id', '==', team_id)\
                                 .where('company_id', '==', company_id)\
                                 .where('date', '==', today)
        
        active_blockers = []
        high_priority_count = 0
        
        for standup in today_query.stream():
            standup_data = standup.to_dict()
            blocker_analysis = standup_data.get('blocker_analysis', {})
            
            if blocker_analysis.get('has_blockers'):
                severity = blocker_analysis.get('severity', 'low')
                if severity == 'high':
                    high_priority_count += 1
                
                for blocker in blocker_analysis.get('blockers', []):
                    # Check if still active
                    status = get_blocker_status(standup.id, blocker.get('keyword', ''))
                    if status.get('status') == 'active':
                        active_blockers.append({
                            'user': standup_data.get('user_name', standup_data.get('user_email')),
                            'keyword': blocker.get('keyword', ''),
                            'severity': severity,
                            'context': blocker.get('context', '')[:100] + '...' if len(blocker.get('context', '')) > 100 else blocker.get('context', '')
                        })
        
        return jsonify({
            'success': True,
            'summary': {
                'active_blockers_today': len(active_blockers),
                'high_priority_count': high_priority_count,
                'blockers': active_blockers[:5],  # Top 5 for dashboard
                'needs_attention': high_priority_count > 0
            }
        })
        
    except Exception as e:
        print(f"Error fetching team blocker summary: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch summary'}), 500

def get_blocker_status(standup_id, keyword):
    """Helper function to get the current status of a blocker"""
    try:
        # Check if blocker has been resolved
        resolutions_ref = db.collection('blocker_resolutions')
        resolution_query = resolutions_ref.where('standup_id', '==', standup_id).limit(1)
        
        for resolution in resolution_query.stream():
            resolution_data = resolution.to_dict()
            return {
                'status': 'resolved',
                'resolution': resolution_data.get('resolution'),
                'resolved_at': resolution_data.get('resolved_at'),
                'resolved_by': resolution_data.get('resolved_by')
            }
        
        # Check if blocker has been escalated
        escalations_ref = db.collection('blocker_escalations')
        escalation_query = escalations_ref.where('standup_id', '==', standup_id).limit(1)
        
        for escalation in escalation_query.stream():
            escalation_data = escalation.to_dict()
            return {
                'status': 'escalated',
                'escalated_at': escalation_data.get('escalated_at'),
                'escalated_by': escalation_data.get('escalated_by')
            }
        
        # Default to active
        return {'status': 'active'}
        
    except Exception as e:
        print(f"Error getting blocker status: {str(e)}")
        return {'status': 'active'}

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
    


# ===== ANALYTICS ROUTES =====
@app.route('/api/analytics/dashboard', methods=['GET'])
@require_auth
def get_analytics_dashboard():
    """Get comprehensive analytics dashboard"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Get last 30 days of data
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        # EXISTING FEATURE: User activity metrics
        activity_ref = db.collection('user_analytics')
        activity_query = activity_ref.where('team_id', '==', team_id)\
                                   .where('company_id', '==', company_id)\
                                   .where('timestamp', '>=', start_date.isoformat())
        
        activities = list(activity_query.stream())
        
        # Count activities by type (EXISTING)
        activity_counts = {}
        for activity in activities:
            action = activity.to_dict().get('action', 'unknown')
            activity_counts[action] = activity_counts.get(action, 0) + 1
        
        # EXISTING FEATURE: Sprint velocity data
        sprints_ref = db.collection('sprints')
        completed_sprints = sprints_ref.where('team_id', '==', team_id)\
                                     .where('company_id', '==', company_id)\
                                     .where('status', '==', 'completed')\
                                     .order_by('completed_at', direction=firestore.Query.DESCENDING)\
                                     .limit(10)
        
        velocity_data = []
        for sprint in completed_sprints.stream():
            sprint_info = sprint.to_dict()
            analytics = sprint_info.get('final_analytics', {})
            velocity_data.append({
                'name': sprint_info.get('name', 'Sprint'),
                'velocity': analytics.get('velocity', 0),
                'completion_rate': analytics.get('completion_percentage', 0),
                'completed_at': sprint_info.get('completed_at', '')
            })
        
        # EXISTING FEATURE: Blocker analysis from recent standups
        standups_ref = db.collection('standups')
        recent_standups_query = standups_ref.where('team_id', '==', team_id)\
                                           .where('company_id', '==', company_id)\
                                           .where('date', '>=', start_date.strftime('%Y-%m-%d'))
        
        blocker_stats = {'total_standups': 0, 'with_blockers': 0, 'high_severity': 0}
        recent_standups_list = list(recent_standups_query.stream())
        
        for standup in recent_standups_list:
            standup_data = standup.to_dict()
            blocker_stats['total_standups'] += 1
            
            blocker_analysis = standup_data.get('blocker_analysis', {})
            if blocker_analysis.get('has_blockers'):
                blocker_stats['with_blockers'] += 1
                if blocker_analysis.get('severity') == 'high':
                    blocker_stats['high_severity'] += 1
        
        # NEW FEATURE: Team Participation Analytics
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        team_members = team_doc.to_dict().get('members', []) if team_doc.exists else []
        total_members = len(team_members)

        # Active participation (standups + task completion)
        active_members = set()
        standup_members = set()

        # Check standup participation
        for standup in recent_standups_list:
            standup_data = standup.to_dict()
            user_id = standup_data.get('user_id')
            if user_id:
                active_members.add(user_id)
                standup_members.add(user_id)

        # Check task completion
        tasks_ref = db.collection('tasks')
        completed_tasks_query = tasks_ref.where('company_id', '==', company_id)\
                                        .where('status', '==', 'done')\
                                        .where('updated_at', '>=', start_date.isoformat())

        for task in completed_tasks_query.stream():
            task_data = task.to_dict()
            created_by = task_data.get('created_by')
            if created_by in team_members:
                active_members.add(created_by)

        participation_rate = (len(active_members) / total_members * 100) if total_members > 0 else 0
        standup_consistency = (len(standup_members) / total_members * 100) if total_members > 0 else 0

        # NEW FEATURE: Sentiment Trend (daily)
        daily_sentiment = defaultdict(lambda: {'positive': 0, 'neutral': 0, 'negative': 0, 'total': 0})

        for standup in recent_standups_list:
            standup_data = standup.to_dict()
            date = standup_data.get('date')
            sentiment = standup_data.get('sentiment_analysis', {}).get('sentiment', 'neutral')
            
            if date and sentiment in daily_sentiment[date]:
                daily_sentiment[date][sentiment] += 1
                daily_sentiment[date]['total'] += 1

        sentiment_trend = []
        for date in sorted(daily_sentiment.keys())[-7:]:  # Last 7 days
            data = daily_sentiment[date]
            if data['total'] > 0:
                sentiment_trend.append({
                    'date': date,
                    'positive_pct': round(data['positive'] / data['total'] * 100, 1),
                    'neutral_pct': round(data['neutral'] / data['total'] * 100, 1),
                    'negative_pct': round(data['negative'] / data['total'] * 100, 1)
                })

        # NEW FEATURE: Lead Time for Tasks
        lead_times = []
        tasks_with_dates = tasks_ref.where('company_id', '==', company_id)\
                                   .where('status', '==', 'done')\
                                   .where('updated_at', '>=', start_date.isoformat())

        for task in tasks_with_dates.stream():
            task_data = task.to_dict()
            created_at = task_data.get('created_at')
            updated_at = task_data.get('updated_at')
            
            if created_at and updated_at:
                try:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    completed = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    lead_time_days = (completed - created).days
                    if lead_time_days >= 0:
                        lead_times.append(lead_time_days)
                except:
                    continue

        avg_lead_time = sum(lead_times) / len(lead_times) if lead_times else 0

        # NEW FEATURE: Blocker Resolution Time (simplified)
        blocker_resolution_times = []
        user_blocker_history = defaultdict(list)
        
        # Group standups by user and date
        for standup in recent_standups_list:
            standup_data = standup.to_dict()
            user_id = standup_data.get('user_id')
            date = standup_data.get('date')
            has_blockers = standup_data.get('blocker_analysis', {}).get('has_blockers', False)
            
            if user_id and date:
                user_blocker_history[user_id].append({
                    'date': date,
                    'has_blockers': has_blockers
                })
        
        # Calculate resolution times
        for user_id, history in user_blocker_history.items():
            history.sort(key=lambda x: x['date'])
            blocker_start = None
            
            for entry in history:
                if entry['has_blockers'] and blocker_start is None:
                    blocker_start = entry['date']
                elif not entry['has_blockers'] and blocker_start is not None:
                    try:
                        start_date_obj = datetime.strptime(blocker_start, '%Y-%m-%d')
                        end_date_obj = datetime.strptime(entry['date'], '%Y-%m-%d')
                        resolution_days = (end_date_obj - start_date_obj).days
                        if resolution_days > 0:
                            blocker_resolution_times.append(resolution_days)
                    except:
                        pass
                    blocker_start = None
        
        avg_blocker_resolution = sum(blocker_resolution_times) / len(blocker_resolution_times) if blocker_resolution_times else 0

        return jsonify({
            'success': True,
            'analytics': {
                # EXISTING FEATURES (kept all)
                'user_activity': {
                    'total_actions': len(activities),
                    'by_type': activity_counts
                },
                'sprint_velocity': velocity_data,
                'blocker_stats': blocker_stats,
                # NEW FEATURES (added)
                'team_participation': {
                    'participation_rate': round(participation_rate, 1),
                    'standup_consistency': round(standup_consistency, 1),
                    'active_members': len(active_members),
                    'total_members': total_members
                },
                'sentiment_trend': sentiment_trend,
                'performance_metrics': {
                    'avg_lead_time_days': round(avg_lead_time, 1),
                    'tasks_completed': len(lead_times),
                    'avg_blocker_resolution_days': round(avg_blocker_resolution, 1),
                    'blockers_resolved': len(blocker_resolution_times)
                },
                'date_range': {
                    'start': start_date.strftime('%Y-%m-%d'),
                    'end': end_date.strftime('%Y-%m-%d')
                }
            }
        })
        
    except Exception as e:
        print(f"Error fetching analytics dashboard: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch analytics'}), 500

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