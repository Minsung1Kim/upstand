// src/context/CompanyContext.js - Updated
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const CompanyContext = createContext();
export const useCompany = () => useContext(CompanyContext);

export const CompanyProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [userCompanies, setUserCompanies] = useState([]);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserCompanies = useCallback(async () => {
    try {
      const userCompaniesKey = `user_companies_${currentUser.uid}`;
      const stored = localStorage.getItem(userCompaniesKey);
      const companies = stored ? JSON.parse(stored) : [];
      setUserCompanies(companies);

      // Set current company (last used or first available)
      const lastUsedKey = `last_company_${currentUser.uid}`;
      const lastUsed = localStorage.getItem(lastUsedKey);
      const defaultCompany = companies.find(c => c.id === lastUsed) || companies[0];
      setCurrentCompany(defaultCompany || null);
    } catch (error) {
      console.error('Error loading companies:', error);
      setUserCompanies([]);
      setCurrentCompany(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadUserCompanies();
    } else {
      setUserCompanies([]);
      setCurrentCompany(null);
      setLoading(false);
    }
  }, [currentUser, loadUserCompanies]);

  const switchCompany = (company) => {
    setCurrentCompany(company);
    localStorage.setItem(`last_company_${currentUser.uid}`, company.id);
  };

  const joinCompany = async (companyCode) => {
    try {
      const newCompany = {
        id: companyCode.toUpperCase(),
        name: companyCode.toUpperCase(),
        code: companyCode.toUpperCase(),
        role: 'MEMBER'
      };
      const updatedCompanies = [...userCompanies, newCompany];
      setUserCompanies(updatedCompanies);
      localStorage.setItem(`user_companies_${currentUser.uid}`, JSON.stringify(updatedCompanies));
      switchCompany(newCompany);
      return newCompany;
    } catch (error) {
      throw new Error('Failed to join company');
    }
  };

  const createCompany = async (companyName) => {
    try {
      const companyCode = companyName.toUpperCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);
      const newCompany = {
        id: companyCode,
        name: companyName,
        code: companyCode,
        role: 'OWNER'
      };
      const updatedCompanies = [...userCompanies, newCompany];
      setUserCompanies(updatedCompanies);
      localStorage.setItem(`user_companies_${currentUser.uid}`, JSON.stringify(updatedCompanies));
      switchCompany(newCompany);
      return newCompany;
    } catch (error) {
      throw new Error('Failed to create company');
    }
  };

  const value = {
    userCompanies,
    currentCompany,
    switchCompany,
    joinCompany,
    createCompany,
    loading
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};