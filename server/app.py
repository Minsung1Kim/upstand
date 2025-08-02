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
allowed_origins_env = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,https://upstand-omega.vercel.app')
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

# Simple analytics tracking
def track_user_action(action, metadata=None, team_id=None):
    """Simple user action tracking"""
    try:
        if not db:
            return
        
        user_id = getattr(request, 'user_id', 'anonymous')
        company_id = getattr(request, 'company_id', 'default')
        
        analytics_data = {
            'user_id': user_id,
            'company_id': company_id,
            'team_id': team_id,
            'action': action,
            'metadata': metadata or {},
            'timestamp': datetime.utcnow().isoformat()
        }
        
        db.collection('user_analytics').add(analytics_data)
        print(f"Tracked: {action}")
        
    except Exception as e:
        print(f"Analytics error: {str(e)}")

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
    """Get all teams for current user"""
    try:
        if not db:
            return jsonify({'error': 'Database connection not available'}), 503
            
        user_id = request.user_id
        company_id = request.company_id
        
        track_user_action('view_teams', {'company_id': company_id})
        
        teams_ref = db.collection('teams')
        query = teams_ref.where('members', 'array_contains', user_id).where('company_id', '==', company_id)
        teams = query.stream()
        
        team_list = []
        for team in teams:
            team_data = team.to_dict()
            team_data['id'] = team.id
            
            user_role = team_data.get('member_roles', {}).get(user_id, 'DEVELOPER')
            member_count = len(team_data.get('members', []))
            
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
        
        return jsonify({'success': True, 'teams': team_list})
        
    except Exception as e:
        print(f"Error fetching teams: {str(e)}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to fetch teams'}), 500

@app.route('/api/teams', methods=['POST'])
@require_auth
def create_team():
    """Create a new team"""
    try:
        if not db:
            return jsonify({'success': False, 'error': 'Database connection not available'}), 503
            
        user_id = request.user_id
        user_email = request.user_email
        company_id = request.company_id
        
        data = request.get_json()
        team_name = data.get('name', '').strip()
        
        if not team_name:
            return jsonify({'success': False, 'error': 'Team name is required'}), 400
        
        track_user_action('create_team', {'team_name': team_name})
        
        team_doc = {
            'name': team_name,
            'description': data.get('description', ''),
            'owner_id': user_id,
            'company_id': company_id,
            'members': [user_id],
            'member_roles': {user_id: 'OWNER'},
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        teams_ref = db.collection('teams')
        team_ref = teams_ref.add(team_doc)
        team_id = team_ref[1].id
        
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
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Failed to create team'}), 500

# ===== SPRINT ROUTES =====

@app.route('/api/sprints', methods=['GET'])
@require_auth
def get_sprints():
    """Get sprints for a team"""
    try:
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
            
            total_story_points = 0
            completed_story_points = 0
            task_counts = {'todo': 0, 'in_progress': 0, 'done': 0}
            
            for task in tasks:
                task_data = task.to_dict()
                task_data['id'] = task.id
                sprint_data['tasks'].append(task_data)
                
                story_points = task_data.get('estimate', 1)
                status = task_data.get('status', 'todo')
                
                total_story_points += story_points
                task_counts[status] = task_counts.get(status, 0) + 1
                
                if status == 'done':
                    completed_story_points += story_points
            
            completion_percentage = (completed_story_points / total_story_points * 100) if total_story_points > 0 else 0
            
            sprint_data['analytics'] = {
                'total_story_points': total_story_points,
                'completed_story_points': completed_story_points,
                'completion_percentage': round(completion_percentage, 1),
                'task_counts': task_counts,
                'total_tasks': len(tasks)
            }
            
            # Get comments
            comments_ref = db.collection('sprint_comments')
            comments_query = comments_ref.where('sprint_id', '==', sprint.id).limit(20)
            comments = list(comments_query.stream())
            sprint_data['comments'] = []
            for comment in comments:
                comment_data = comment.to_dict()
                comment_data['id'] = comment.id
                comment_data['time'] = 'just now'
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
    """Create a new sprint"""
    try:
        data = request.json
        company_id = request.company_id
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('create_sprint', {'team_id': team_id}, team_id)
        
        required_fields = ['name', 'startDate', 'endDate']
        for field in required_fields:
            if not data.get(field):
                return jsonify({'error': f'{field} is required'}), 400
        
        sprint_data = {
            'team_id': team_id,
            'company_id': company_id,
            'name': data.get('name').strip(),
            'start_date': data.get('startDate'),
            'end_date': data.get('endDate'),
            'goals': [goal.strip() for goal in data.get('goals', []) if goal.strip()],
            'created_by': request.user_id,
            'created_at': datetime.utcnow().isoformat(),
            'status': 'active'
        }
        
        doc_ref = db.collection('sprints').add(sprint_data)
        sprint_data['id'] = doc_ref[1].id
        
        sprint_data['analytics'] = {
            'total_story_points': 0,
            'completed_story_points': 0,
            'completion_percentage': 0,
            'task_counts': {'todo': 0, 'in_progress': 0, 'done': 0},
            'total_tasks': 0
        }
        sprint_data['tasks'] = []
        sprint_data['comments'] = []
        
        return jsonify({'success': True, 'sprint': sprint_data})
    except Exception as e:
        print(f"Error creating sprint: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create sprint'}), 500

@app.route('/api/sprints/<sprint_id>', methods=['PUT'])
@require_auth
def update_sprint(sprint_id):
    """Update sprint"""
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

# ===== TASK ROUTES =====

@app.route('/api/tasks', methods=['POST'])
@require_auth
def create_task():
    """Create a new task"""
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
    """Update task"""
    try:
        data = request.json
        track_user_action('update_task', {'task_id': task_id, 'new_status': data.get('status')})
        
        task_ref = db.collection('tasks').document(task_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({'error': 'Task not found'}), 404
        
        old_task_data = task_doc.to_dict()
        old_status = old_task_data.get('status')
        new_status = data.get('status')
        
        update_data = {'updated_at': datetime.utcnow().isoformat()}
        
        if 'status' in data:
            update_data['status'] = data['status']
        if 'assignee' in data:
            update_data['assignee'] = data['assignee']
        if 'title' in data:
            update_data['title'] = data['title']
        if 'estimate' in data:
            update_data['estimate'] = int(data['estimate'])
        
        task_ref.update(update_data)
        
        updated_task_doc = task_ref.get()
        updated_task = updated_task_doc.to_dict()
        updated_task['id'] = task_id
        
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
    """Delete task"""
    try:
        track_user_action('delete_task', {'task_id': task_id})
        
        task_ref = db.collection('tasks').document(task_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({'error': 'Task not found'}), 404
        
        task_data = task_doc.to_dict()
        sprint_id = task_data.get('sprint_id')
        
        task_ref.delete()
        
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
    """Add comment to sprint"""
    try:
        data = request.json
        company_id = request.company_id
        
        track_user_action('add_comment', {'sprint_id': sprint_id})
        
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
        comment_data['time'] = 'just now'
        
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
    """Get sprint comments"""
    try:
        track_user_action('view_comments', {'sprint_id': sprint_id})
        
        comments_ref = db.collection('sprint_comments')
        comments_query = comments_ref.where('sprint_id', '==', sprint_id).limit(50)
        comments = list(comments_query.stream())
        
        comment_list = []
        for comment in comments:
            comment_data = comment.to_dict()
            comment_data['id'] = comment.id
            comment_data['time'] = 'just now'
            comment_list.append(comment_data)
        
        return jsonify({'success': True, 'comments': comment_list})
    except Exception as e:
        print(f"Error fetching comments: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch comments'}), 500

# ===== RETROSPECTIVE ROUTES =====

@app.route('/api/retrospectives', methods=['POST'])
@require_auth
def create_retrospective():
    """Create retrospective"""
    try:
        data = request.get_json()
        company_id = request.company_id
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('create_retrospective', {'team_id': team_id}, team_id)
        
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
        
        # Simple analysis
        all_feedback = (
            retro_data['what_went_well'] + 
            retro_data['what_could_improve'] +
            retro_data['action_items']
        )
        
        if all_feedback:
            retro_data['ai_analysis'] = {
                'feedback_count': len(all_feedback),
                'positive_items': len(retro_data['what_went_well']),
                'improvement_items': len(retro_data['what_could_improve']),
                'action_items_count': len(retro_data['action_items']),
                'summary': f"Team provided {len(all_feedback)} feedback items"
            }
        
        doc_ref = db.collection('retrospectives').add(retro_data)
        retro_id = doc_ref[1].id
        
        socketio.emit('retrospective_created', {
            'retrospective_id': retro_id,
            'team_id': team_id,
            'summary': retro_data.get('ai_analysis', {}).get('summary', 'New retrospective created')
        }, room=f"team_{company_id}_{team_id}")
        
        return jsonify({
            'success': True,
            'retrospective_id': retro_id,
            'ai_analysis': retro_data.get('ai_analysis', {}),
            'message': 'Retrospective created successfully'
        })
        
    except Exception as e:
        print(f"Error creating retrospective: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to create retrospective'}), 500

@app.route('/api/retrospectives', methods=['GET'])
@require_auth
def get_retrospectives():
    """Get retrospectives"""
    try:
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_retrospectives', {'team_id': team_id}, team_id)
        
        retros_ref = db.collection('retrospectives')
        query = retros_ref.where('team_id', '==', team_id).where('company_id', '==', company_id).limit(10)
        retros = query.stream()
        
        retro_list = []
        for retro in retros:
            retro_data = retro.to_dict()
            retro_data['id'] = retro.id
            
            if 'created_at' in retro_data and retro_data['created_at']:
                if hasattr(retro_data['created_at'], 'isoformat'):
                    retro_data['created_at'] = retro_data['created_at'].isoformat()
                elif hasattr(retro_data['created_at'], 'timestamp'):
                    retro_data['created_at'] = datetime.fromtimestamp(retro_data['created_at'].timestamp()).isoformat()
            
            retro_list.append(retro_data)
        
        return jsonify({'success': True, 'retrospectives': retro_list})
        
    except Exception as e:
        print(f"Error fetching retrospectives: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch retrospectives'}), 500

# Individual retrospective feedback route for compatibility
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
        
        feedback_text = feedback_data['feedback']
        category = feedback_data['category']
        
        analysis = {
            'summary': f"Team member provided {category.replace('_', ' ')} feedback",
            'category': category
        }
        
        doc_ref = db.collection('retrospective_feedback').add(feedback_data)
        
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
        return jsonify({'success': False, 'error': 'Failed to submit feedback'}), 500

# ===== STANDUP ROUTES =====

@app.route('/api/submit-standup', methods=['POST'])
@require_auth
def submit_standup():
    """Submit daily standup"""
    try:
        data = request.json
        team_id = data.get('team_id')
        company_id = request.company_id
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('submit_standup', {'team_id': team_id}, team_id)
        
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
        
        doc_ref = db.collection('standups').add(standup_data)
        standup_id = doc_ref[1].id
        
        return jsonify({'success': True, 'standup_id': standup_id})
        
    except Exception as e:
        print(f"Error submitting standup: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/dashboard', methods=['GET'])
@require_auth
def get_dashboard():
    """Get dashboard data"""
    try:
        user_id = request.user_id
        company_id = request.company_id
        team_id = request.args.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        track_user_action('view_dashboard', {'team_id': team_id}, team_id)
        
        today = datetime.utcnow().strftime('%Y-%m-%d')
        
        # Get today's standups for the team
        team_standups = db.collection('standups').where('team_id', '==', team_id)\
                         .where('company_id', '==', company_id)\
                         .where('date', '==', today).get()
        
        standup_count = len(list(team_standups))
        
        dashboard_data = {
            'standup_count': standup_count,
            'team_summary': f"Team completed {standup_count} standups today" if standup_count > 0 else "No standups submitted today"
        }
        
        return jsonify({'success': True, 'dashboard': dashboard_data})
        
    except Exception as e:
        print(f"Error fetching dashboard data: {str(e)}")
        return jsonify({'success': False, 'error': 'Failed to fetch dashboard data'}), 500

# ===== HEALTH AND UTILITY ROUTES =====

@app.route('/health', methods=['GET'])
def railway_health():
    return jsonify({'status': 'healthy', 'service': 'upstand-backend'})

@app.route('/api/health', methods=['GET'])
def api_health():
    return jsonify({
        'status': 'healthy', 
        'service': 'upstand-backend-api',
        'timestamp': datetime.utcnow().isoformat(),
        'firebase': 'connected' if db else 'disconnected'
    })

@app.route('/cors-test', methods=['GET', 'OPTIONS'])
def cors_test():
    return jsonify({
        'message': 'CORS test successful',
        'allowed_origins': allowed_origins,
        'request_origin': request.headers.get('Origin', 'No origin header')
    })

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

@socketio.on('join_sprint')
def handle_join_sprint(data):
    sprint_id = data.get('sprint_id')
    if sprint_id:
        room = f"sprint_{sprint_id}"
        join_room(room)
        print(f"Client {request.sid} joined sprint room: {room}")
        emit('sprint_joined', {'sprint_id': sprint_id})

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
    host = os.getenv('HOST', '0.0.0.0')
    
    print("=" * 50)
    print("🚀 UPSTAND BACKEND SERVER")
    print("=" * 50)
    print(f"Server: http://{host}:{port}")
    print(f"Debug: {debug_mode}")
    print(f"Origins: {allowed_origins}")
    print(f"Firebase: {'✅ Connected' if db else '❌ Not connected'}")
    print("=" * 50)
    
    socketio.run(app, 
                debug=debug_mode, 
                port=port, 
                host=host, 
                allow_unsafe_werkzeug=True)