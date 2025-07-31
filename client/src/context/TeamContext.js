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

      // Set first team as current if none selected
      if (response.data.teams.length > 0) {
        setCurrentTeam(response.data.teams[0]);
      } else {
        setCurrentTeam(null);
      }
    } catch (error) {
      console.error('Error fetching teams from API:', error);

      // Fallback to localStorage when API fails
      const localTeams = getLocalTeams();
      setTeams(localTeams);

      // Set first team as current if none selected
      if (localTeams.length > 0) {
        setCurrentTeam(localTeams[0]);
      } else {
        setCurrentTeam(null);
      }
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
      console.error('API team creation failed, using localStorage fallback:', error);

      const newTeam = {
        id: Date.now(),
        name: teamData.name,
        role: 'OWNER',
        member_count: 1,
        owner_name: currentUser?.email || 'You',
        company_id: currentCompany?.id || 'default',
        created_at: new Date().toISOString()
      };

      const localTeams = getLocalTeams();
      localTeams.push(newTeam);
      saveLocalTeams(localTeams);

      setTeams(localTeams);

      // Set as current team if it's the first one
      if (localTeams.length === 1) {
        setCurrentTeam(newTeam);
      }

      return newTeam;
    }
  };

  const refreshTeams = async () => {
    await fetchTeams();
  };

  // Helper functions for localStorage
  const getLocalTeams = () => {
    try {
      if (!currentUser?.uid || !currentCompany?.id) return [];
      const key = `teams_${currentUser.uid}`;
      const stored = localStorage.getItem(key);
      const allTeams = stored ? JSON.parse(stored) : [];
      return allTeams.filter(team => team.company_id === currentCompany.id);
    } catch (error) {
      console.error('Error reading teams from localStorage:', error);
      return [];
    }
  };

  const saveLocalTeams = (teams) => {
    try {
      if (!currentUser?.uid || !currentCompany?.id) return;
      const key = `teams_${currentUser.uid}`;
      const stored = localStorage.getItem(key);
      const allTeams = stored ? JSON.parse(stored) : [];
      const otherCompanyTeams = allTeams.filter(team => team.company_id !== currentCompany.id);
      const updatedTeams = [...otherCompanyTeams, ...teams];
      localStorage.setItem(key, JSON.stringify(updatedTeams));
    } catch (error) {
      console.error('Error saving teams to localStorage:', error);
    }
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