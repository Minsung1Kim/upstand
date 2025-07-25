import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';
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

  useEffect(() => {
    if (currentUser) {
      fetchTeams();
    } else {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
    }
  }, [currentUser]);

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await api.get('/teams');
      setTeams(response.data.teams);
      
      // Set first team as current if none selected
      if (response.data.teams.length > 0 && !currentTeam) {
        setCurrentTeam(response.data.teams[0]);
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTeam = async (teamData) => {
    try {
      const response = await api.post('/teams', teamData);
      await fetchTeams();
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const value = {
    teams,
    currentTeam,
    setCurrentTeam,
    loading,
    fetchTeams,
    createTeam
  };

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}