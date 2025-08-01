import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useCompany } from './CompanyContext';
import api from '../services/api';

const TeamContext = createContext({});

export function useTeam() {
  return useContext(TeamContext);
}

export function TeamProvider({ children }) {
  const [teams, setTeams] = useState([]);
  const [currentTeam, setCurrentTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const { currentCompany } = useCompany();

  useEffect(() => {
    if (currentUser && currentCompany) {
      fetchTeams();
    } else {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
    }
  }, [currentUser, currentCompany]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await api.get('/teams');
      setTeams(response.data.teams);
      setCurrentTeam(null); // No auto-select
    } catch (error) {
      console.error('Error fetching teams from API:', error);
      setTeams([]);
      setCurrentTeam(null);
    } finally {
      setLoading(false);
    }
  };

  const createTeam = async (teamData) => {
    try {
      const teamPayload = {
        ...teamData,
        company_id: currentCompany?.id || 'default'
      };
      const response = await api.post('/teams', teamPayload);
      await fetchTeams();
      return response.data;
    } catch (error) {
      console.error('API team creation failed:', error);
      return null;
    }
  };

  const refreshTeams = async () => {
    await fetchTeams();
  };

  const value = {
    teams,
    currentTeam,
    setCurrentTeam,
    loading,
    fetchTeams,
    createTeam,
    refreshTeams
  };

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}