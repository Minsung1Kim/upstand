import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';

function CreateCompany() {
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdCompany, setCreatedCompany] = useState(null);
  const { createCompany } = useCompany();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('Please enter a company name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newCompany = await createCompany(companyName.trim());
      setCreatedCompany(newCompany);
    } catch (err) {
      setError(err.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate('/dashboard');
  };

  if (createdCompany) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{color: '#343148'}}>Company Created!</h1>
            <p className="text-gray-600 mt-2">Your new company has been successfully created</p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2" style={{color: '#343148'}}>Company Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium">{createdCompany.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Code:</span>
                  <span className="font-mono font-medium bg-gray-200 px-2 py-1 rounded">
                    {createdCompany.code}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Your Role:</span>
                  <span className="font-medium" style={{color: '#D7C49E'}}>{createdCompany.role}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg p-4" style={{backgroundColor: 'rgba(215, 196, 158, 0.1)', borderColor: '#D7C49E', borderWidth: '1px'}}>
              <h4 className="font-medium mb-2" style={{color: '#343148'}}>Share this code:</h4>
              <p className="text-sm text-gray-700 mb-2">
                Team members can join your company using this code:
              </p>
              <div className="bg-white rounded px-3 py-2 font-mono text-lg text-center font-bold" style={{borderColor: '#D7C49E', borderWidth: '1px', color: '#343148'}}>
                {createdCompany.code}
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="w-full text-white py-3 px-4 rounded-lg hover:opacity-90 transition-opacity font-medium"
              style={{backgroundColor: '#343148'}}
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold" style={{color: '#343148'}}>Create New Company</h1>
          <p className="text-gray-600 mt-2">Set up a new company for your team</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">
              Company Name
            </label>
            <input
              type="text"
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Enter your company name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium mb-2" style={{color: '#343148'}}>What happens next?</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• A unique company code will be generated</li>
              <li>• You'll become the company owner</li>
              <li>• Share the code with team members to join</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || !companyName.trim()}
              className="w-full text-white py-2 px-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{backgroundColor: '#D7C49E', color: '#343148'}}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </div>
              ) : (
                'Create Company'
              )}
            </button>

            <div className="flex space-x-3">
              <Link
                to="/company/select"
                className="flex-1 text-center bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Back
              </Link>
              <Link
                to="/company/join"
                className="flex-1 text-center text-white py-2 px-4 rounded-lg hover:opacity-90 transition-opacity"
                style={{backgroundColor: '#343148'}}
              >
                Join Instead
              </Link>
            </div>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-sm text-gray-500">
            Already have a company code?{' '}
            <Link to="/company/join" className="hover:underline" style={{color: '#343148'}}>
              Join existing company
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default CreateCompany;