import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';

function JoinCompany() {
  const [companyCode, setCompanyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { joinCompany } = useCompany();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!companyCode.trim()) {
      setError('Please enter a company code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await joinCompany(companyCode.trim());
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to join company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Join a Company</h1>
          <p className="text-gray-600 mt-2">Enter the company code provided by your administrator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="companyCode" className="block text-sm font-medium text-gray-700 mb-2">
              Company Code
            </label>
            <input
              type="text"
              id="companyCode"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
              placeholder="Enter company code"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="submit"
              disabled={loading || !companyCode.trim()}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Joining...
                </div>
              ) : (
                'Join Company'
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
                to="/company/create"
                className="flex-1 text-center bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
              >
                Create Instead
              </Link>
            </div>
          </div>
        </form>

        <div className="mt-6 pt-4 border-t text-center">
          <p className="text-sm text-gray-500">
            Don't have a company code?{' '}
            <Link to="/company/create" className="text-blue-600 hover:underline">
              Create a new company
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default JoinCompany;