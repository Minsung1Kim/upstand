/**
 * Authentication Context
 * Manages user authentication state and provides auth methods
 */

import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sign up function - now accepts userData object
  async function signup(userData) {
    try {
      setError('');
      const { firstName, lastName, email, password, role, companyCode } = userData;
      
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update Firebase profile with display name
      const displayName = `${firstName} ${lastName}`;
      await updateProfile(result.user, {
        displayName: displayName
      });
      
      // Save additional user data to localStorage
      const userProfile = {
        firstName,
        lastName,
        displayName,
        email,
        role,
        createdAt: new Date().toISOString()
      };
      
      localStorage.setItem(`user_profile_${result.user.uid}`, JSON.stringify(userProfile));
      localStorage.setItem(`user_role_${result.user.uid}`, role);
      
      // If they're joining a company, save that too
      if (role === 'MEMBER' && companyCode) {
        const userCompaniesKey = `user_companies_${result.user.uid}`;
        const company = {
          id: companyCode.toUpperCase(),
          name: companyCode.toUpperCase(),
          code: companyCode.toUpperCase(),
          role: 'MEMBER'
        };
        localStorage.setItem(userCompaniesKey, JSON.stringify([company]));
        localStorage.setItem(`last_company_${result.user.uid}`, company.id);
      }
      
      // Update currentUser to include the new profile info
      setCurrentUser({
        ...result.user,
        displayName
      });
      
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Log in function
  async function login(email, password) {
    try {
      setError('');
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Google Sign-In function
  async function signInWithGoogle() {
    try {
      setError('');
      const result = await signInWithPopup(auth, googleProvider);
      
      // If this is their first time signing in with Google, save profile
      if (result.user && result.user.displayName) {
        const names = result.user.displayName.split(' ');
        const firstName = names[0] || '';
        const lastName = names.slice(1).join(' ') || '';
        
        const userProfile = {
          firstName,
          lastName,
          displayName: result.user.displayName,
          email: result.user.email,
          role: 'MEMBER', // Default role for Google sign-in
          createdAt: new Date().toISOString()
        };
        
        localStorage.setItem(`user_profile_${result.user.uid}`, JSON.stringify(userProfile));
        localStorage.setItem(`user_role_${result.user.uid}`, 'MEMBER');
      }
      
      return result;
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Sign-in popup was blocked. Please allow popups for this site.');
      } else {
        setError(error.message);
      }
      throw error;
    }
  }

  // Log out function
  async function logout() {
    try {
      setError('');
      await signOut(auth);
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  // Get current auth token
  async function getAuthToken() {
    if (currentUser) {
      return await currentUser.getIdToken();
    }
    return null;
  }

  // Get user role
  function getUserRole() {
    if (currentUser) {
      return localStorage.getItem(`user_role_${currentUser.uid}`) || 'MEMBER';
    }
    return 'MEMBER';
  }

  // Get user profile
  function getUserProfile() {
    if (currentUser) {
      const stored = localStorage.getItem(`user_profile_${currentUser.uid}`);
      if (stored) {
        return JSON.parse(stored);
      }
      
      // Fallback for existing users without stored profile
      if (currentUser.displayName) {
        const names = currentUser.displayName.split(' ');
        return {
          firstName: names[0] || '',
          lastName: names.slice(1).join(' ') || '',
          displayName: currentUser.displayName,
          email: currentUser.email,
          role: getUserRole()
        };
      }
      
      // Last fallback - use email
      return {
        firstName: currentUser.email?.split('@')[0] || 'User',
        lastName: '',
        displayName: currentUser.email?.split('@')[0] || 'User',
        email: currentUser.email,
        role: getUserRole()
      };
    }
    return null;
  }

  // Update user profile
  async function updateUserProfile(updates) {
    if (!currentUser) return;
    
    try {
      const currentProfile = getUserProfile();
      const updatedProfile = { ...currentProfile, ...updates };
      
      // Update Firebase display name if firstName or lastName changed
      if (updates.firstName || updates.lastName) {
        const displayName = `${updatedProfile.firstName} ${updatedProfile.lastName}`;
        await updateProfile(currentUser, { displayName });
        updatedProfile.displayName = displayName;
        
        // Update current user state
        setCurrentUser({
          ...currentUser,
          displayName
        });
      }
      
      // Save to localStorage
      localStorage.setItem(`user_profile_${currentUser.uid}`, JSON.stringify(updatedProfile));
      
      return updatedProfile;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    login,
    signup,
    signInWithGoogle,
    logout,
    getAuthToken,
    getUserRole,
    getUserProfile,
    updateUserProfile,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}