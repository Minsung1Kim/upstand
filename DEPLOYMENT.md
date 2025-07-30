# 🚀 Upstand Deployment Guide

## Quick Answer: Vercel + Railway/Render

**Frontend** → Vercel ✅  
**Backend** → Railway/Render/Heroku ✅

## Why Not Full Vercel?

❌ **Vercel Limitations:**
- No persistent WebSocket connections
- Serverless functions only (your app needs always-on server)
- Cold starts break real-time features
- No Socket.IO support

## 📋 Deployment Steps

### 1. Deploy Backend (Choose One)

#### Option A: Railway (Recommended)
```bash
# 1. Connect your GitHub repo to Railway
# 2. Set environment variables in Railway dashboard:
FLASK_DEBUG=False
SECRET_KEY=your-secret-key-here
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...} # JSON string
OPENAI_API_KEY=your-openai-key
ALLOWED_ORIGINS=https://your-frontend.vercel.app
PORT=$PORT
HOST=0.0.0.0

# 3. Railway will auto-deploy from server/ directory
```

#### Option B: Render
```bash
# 1. Connect GitHub repo to Render
# 2. Use render.yaml configuration (already created)
# 3. Set environment variables in Render dashboard
```

#### Option C: Heroku
```bash
# 1. Install Heroku CLI
heroku create your-app-backend
heroku config:set FLASK_DEBUG=False
heroku config:set SECRET_KEY=your-secret-key
heroku config:set FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
heroku config:set OPENAI_API_KEY=your-openai-key
heroku config:set ALLOWED_ORIGINS=https://your-frontend.vercel.app
git subtree push --prefix server heroku main
```

### 2. Deploy Frontend to Vercel

```bash
# 1. Connect GitHub repo to Vercel
# 2. Set build settings:
#    Build Command: cd client && npm run build
#    Output Directory: client/build
#    Install Command: cd client && npm install

# 3. Set environment variables in Vercel dashboard:
REACT_APP_API_BASE_URL=https://your-backend.railway.app/api
REACT_APP_WEBSOCKET_URL=https://your-backend.railway.app
REACT_APP_FIREBASE_API_KEY=your-firebase-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

### 3. Update CORS After Deployment

Once frontend is deployed, update backend environment:
```bash
ALLOWED_ORIGINS=https://your-actual-frontend.vercel.app
```

## 🔧 Environment Variables Reference

### Backend (.env)
```env
# Flask Config
FLASK_DEBUG=False
SECRET_KEY=your-secret-key-here
HOST=0.0.0.0
PORT=5000

# CORS
ALLOWED_ORIGINS=https://your-frontend.vercel.app

# Firebase (JSON string for deployment)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

### Frontend (Vercel Environment Variables)
```env
REACT_APP_API_BASE_URL=https://your-backend.railway.app/api
REACT_APP_WEBSOCKET_URL=https://your-backend.railway.app
REACT_APP_FIREBASE_API_KEY=your-firebase-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_APP_ID=your-app-id
```

## 🧪 Testing Deployment

### Health Check Endpoints
- Backend: `https://your-backend.railway.app/api/health`
- Frontend: `https://your-frontend.vercel.app`

### Real-time Features Test
1. Open app in two browsers
2. Submit a standup in one
3. Check if it appears in real-time in the other

## 💰 Costs (Approximate)

- **Railway**: $5/month (hobby plan)
- **Render**: $7/month (starter plan)
- **Heroku**: $7/month (basic dyno)
- **Vercel**: Free (frontend only)

## 🎯 Deployment Summary

✅ **Works:** Frontend on Vercel + Backend on Railway/Render  
❌ **Doesn't Work:** Full stack on Vercel (WebSocket limitations)  
🔥 **Best Option:** Railway for backend (easiest WebSocket support)

Your real-time features will work perfectly with this setup!