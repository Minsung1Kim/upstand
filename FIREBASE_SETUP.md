# Firebase Setup Guide for Google Sign-In

## Issue: Google Sign-In Opens and Immediately Closes

This usually means your Firebase environment variables are missing or incorrect.

## Quick Fix Steps:

### 1. Create Environment File
Create a file called `.env` in the `client` folder:

```bash
# Navigate to client folder
cd client

# Create .env file
touch .env  # Mac/Linux
# OR
type nul > .env  # Windows
```

### 2. Get Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create one)
3. Click ⚙️ Settings → Project Settings
4. Scroll down to "Your apps" section
5. Click on the Web app (or add one if none exists)
6. Copy the configuration values

### 3. Add to .env File

```env
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=AIzaSyC...
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=1:123456789:web:abcdef

# Backend API URL (for local development)
REACT_APP_API_URL=http://localhost:5000/api
```

### 4. Enable Google Sign-In in Firebase

1. Go to Firebase Console → Authentication
2. Click "Sign-in method" tab
3. Click "Google" provider
4. Toggle "Enable"
5. Add your domain to "Authorized domains":
   - `localhost` (for development)
   - Your production domain (if deploying)

### 5. Restart Development Server

```bash
# Stop the server (Ctrl+C)
# Then restart
npm start
```

## Troubleshooting

### Check Your Configuration Status
- Look for the Firebase Debug panel in the bottom-right corner of the login page
- Check browser console for detailed error messages

### Common Errors:

**Error**: `auth/unauthorized-domain`
**Fix**: Add `localhost` to Authorized domains in Firebase Console

**Error**: `auth/operation-not-allowed`
**Fix**: Enable Google sign-in provider in Firebase Console

**Error**: `auth/invalid-api-key`
**Fix**: Double-check your API key in the .env file

**Error**: Popup closes immediately
**Fix**: Usually missing environment variables

### Verify Setup
1. The debug panel should show ✓ for all Firebase config items
2. Browser console should show "Firebase initialized successfully"
3. Google sign-in should open popup with Google login form

## Demo Account Alternative

If you can't set up Google sign-in right now, you can:

1. Click "Sign up here" on login page
2. Create a regular account with any email
3. Use that account for testing

The demo account (`demo@upstand.dev`) needs to be created manually in Firebase Console → Authentication → Users → Add User.