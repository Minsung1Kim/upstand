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
  signInWithPopup
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

  // Sign up function
  async function signup(email, password, role = 'MEMBER', companyCode = '') {
    try {
      setError('');
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Save role with user
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
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}