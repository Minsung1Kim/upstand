from flask import Blueprint, request, jsonify
from functools import wraps
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore
from datetime import datetime

teams_bp = Blueprint('teams', __name__)

# Initialize Firestore client
db = firestore.client()

def verify_token(f):
    """Decorator to verify Firebase token"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        try:
            # Remove 'Bearer ' prefix
            token = token.replace('Bearer ', '')
            decoded_token = firebase_auth.verify_id_token(token)
            request.current_user = decoded_token
            return f(*args, **kwargs)
        except Exception as e:
            return jsonify({'error': 'Invalid token'}), 401
    
    return decorated_function

# GET /api/teams - Get all teams for current user
@teams_bp.route('', methods=['GET'])
@verify_token
def get_teams():
    try:
        user_id = request.current_user['uid']
        
        # Query teams where user is a member
        teams_ref = db.collection('teams')
        query = teams_ref.where('members', 'array_contains', user_id)
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
                    owner_user = firebase_auth.get_user(owner_id)
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

# POST /api/teams - Create a new team
@teams_bp.route('', methods=['POST'])
@verify_token
def create_team():
    try:
        user_id = request.current_user['uid']
        user_email = request.current_user.get('email', 'Unknown')
        
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
            'company_id': data.get('company_id', 'default'),
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

# GET /api/teams/<team_id> - Get specific team details
@teams_bp.route('/<team_id>', methods=['GET'])
@verify_token
def get_team(team_id):
    try:
        user_id = request.current_user['uid']
        
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
                member_user = firebase_auth.get_user(member_id)
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

# PUT /api/teams/<team_id> - Update team (owner only)
@teams_bp.route('/<team_id>', methods=['PUT'])
@verify_token
def update_team(team_id):
    try:
        user_id = request.current_user['uid']
        
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
                'error': 'Access denied - only team owner can update team'
            }), 403
        
        # Update team data
        data = request.get_json()
        updates = {}
        
        if 'name' in data:
            name = data['name'].strip()
            if not name:
                return jsonify({
                    'success': False,
                    'error': 'Team name cannot be empty'
                }), 400
            updates['name'] = name
        
        if 'description' in data:
            updates['description'] = data['description']
        
        if updates:
            updates['updated_at'] = datetime.utcnow().isoformat()
            team_ref.update(updates)
        
        return jsonify({
            'success': True,
            'message': 'Team updated successfully'
        })
        
    except Exception as e:
        print(f"Error updating team: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to update team'
        }), 500

# DELETE /api/teams/<team_id> - Delete team (owner only)
@teams_bp.route('/<team_id>', methods=['DELETE'])
@verify_token
def delete_team(team_id):
    try:
        user_id = request.current_user['uid']
        
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

# POST /api/teams/<team_id>/join - Join a team
@teams_bp.route('/<team_id>/join', methods=['POST'])
@verify_token
def join_team(team_id):
    try:
        user_id = request.current_user['uid']
        
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

# POST /api/teams/<team_id>/leave - Leave a team
@teams_bp.route('/<team_id>/leave', methods=['POST'])
@verify_token
def leave_team(team_id):
    try:
        user_id = request.current_user['uid']
        
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