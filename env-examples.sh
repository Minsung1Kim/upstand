# server/.env.example
# Flask Backend Environment Variables

# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Firebase Admin SDK
# Download service account key from Firebase Console and save as JSON file
FIREBASE_SERVICE_ACCOUNT_KEY=./firebase-service-account.json

# Flask Configuration
FLASK_SECRET_KEY=your_secret_key_here
FLASK_ENV=development
FLASK_DEBUG=True

# CORS Origins (comma-separated)
CORS_ORIGINS=http://localhost:3000,https://your-app.vercel.app

---

# client/.env.example
# React Frontend Environment Variables

# Firebase Web App Configuration
# Get these values from Firebase Console > Project Settings > Web App
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# Backend API URL
REACT_APP_API_URL=http://localhost:5000/api

# Optional: Analytics
REACT_APP_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX