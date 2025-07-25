"""
Upstand Backend - AI-Powered Agile Scrum Assistant
Main Flask application with routes for standup meetings, sprint planning, and retrospectives
"""

import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, auth
from dotenv import load_dotenv
import openai
from functools import wraps
import json

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "https://your-app.vercel.app"])

# Initialize Firebase Admin SDK
cred = credentials.Certificate(os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY'))
firebase_admin.initialize_app(cred)
db = firestore.client()

# Initialize OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')

# Authentication decorator
def require_auth(f):
    """Decorator to verify Firebase Auth token"""
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
        except Exception as e:
            return jsonify({'error': 'Invalid authorization token', 'details': str(e)}), 401
        
        return f(*args, **kwargs)
    return decorated_function

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
    
    Return a JSON object with:
    - has_blockers: boolean
    - blockers: array of identified blockers (empty if none)
    - severity: "none", "low", "medium", or "high"
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert at identifying project blockers. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=200
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"has_blockers": False, "blockers": [], "severity": "none", "error": str(e)}

def analyze_sentiment(text):
    """Analyze sentiment of text using GPT"""
    prompt = f"""
    Analyze the sentiment of the following text and return a JSON object with:
    - sentiment: "positive", "neutral", or "negative"
    - score: float between -1 (very negative) and 1 (very positive)
    - confidence: float between 0 and 1
    
    Text: {text}
    """
    
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a sentiment analysis expert. Return only valid JSON."},
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

# Routes
@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'services': {
            'firebase': 'connected',
            'openai': 'configured'
        }
    })

@app.route('/api/submit-standup', methods=['POST'])
@require_auth
def submit_standup():
    """Submit daily standup and receive AI summary"""
    try:
        data = request.json
        team_id = data.get('team_id')
        
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Create standup entry
        standup_data = {
            'user_id': request.user_id,
            'user_email': request.user_email,
            'team_id': team_id,
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
        
        # Get today's standups for the team
        today = datetime.utcnow().strftime('%Y-%m-%d')
        team_standups = db.collection('standups').where('team_id', '==', team_id).where('date', '==', today).get()
        
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
        
        return jsonify({
            'success': True,
            'standup_id': doc_ref[1].id,
            'blocker_analysis': blocker_analysis,
            'sentiment': sentiment_analysis,
            'team_summary': team_summary,
            'team_standup_count': len(standup_entries)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/create-sprint', methods=['POST'])
@require_auth
def create_sprint():
    """Create a new sprint"""
    try:
        data = request.json
        
        sprint_data = {
            'team_id': data.get('team_id'),
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

@app.route('/api/get-dashboard', methods=['GET'])
@require_auth
def get_dashboard():
    """Get dashboard data for a team"""
    try:
        team_id = request.args.get('team_id')
        if not team_id:
            return jsonify({'error': 'team_id is required'}), 400
        
        # Get today's standups
        today = datetime.utcnow().strftime('%Y-%m-%d')
        today_standups = db.collection('standups').where('team_id', '==', team_id).where('date', '==', today).get()
        
        standup_entries = []
        blockers = []
        sentiments = []
        
        for doc in today_standups:
            entry = doc.to_dict()
            standup_entries.append(entry)
            
            # Collect blockers
            if entry.get('blocker_analysis', {}).get('has_blockers'):
                blockers.extend(entry.get('blocker_analysis', {}).get('blockers', []))
            
            # Collect sentiments
            if entry.get('sentiment', {}).get('score') is not None:
                sentiments.append(entry.get('sentiment', {}).get('score'))
        
        # Calculate average sentiment
        avg_sentiment = sum(sentiments) / len(sentiments) if sentiments else 0
        
        # Get active sprint
        active_sprint = db.collection('sprints').where('team_id', '==', team_id).where('status', '==', 'active').limit(1).get()
        sprint_data = None
        if active_sprint:
            sprint_data = active_sprint[0].to_dict()
            sprint_data['id'] = active_sprint[0].id
        
        # Generate team summary if we have standups
        team_summary = ""
        if standup_entries:
            formatted_entries = [{
                'user': entry.get('user_email', 'Unknown'),
                'yesterday': entry.get('yesterday', ''),
                'today': entry.get('today', ''),
                'blockers': entry.get('blockers', '')
            } for entry in standup_entries]
            team_summary = summarize_standups(formatted_entries)
        
        return jsonify({
            'standup_count': len(standup_entries),
            'team_summary': team_summary,
            'active_blockers': blockers,
            'average_sentiment': avg_sentiment,
            'sentiment_label': 'positive' if avg_sentiment > 0.3 else 'negative' if avg_sentiment < -0.3 else 'neutral',
            'active_sprint': sprint_data,
            'last_updated': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/retrospective', methods=['POST'])
@require_auth
def submit_retrospective():
    """Submit and analyze retrospective feedback"""
    try:
        data = request.json
        team_id = data.get('team_id')
        sprint_id = data.get('sprint_id')
        
        if not team_id or not sprint_id:
            return jsonify({'error': 'team_id and sprint_id are required'}), 400
        
        # Save individual feedback
        feedback_data = {
            'team_id': team_id,
            'sprint_id': sprint_id,
            'user_id': request.user_id,
            'feedback': data.get('feedback', ''),
            'category': data.get('category', 'general'),  # went_well, could_improve, action_items
            'anonymous': data.get('anonymous', True),
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        
        db.collection('retrospectives').add(feedback_data)
        
        # Get all feedback for this sprint
        all_feedback = db.collection('retrospectives').where('sprint_id', '==', sprint_id).get()
        
        feedback_list = []
        for doc in all_feedback:
            entry = doc.to_dict()
            feedback_list.append({
                'feedback': entry.get('feedback', ''),
                'category': entry.get('category', 'general')
            })
        
        # Analyze feedback if we have enough entries
        analysis = {}
        if len(feedback_list) >= 3:
            analysis = cluster_retrospective_feedback(feedback_list)
        
        return jsonify({
            'success': True,
            'feedback_count': len(feedback_list),
            'analysis': analysis,
            'message': 'Retrospective feedback submitted successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams', methods=['GET'])
@require_auth
def get_teams():
    """Get teams for the current user"""
    try:
        # Get user's teams
        user_teams = db.collection('team_members').where('user_id', '==', request.user_id).get()
        
        teams = []
        for doc in user_teams:
            member_data = doc.to_dict()
            team_id = member_data.get('team_id')
            
            # Get team details
            team_doc = db.collection('teams').document(team_id).get()
            if team_doc.exists:
                team_data = team_doc.to_dict()
                team_data['id'] = team_id
                team_data['role'] = member_data.get('role', 'member')
                teams.append(team_data)
        
        return jsonify({'teams': teams})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/teams', methods=['POST'])
@require_auth
def create_team():
    """Create a new team"""
    try:
        data = request.json
        
        team_data = {
            'name': data.get('name'),
            'description': data.get('description', ''),
            'created_by': request.user_id,
            'created_at': firestore.SERVER_TIMESTAMP
        }
        
        if not team_data['name']:
            return jsonify({'error': 'Team name is required'}), 400
        
        # Create team
        team_ref = db.collection('teams').add(team_data)
        team_id = team_ref[1].id
        
        # Add creator as admin
        db.collection('team_members').add({
            'team_id': team_id,
            'user_id': request.user_id,
            'role': 'admin',
            'joined_at': firestore.SERVER_TIMESTAMP
        })
        
        return jsonify({
            'success': True,
            'team_id': team_id,
            'message': 'Team created successfully'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)