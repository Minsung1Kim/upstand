import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';

function CompanySelector() {
  const { currentUser } = useAuth();
  const { userCompanies, currentCompany, switchCompany, loading } = useCompany();
  const navigate = useNavigate();

  useEffect(() => {
    // If user has a current company, redirect to dashboard
    if (currentCompany && !loading) {
      navigate('/dashboard');
    }
  }, [currentCompany, loading, navigate]);

  const handleCompanySelect = (company) => {
    switchCompany(company);
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{borderBottomColor: '#343148'}}></div>
          <p className="mt-4 text-gray-600">Loading your companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{color: '#343148'}}>Welcome to Upstand</h1>
          <p className="text-gray-600 mt-2">Select a company to continue</p>
        </div>

  {(userCompanies?.length ?? 0) === 0 ? (
          <div className="text-center space-y-4">
            <p className="text-gray-600">You're not part of any company yet.</p>
            <div className="space-y-3">
              <button
                onClick={() => navigate('/company/join')}
                className="w-full text-white py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
                style={{backgroundColor: '#343148'}}
              >
                Join a Company
              </button>
              <button
                onClick={() => navigate('/company/create')}
                className="w-full text-white py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
                style={{backgroundColor: '#D7C49E', color: '#343148'}}
              >
                Create New Company
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold" style={{color: '#343148'}}>Your Companies</h2>
            <div className="space-y-2">
              {(userCompanies ?? []).map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleCompanySelect(company)}
                  className="w-full text-left p-4 border border-gray-200 rounded-lg hover:opacity-80 transition-opacity"
                  style={{'&:hover': {borderColor: '#D7C49E', backgroundColor: 'rgba(215, 196, 158, 0.1)'}}}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#D7C49E';
                    e.target.style.backgroundColor = 'rgba(215, 196, 158, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#D1D5DB';
                    e.target.style.backgroundColor = 'transparent';
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium" style={{color: '#343148'}}>{company.name}</h3>
                      <p className="text-sm text-gray-500">Role: {company.role}</p>
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
            
            <div className="border-t pt-4 space-y-2">
              <button
                onClick={() => navigate('/company/join')}
                className="w-full py-2 px-4 border rounded-lg hover:opacity-80 transition-opacity"
                style={{color: '#343148', borderColor: '#343148'}}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(52, 49, 72, 0.1)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Join Another Company
              </button>
              <button
                onClick={() => navigate('/company/create')}
                className="w-full py-2 px-4 border rounded-lg hover:opacity-80 transition-opacity"
                style={{color: '#D7C49E', borderColor: '#D7C49E'}}
                onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(215, 196, 158, 0.1)'}
                onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                Create New Company
              </button>
            </div>
          </div>
        )}

        <div className="text-center mt-6 pt-4 border-t">
          <p className="text-sm text-gray-500">
            Logged in as {currentUser?.email}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CompanySelector;