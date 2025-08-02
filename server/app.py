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
from google.oauth2 import service_account
import json

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-12345')

# Hardcode allowed origins for testing
allowed_origins = [
    'http://localhost:3000',
    'https://upstand-omega.vercel.app',
    'https://upstand-git-main-minsung1kims-projects.vercel.app',
    'https://upstand-cytbctct3-minsung1kims-projects.vercel.app/'
]

print(f"ALLOWED_ORIGINS env var: {os.getenv('ALLOWED_ORIGINS')}")
print(f"Hardcoded allowed_origins: {allowed_origins}")

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

def init_firestore():
    global db
    try:
        # Try to get service account key from environment variable
        service_account_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
        
        if service_account_key:
            # If it's a file path
            if service_account_key.startswith('./') or service_account_key.startswith('/'):
                credentials_obj = service_account.Credentials.from_service_account_file(service_account_key)
            else:
                # If it's JSON string
                service_account_info = json.loads(service_account_key)
                credentials_obj = service_account.Credentials.from_service_account_info(service_account_info)
            
            db = firestore.Client(credentials=credentials_obj)
            print("✅ Firestore initialized successfully with service account")
        else:
            # Try application default credentials (for Railway/production)
            db = firestore.Client()
            print("✅ Firestore initialized with default credentials")
            
        # Test the connection
        test_collection = db.collection('test')
        test_doc = test_collection.document('connection_test')
        test_doc.set({'test': True, 'timestamp': datetime.utcnow()})
        print("✅ Firestore connection test successful")
        
        return True
    except Exception as e:
        print(f"❌ Failed to initialize Firestore: {str(e)}")
        traceback.print_exc()
        return False

# Add explicit OPTIONS handler for CORS preflight
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
db = None
firestore_initialized = init_firestore()

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

# ===== ANALYTICS TRACKING MIDDLEWARE =====

def track_user_action(action_type, details=None, team_id=None):
    """Track user behavior for analytics"""
    try:
        if not hasattr(request, 'user_id') or not db:
            return  # Skip tracking for unauthenticated requests or no DB
        
        tracking_data = {
            'user_id': request.user_id,
            'company_id': getattr(request, 'company_id', 'default'),
            'team_id': team_id,
            'action_type': action_type,
            'endpoint': request.endpoint,
            'method': request.method,
            'user_agent': request.headers.get('User-Agent', ''),
            'ip_address': request.headers.get('X-Forwarded-For', request.remote_addr),
            'timestamp': firestore.SERVER_TIMESTAMP,
            'session_id': request.headers.get('X-Session-ID', f"session_{int(time.time())}"),
            'details': details or {}
        }
        
        # Store in analytics collection
        db.collection('user_analytics').add(tracking_data)
        
        # Emit real-time analytics event for dashboards
        socketio.emit('analytics_event', {
            'action_type': action_type,
            'user_id': request.user_id,
            'team_id': team_id,
            'timestamp': datetime.utcnow().isoformat()
        }, room=f"analytics_{getattr(request, 'company_id', 'default')}")
        
    except Exception as e:
        print(f"Analytics tracking error: {e}")
        # Don't fail the main request if analytics fails
        pass

@app.before_request
def track_page_view():
    """Track page views and API usage"""
    if request.endpoint and request.endpoint.startswith('api'):
        # Only track after auth middleware runs
        pass

# ===== HELPER FUNCTIONS =====

def detect_blockers(text):
    """Enhanced blocker detection with severity levels"""
    blocker_keywords = {
        'high': ['blocked', 'stuck', 'cant', "can't", 'unable', 'impossible', 'critical'],
        'medium': ['issue', 'problem', 'waiting', 'delayed', 'slow', 'difficulty'],
        'low': ['concern', 'question', 'unclear', 'needs help', 'support']
    }
    
    text_lower = text.lower()
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
                    'considering', 'evaluating', 'assessing', 'monitoring', 'tracking', 'updating', 'maintaining',
                    'documenting', 'preparing', 'organizing', 'scheduling', 'coordinating', 'communicating']
    
    text_lower = text.lower()
    positive_count = sum(1 for word in positive_words if word in text_lower)
    negative_count = sum(1 for word in negative_words if word in text_lower)
    neutral_count = sum(1 for word in neutral_words if word in text_lower)
    
    total_sentiment_words = positive_count + negative_count + neutral_count
    confidence = min(total_sentiment_words / 10.0, 1.0) if total_sentiment_words > 0 else 0.0
    
    if positive_count > negative_count and positive_count > neutral_count:
        sentiment = 'positive'
        score = positive_count / max(total_sentiment_words, 1)
    elif negative_count > positive_count and negative_count > neutral_count:
        sentiment = 'negative'
        score = negative_count / max(total_sentiment_words, 1)
    else:
        sentiment = 'neutral'
        score = neutral_count / max(total_sentiment_words, 1)
    
    return {
        'sentiment': sentiment,
        'confidence': confidence,
        'score': score,
        'word_counts': {
            'positive': positive_count,
            'negative': negative_count,
            'neutral': neutral_count
        }
    }

def calculate_sprint_velocity(team_id, company_id, sprint_count=5):
    """Calculate team velocity over recent sprints"""
    try:
        # Get recent completed sprints
        sprints_ref = db.collection('sprints')
        query = sprints_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('status', '==', 'completed')\
                          .order_by('end_date', direction=firestore.Query.DESCENDING)\
                          .limit(sprint_count)
        
        sprints = list(query.stream())
        
        if not sprints:
            return {'velocity': 0, 'trend': 'no_data', 'sprints_analyzed': 0}
        
        velocities = []
        for sprint in sprints:
            sprint_data = sprint.to_dict()
            
            # Get completed tasks for this sprint
            tasks_ref = db.collection('tasks')
            tasks_query = tasks_ref.where('sprint_id', '==', sprint.id)\
                                 .where('status', '==', 'done')
            
            completed_tasks = list(tasks_query.stream())
            story_points = sum(task.to_dict().get('estimate', 1) for task in completed_tasks)
            velocities.append(story_points)
        
        avg_velocity = statistics.mean(velocities) if velocities else 0
        
        # Calculate trend
        if len(velocities) >= 2:
            recent_avg = statistics.mean(velocities[:2])
            older_avg = statistics.mean(velocities[2:]) if len(velocities) > 2 else velocities[-1]
            
            if recent_avg > older_avg * 1.1:
                trend = 'increasing'
            elif recent_avg < older_avg * 0.9:
                trend = 'decreasing'
            else:
                trend = 'stable'
        else:
            trend = 'insufficient_data'
        
        return {
            'velocity': round(avg_velocity, 1),
            'trend': trend,
            'sprints_analyzed': len(velocities),
            'velocity_history': velocities,
            'min_velocity': min(velocities) if velocities else 0,
            'max_velocity': max(velocities) if velocities else 0
        }
        
    except Exception as e:
        print(f"Error calculating velocity: {e}")
        return {'velocity': 0, 'trend': 'error', 'sprints_analyzed': 0}

def calculate_completion_rates(team_id, company_id, days=30):
    """Calculate task completion rates and productivity metrics"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get all tasks created in the time period
        tasks_ref = db.collection('tasks')
        
        # Get team's sprints first to filter tasks
        sprints_ref = db.collection('sprints')
        sprints_query = sprints_ref.where('team_id', '==', team_id)\
                                 .where('company_id', '==', company_id)
        sprints = list(sprints_query.stream())
        sprint_ids = [sprint.id for sprint in sprints]
        
        if not sprint_ids:
            return {'completion_rate': 0, 'metrics': {}}
        
        # Get tasks for these sprints
        all_tasks = []
        completed_tasks = []
        
        for sprint_id in sprint_ids:
            tasks_query = tasks_ref.where('sprint_id', '==', sprint_id)
            tasks = list(tasks_query.stream())
            
            for task in tasks:
                task_data = task.to_dict()
                task_data['id'] = task.id
                
                # Check if task was created in our date range
                created_at = task_data.get('created_at')
                if created_at and isinstance(created_at, str):
                    try:
                        task_created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        if start_date <= task_created <= end_date:
                            all_tasks.append(task_data)
                            if task_data.get('status') == 'done':
                                completed_tasks.append(task_data)
                    except:
                        continue
        
        total_tasks = len(all_tasks)
        completed_count = len(completed_tasks)
        completion_rate = (completed_count / total_tasks * 100) if total_tasks > 0 else 0
        
        # Calculate additional metrics
        status_distribution = Counter(task.get('status', 'unknown') for task in all_tasks)
        
        # Calculate average completion time for completed tasks
        completion_times = []
        for task in completed_tasks:
            created_at = task.get('created_at')
            updated_at = task.get('updated_at')
            if created_at and updated_at:
                try:
                    created = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    updated = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
                    completion_times.append((updated - created).total_seconds() / 3600)  # hours
                except:
                    continue
        
        avg_completion_time = statistics.mean(completion_times) if completion_times else 0
        
        return {
            'completion_rate': round(completion_rate, 1),
            'total_tasks': total_tasks,
            'completed_tasks': completed_count,
            'pending_tasks': total_tasks - completed_count,
            'status_distribution': dict(status_distribution),
            'avg_completion_time_hours': round(avg_completion_time, 1),
            'period_days': days
        }
        
    except Exception as e:
        print(f"Error calculating completion rates: {e}")
        return {'completion_rate': 0, 'metrics': {}}

def analyze_blocker_metrics(team_id, company_id, days=30):
    """Analyze blocker patterns and resolution times"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get standups with blockers in the time period
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))\
                          .where('date', '<=', end_date.strftime('%Y-%m-%d'))
        
        standups = list(query.stream())
        
        blocker_incidents = []
        total_standups = len(standups)
        standups_with_blockers = 0
        
        blocker_severity_counts = {'high': 0, 'medium': 0, 'low': 0}
        
        for standup in standups:
            standup_data = standup.to_dict()
            blocker_analysis = standup_data.get('blocker_analysis', {})
            
            if blocker_analysis.get('has_blockers'):
                standups_with_blockers += 1
                severity = blocker_analysis.get('severity', 'low')
                blocker_severity_counts[severity] += 1
                
                blocker_incidents.append({
                    'date': standup_data.get('date'),
                    'user_id': standup_data.get('user_id'),
                    'severity': severity,
                    'blockers': blocker_analysis.get('blockers', [])
                })
        
        blocker_frequency = (standups_with_blockers / total_standups * 100) if total_standups > 0 else 0
        
        # Analyze common blocker patterns
        all_blocker_keywords = []
        for incident in blocker_incidents:
            for blocker in incident['blockers']:
                if isinstance(blocker, dict):
                    all_blocker_keywords.append(blocker.get('keyword', ''))
                else:
                    all_blocker_keywords.append(str(blocker))
        
        common_blockers = Counter(all_blocker_keywords).most_common(5)
        
        return {
            'blocker_frequency_percent': round(blocker_frequency, 1),
            'total_standups': total_standups,
            'standups_with_blockers': standups_with_blockers,
            'severity_distribution': blocker_severity_counts,
            'common_blocker_types': common_blockers,
            'total_blocker_incidents': len(blocker_incidents),
            'period_days': days
        }
        
    except Exception as e:
        print(f"Error analyzing blocker metrics: {e}")
        return {'blocker_frequency_percent': 0, 'metrics': {}}

def get_productivity_trends(team_id, company_id, days=30):
    """Calculate team productivity trends over time"""
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Get daily standup counts
        standups_ref = db.collection('standups')
        query = standups_ref.where('team_id', '==', team_id)\
                          .where('company_id', '==', company_id)\
                          .where('date', '>=', start_date.strftime('%Y-%m-%d'))\
                          .where('date', '<=', end_date.strftime('%Y-%m-%d'))
        
        standups = list(query.stream())
        
        # Group by date
        daily_standups = defaultdict(list)
        daily_sentiment = defaultdict(list)
        
        for standup in standups:
            standup_data = standup.to_dict()
            date = standup_data.get('date')
            sentiment = standup_data.get('sentiment', {}).get('sentiment', 'neutral')
            
            if date:
                daily_standups[date].append(standup_data)
                daily_sentiment[date].append(sentiment)
        
        # Calculate daily metrics
        daily_metrics = []
        for date in sorted(daily_standups.keys()):
            standups_count = len(daily_standups[date])
            sentiments = daily_sentiment[date]
            
            positive_count = sentiments.count('positive')
            negative_count = sentiments.count('negative')
            neutral_count = sentiments.count('neutral')
            
            avg_sentiment_score = 0
            if sentiments:
                sentiment_scores = {'positive': 1, 'neutral': 0, 'negative': -1}
                avg_sentiment_score = sum(sentiment_scores.get(s, 0) for s in sentiments) / len(sentiments)
            
            daily_metrics.append({
                'date': date,
                'standup_count': standups_count,
                'sentiment_score': round(avg_sentiment_score, 2),
                'positive_count': positive_count,
                'negative_count': negative_count,
                'neutral_count': neutral_count
            })
        
        # Calculate trends
        if len(daily_metrics) >= 7:
            recent_week = daily_metrics[-7:]
            recent_avg_sentiment = statistics.mean([d['sentiment_score'] for d in recent_week])
            recent_avg_participation = statistics.mean([d['standup_count'] for d in recent_week])
            
            if len(daily_metrics) >= 14:
                previous_week = daily_metrics[-14:-7]
                prev_avg_sentiment = statistics.mean([d['sentiment_score'] for d in previous_week])
                prev_avg_participation = statistics.mean([d['standup_count'] for d in previous_week])
                
                sentiment_trend = 'improving' if recent_avg_sentiment > prev_avg_sentiment else 'declining' if recent_avg_sentiment < prev_avg_sentiment else 'stable'
                participation_trend = 'improving' if recent_avg_participation > prev_avg_participation else 'declining' if recent_avg_participation < prev_avg_participation else 'stable'
            else:
                sentiment_trend = 'insufficient_data'
                participation_trend = 'insufficient_data'
        else:
            recent_avg_sentiment = 0
            recent_avg_participation = 0
            sentiment_trend = 'insufficient_data'
            participation_trend = 'insufficient_data'
        
        return {
            'daily_metrics': daily_metrics,
            'summary': {
                'avg_sentiment_score': round(recent_avg_sentiment, 2),
                'avg_daily_participation': round(recent_avg_participation, 1),
                'sentiment_trend': sentiment_trend,
                'participation_trend': participation_trend,
                'total_days_tracked': len(daily_metrics)
            }
        }
        
    except Exception as e:
        print(f"Error calculating productivity trends: {e}")
        return {'daily_metrics': [], 'summary': {}}

def summarize_standups(entries):
    """Enhanced team summary generation"""
    if not entries:
        return "No standups submitted today"
    
    total_entries = len(entries)
    has_blockers = any(entry.get('blockers') for entry in entries)
    
    summary = f"Team completed {total_entries} standups today"
    if has_blockers:
        summary += " with some blockers reported"
    
    return summary

def summarize_blockers(blockers):
    """Enhanced blocker summarization"""
    if not blockers:
        return {'blockers': [], 'summary': 'No active blockers'}
    
    # Group by severity
    high_priority = [b for b in blockers if isinstance(b, dict) and b.get('severity') == 'high']
    medium_priority = [b for b in blockers if isinstance(b, dict) and b.get('severity') == 'medium']
    
    summary = f"{len(blockers)} total blockers"
    if high_priority:
        summary += f" ({len(high_priority)} high priority)"
    
    return {
        'blockers': blockers[:5],  # Return first 5 blockers
        'summary': summary,
        'high_priority_count': len(high_priority),
        'medium_priority_count': len(medium_priority)
    }

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
            comments_query = comments_ref.where('sprint_id', '==', sprint.id)
            comments = list(comments_query.stream())
            sprint_data['comments'] = []
            
            # Sort comments in Python instead of Firestore to avoid index requirements
            comment_list = []
            for comment in comments:
                comment_data = comment.to_dict()
                comment_data['id'] = comment.id
                comment_data['time'] = 'just now' if comment_data.get('created_at') else 'unknown'
                comment_list.append(comment_data)
            
            # Sort by created_at in descending order (newest first)
            comment_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            sprint_data['comments'] = comment_list
            
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
        
        # Validate required fields
        if not all([team_id, data.get('name'), data.get('startDate'), data.get('endDate')]):
            print("❌ Missing required fields")
            return jsonify({'success': False, 'error': 'Missing required fields: team_id, name, startDate, endDate'}), 400
        
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
        
        print(f"💾 Sprint data to save: {sprint_data}")
        
        # Try to save to Firestore with better error handling
        try:
            print("📤 Adding sprint to Firestore...")
            doc_ref = db.collection('sprints').add(sprint_data)
            sprint_id = doc_ref[1].id
            sprint_data['id'] = sprint_id
            print(f"✅ Sprint created successfully with id: {sprint_id}")
            
            # Verify the document was actually saved
            saved_doc = db.collection('sprints').document(sprint_id).get()
            if saved_doc.exists:
                print(f"✅ Verified sprint exists in database: {saved_doc.to_dict()}")
            else:
                print(f"❌ Sprint not found in database after creation!")
                
        except Exception as firestore_error:
            print(f"❌ Firestore error: {str(firestore_error)}")
            traceback.print_exc()
            return jsonify({'success': False, 'error': f'Database save failed: {str(firestore_error)}'}), 500
        
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
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to create sprint'}), 500

@app.route('/api/sprints/<sprint_id>', methods=['PUT'])
@require_auth
def update_sprint(sprint_id):
    try:
        data = request.json
        
        track_user_action('update_sprint', {'sprint_id': sprint_id})
        
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
        # Check database connection
        if not db:
            print("Database connection not available")
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        print(f"Deleting sprint: {sprint_id}")
        
        track_user_action('delete_sprint', {'sprint_id': sprint_id})
        
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        
        if not sprint_doc.exists:
            print(f"Sprint {sprint_id} not found")
            return jsonify({'error': 'Sprint not found'}), 404
        
        sprint_data = sprint_doc.to_dict()
        print(f"Deleting sprint: {sprint_data.get('name', 'Unnamed')}")
        
        # Delete the sprint
        sprint_ref.delete()
        
        # Also delete associated tasks and comments
        try:
            # Delete tasks associated with this sprint
            tasks_ref = db.collection('tasks')
            tasks_query = tasks_ref.where('sprint_id', '==', sprint_id)
            tasks = list(tasks_query.stream())
            
            for task in tasks:
                task.reference.delete()
                print(f"Deleted task: {task.id}")
            
            # Delete comments associated with this sprint
            comments_ref = db.collection('sprint_comments')
            comments_query = comments_ref.where('sprint_id', '==', sprint_id)
            comments = list(comments_query.stream())
            
            for comment in comments:
                comment.reference.delete()
                print(f"Deleted comment: {comment.id}")
                
        except Exception as cleanup_error:
            print(f"Error during cleanup: {cleanup_error}")
            # Don't fail the main delete if cleanup fails
        
        print(f"Sprint {sprint_id} deleted successfully")
        return jsonify({'success': True, 'message': 'Sprint deleted successfully'})
        
    except Exception as e:
        print(f"Error deleting sprint: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to delete sprint'}), 500

@app.route('/api/sprints/<sprint_id>/assign', methods=['POST'])
@require_auth
def assign_sprint(sprint_id):
    try:
        track_user_action('assign_sprint', {'sprint_id': sprint_id})
        
        sprint_ref = db.collection('sprints').document(sprint_id)
        sprint_doc = sprint_ref.get()
        if not sprint_doc.exists:
            return jsonify({'error': 'Sprint not found'}), 404
        sprint_ref.update({'status': 'assigned', 'assigned_at': datetime.utcnow().isoformat()})
        return jsonify({'success': True, 'message': 'Sprint assigned'})
    except Exception as e:
        print(f"Error assigning sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to assign sprint'}), 500

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
            'final_analytics': {
                'total_story_points': total_story_points,
                'completed_story_points': completed_story_points,
                'completion_percentage': round(completion_percentage, 1),
                'velocity': completed_story_points,
                'total_tasks': len(tasks)
            }
        })
        
    except Exception as e:
        print(f"Error completing sprint: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to complete sprint'}), 500

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
        
        # Only update fields that are provided
        if 'status' in data:
            update_data['status'] = data['status']
            
            # Track completion time if task is being marked as done
            if new_status == 'done' and old_status != 'done':
                created_at = old_task_data.get('created_at')
                if created_at:
                    try:
                        created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        completion_time = datetime.utcnow()
                        completion_duration = (completion_time - created_time).total_seconds() / 3600  # hours
                        update_data['completion_duration_hours'] = round(completion_duration, 2)
                        update_data['completed_at'] = datetime.utcnow().isoformat()
                    except:
                        pass
        
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
            'sprint_id': updated_task['sprint_id'],
            'status_change': {
                'old_status': old_status,
                'new_status': new_status
            } if old_status != new_status else None
        }, room=f'sprint_{updated_task["sprint_id"]}')
        
        return jsonify({'success': True, 'task': updated_task})
    except Exception as e:
        print(f"Error updating task: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to update task'}), 500

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
@require_auth
def delete_task(task_id):
    try:
        track_user_action('delete_task', {'task_id': task_id})
        
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
        comments_query = comments_ref.where('sprint_id', '==', sprint_id)
        comments = list(comments_query.stream())
        
        comment_list = []
        for comment in comments:
            comment_data = comment.to_dict()
            comment_data['id'] = comment.id
            comment_data['time'] = 'just now' if comment_data.get('created_at') else 'unknown'
            comment_list.append(comment_data)
        
        # Sort by created_at in descending order (newest first)
        comment_list.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        return jsonify({'success': True, 'comments': comment_list})
    except Exception as e:
        print(f"Error fetching comments: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch comments'}), 500

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
        
        # Enhanced AI analysis of feedback
        all_feedback = (
            retro_data['what_went_well'] + 
            retro_data['what_could_improve']
        )
        
        if all_feedback:
            feedback_text = '\n'.join(all_feedback)
            
            # Analyze sentiment of feedback
            positive_feedback = retro_data['what_went_well']
            improvement_feedback = retro_data['what_could_improve']
            
            retro_data['ai_analysis'] = {
                'feedback_count': len(all_feedback),
                'positive_items': len(positive_feedback),
                'improvement_items': len(improvement_feedback),
                'action_items_count': len(retro_data['action_items']),
                'summary': f"Team provided {len(all_feedback)} feedback items for retrospective",
                'sentiment_balance': {
                    'positive_ratio': len(positive_feedback) / len(all_feedback) if all_feedback else 0,
                    'improvement_ratio': len(improvement_feedback) / len(all_feedback) if all_feedback else 0
                },
                'key_themes': {
                    'positive': positive_feedback[:3] if positive_feedback else [],
                    'improvements': improvement_feedback[:3] if improvement_feedback else []
                }
            }
        
        # Save to Firestore
        doc_ref = db.collection('retrospectives').add(retro_data)
        
        # Emit real-time update
        socketio.emit('retrospective_created', {
            'retrospective_id': doc_ref[1].id,
            'team_id': team_id,
            'summary': retro_data.get('ai_analysis', {}).get('summary', 'New retrospective created')
        }, room=f"team_{company_id}_{team_id}")
        
        return jsonify({
            'success': True,
            'retrospective_id': doc_ref[1].id,
            'ai_analysis': retro_data.get('ai_analysis', {}),
            'message': 'Retrospective created successfully'
        })
        
    except Exception as e:
        print(f"Error creating retrospective: {str(e)}")
        traceback.print_exc()
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
        
        track_user_action('view_retrospectives', {'team_id': team_id}, team_id)
        
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
                if hasattr(retro_data['created_at'], 'isoformat'):
                    retro_data['created_at'] = retro_data['created_at'].isoformat()
                elif hasattr(retro_data['created_at'], 'timestamp'):
                    retro_data['created_at'] = datetime.fromtimestamp(retro_data['created_at'].timestamp()).isoformat()
            retro_list.append(retro_data)
        
        return jsonify({
            'success': True,
            'retrospectives': retro_list
        })
        
    except Exception as e:
        print(f"Error fetching retrospectives: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch retrospectives'}), 500

# Singular retrospective route (for frontend compatibility)
@app.route('/api/retrospective', methods=['POST'])
@require_auth
def submit_retrospective_feedback():
    """Submit individual retrospective feedback"""
    try:
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
        
        feedback_data = {
            'team_id': team_id,
            'company_id': company_id,
            'sprint_id': data.get('sprint_id', 'current'),
            'feedback': data.get('feedback', ''),
            'category': data.get('category', 'went_well'),
            'anonymous': data.get('anonymous', True),
            'created_by': request.user_id if not data.get('anonymous') else None,
            'created_at': firestore.SERVER_TIMESTAMP
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
        
        # Emit real-time update
        socketio.emit('retrospective_feedback_added', {
            'feedback_id': doc_ref[1].id,
            'team_id': team_id,
            'category': category,
            'anonymous': feedback_data['anonymous']
        }, room=f"team_{company_id}_{team_id}")
        
        return jsonify({
            'success': True,
            'feedback_id': doc_ref[1].id,
            'analysis': analysis,
            'message': 'Feedback submitted successfully'
        })
        
    except Exception as e:
        print(f"Error submitting retrospective feedback: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to submit feedback'}), 500

# ===== HEALTH AND UTILITY ROUTES =====

@app.route('/health', methods=['GET'])
def railway_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

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

# ===== ANALYTICS ROUTES =====

@app.route('/api/analytics/overview', methods=['GET'])
@require_auth
def get_analytics_overview():
    """Get comprehensive analytics overview for a team"""
    try:
        team_id = request.args.get('team_id')
        company_id = request.company_id
        days = int(request.args.get('days', 30))
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_analytics', {'team_id': team_id, 'days': days}, team_id)
        
        # Verify team access
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Get all analytics metrics
        velocity_data = calculate_sprint_velocity(team_id, company_id)
        completion_data = calculate_completion_rates(team_id, company_id, days)
        blocker_data = analyze_blocker_metrics(team_id, company_id, days)
        productivity_data = get_productivity_trends(team_id, company_id, days)
        
        # Get user activity metrics
        analytics_ref = db.collection('user_analytics')
        activity_query = analytics_ref.where('team_id', '==', team_id)\
                                    .where('company_id', '==', company_id)\
                                    .order_by('timestamp', direction=firestore.Query.DESCENDING)\
                                    .limit(100)
        
        recent_activity = list(activity_query.stream())
        
        # Process activity data
        activity_summary = {
            'total_actions': len(recent_activity),
            'unique_users': len(set(a.to_dict().get('user_id') for a in recent_activity)),
            'action_types': Counter(a.to_dict().get('action_type') for a in recent_activity)
        }
        
        analytics_overview = {
            'team_id': team_id,
            'period_days': days,
            'last_updated': datetime.utcnow().isoformat(),
            'sprint_velocity': velocity_data,
            'completion_rates': completion_data,
            'blocker_analysis': blocker_data,
            'productivity_trends': productivity_data,
            'user_activity': activity_summary
        }
        
        return jsonify({
            'success': True,
            'analytics': analytics_overview
        })
        
    except Exception as e:
        print(f"Error fetching analytics overview: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to fetch analytics'}), 500

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
        
        track_user_action('submit_standup', {'team_id': team_id}, team_id)
        
        # Verify team belongs to current company
        team_ref = db.collection('teams').document(team_id)
        team_doc = team_ref.get()
        if not team_doc.exists or team_doc.to_dict().get('company_id') != company_id:
            return jsonify({'error': 'Team not found or access denied'}), 403
        
        # Enhanced blocker and sentiment analysis
        full_text = f"{data.get('yesterday', '')} {data.get('today', '')} {data.get('blockers', '')}"
        blocker_analysis = detect_blockers(full_text)
        sentiment_analysis = analyze_sentiment(full_text)
        
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
            'date': datetime.utcnow().strftime('%Y-%m-%d'),
            'blocker_analysis': blocker_analysis,
            'sentiment': sentiment_analysis
        }
        
        # Save to Firestore
        doc_ref = db.collection('standups').add(standup_data)
        standup_id = doc_ref[1].id
        
        # Get today's standups for the team in current company
        today = datetime.utcnow().strftime('%Y-%m-%d')
        team_standups = db.collection('standups').where('team_id', '==', team_id)\
                         .where('company_id', '==', company_id)\
                         .where('date', '==', today).get()
        
        standup_entries = []
        for doc in team_standups:
            entry = doc.to_dict()
            standup_entries.append({
                'user': entry.get('user_email', 'Unknown'),
                'yesterday': entry.get('yesterday', ''),
                'today': entry.get('today', ''),
                'blockers': entry.get('blockers', '')
            })
        
        # Generate enhanced team summary
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
                'blocker': data.get('blockers', '') if data.get('blockers', '') else None,
                'sentiment': sentiment_analysis.get('sentiment')
            },
            'timestamp': datetime.utcnow().isoformat()
        }
        broadcast_activity(company_id, team_id, activity_data)
        
        # Send notification for high-priority blockers
        if blocker_analysis.get('severity') in ['high', 'medium']:
            notification_data = {
                'type': 'warning' if blocker_analysis.get('severity') == 'high' else 'info',
                'title': f"{blocker_analysis.get('severity').title()} Priority Blocker Detected",
                'message': f"{request.user_email.split('@')[0]} reported {blocker_analysis.get('severity')} priority blockers",
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
        print(f"Error submitting standup: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

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
                            'blocker': blocker,
                            'severity': severity
                        })
                
                # Collect sentiment data
                sentiment = entry.get('sentiment', {})
                sentiment_value = sentiment.get('sentiment', 'neutral')
                all_sentiments.append(sentiment_value)
                sentiment_data[sentiment_value] += 1
            
            # Generate enhanced team summary
            if len(standup_entries) > 1:
                team_summary = summarize_standups(standup_entries)
        
        # Calculate overall team sentiment
        total_sentiments = sum(sentiment_data.values())
        sentiment_percentages = {
            k: round((v / total_sentiments * 100), 1) if total_sentiments > 0 else 0 
            for k, v in sentiment_data.items()
        }
        
        # Get quick analytics for dashboard
        velocity_data = calculate_sprint_velocity(team_id, company_id, 3)
        completion_data = calculate_completion_rates(team_id, company_id, 7)
        
        dashboard_data = {
            'standup_count': standup_count,
            'team_summary': team_summary,
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
            'websocket': 'enabled',
            'analytics': 'enabled'
        }
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
        # Check database connection
        if not db:
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
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

if __name__ == '__main__':
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('PORT', 5000))
    host = '0.0.0.0'
    
    print(f"Starting Upstand server on {host}:{port}")
    print(f"Debug mode: {debug_mode}")
    print(f"Allowed origins: {allowed_origins}")
    print(f"Firebase status: {'Connected' if db else 'Not connected'}")
    print(f"WebSocket support: {socketio.server.eio.async_mode}")
    print(f"Analytics: Enabled")
    print(f"Features: User tracking, Sprint velocity, Task completion rates, Blocker analysis, Productivity trends")
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)