/**
 * Login Page Component
 * Handles user authentication with email/password and Google
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { colors } from '../utils/colors';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import FirebaseDebug from '../components/debug/FirebaseDebug';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { login, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  // Demo account credentials
  const DEMO_EMAIL = 'demo@upstand.dev';
  const DEMO_PASSWORD = 'demo123456';

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setError('');
      setLoading(true);
      await login(email, password);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to log in. Please check your credentials.');
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      setGoogleLoading(true);
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (error) {
      console.error('Google sign-in failed:', error);
      // Error is already set by the signInWithGoogle function in AuthContext
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setError('');
      setLoading(true);
      await login(DEMO_EMAIL, DEMO_PASSWORD);
      navigate('/dashboard');
    } catch (error) {
      // If demo account doesn't exist, show a helpful message
      setError('Demo account not found. Use email: demo@upstand.dev, password: demo123456');
      console.error('Demo login error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" 
         style={{ backgroundColor: colors.neutral[50] }}>
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-xl p-8 border-2"
             style={{ borderColor: colors.primary[200] }}>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-2" style={{ color: colors.secondary[500] }}>Upstand</h1>
            <h2 className="text-2xl font-bold mb-4" style={{ color: colors.secondary[400] }}>
              Welcome Back
            </h2>
            <p className="text-sm" style={{ color: colors.neutral[600] }}>
              Don't have an account?{' '}
              <Link to="/register" className="font-medium hover:underline" 
                    style={{ color: colors.secondary[500] }}>
                Sign up here
              </Link>
            </p>
          </div>

          {/* Demo Account Info */}
          <div className="rounded-lg p-4 mb-6 border"
               style={{ backgroundColor: colors.primary[50], borderColor: colors.primary[200] }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: colors.secondary[500] }}>Try Demo Account</h3>
            <div className="text-sm space-y-1" style={{ color: colors.neutral[600] }}>
              <p><strong>Email:</strong> demo@upstand.dev</p>
              <p><strong>Password:</strong> demo123456</p>
              <Button 
                variant="accent" 
                size="sm" 
                onClick={handleDemoLogin}
                disabled={loading}
                className="mt-2 w-full"
              >
                {loading ? 'Signing in...' : 'Try Demo Account'}
              </Button>
            </div>
          </div>

          {/* Google Sign-In Button */}
          <Button 
            variant="outline" 
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            loading={googleLoading}
            className="w-full mb-4"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t" style={{ borderColor: colors.neutral[300] }} />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white" style={{ color: colors.neutral[500] }}>Or continue with email</span>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />
            
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="rounded-lg p-4 border" 
                   style={{ backgroundColor: colors.accent.error + '10', borderColor: colors.accent.error + '40' }}>
                <div className="flex items-start">
                  <ExclamationCircleIcon className="h-5 w-5 mr-2 flex-shrink-0" 
                                       style={{ color: colors.accent.error }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: colors.accent.error }}>Sign In Error</p>
                    <p className="text-sm mt-1" style={{ color: colors.accent.error }}>{error}</p>
                  </div>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              loading={loading}
              className="w-full"
            >
              Sign In
            </Button>
          </form>
        </div>
      </div>
      
      {/* Debug component - only shows in development */}
      <FirebaseDebug />
    </div>
  );
}

export default Login;