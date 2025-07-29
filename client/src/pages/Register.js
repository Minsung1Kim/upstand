import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [companyCode, setCompanyCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      return setError('Passwords do not match');
    }
    
    if (password.length < 6) {
      return setError('Password must be at least 6 characters');
    }

    // If they're a member, they need a company code
    if (role === 'MEMBER' && !companyCode.trim()) {
      return setError('Company code is required for team members');
    }

    // If they're a member, validate company code exists
    if (role === 'MEMBER') {
      const companiesKey = 'all_companies';
      const allCompanies = JSON.parse(localStorage.getItem(companiesKey) || '[]');
      const validCompany = allCompanies.find(c => c.code === companyCode.toUpperCase());
      
      if (!validCompany) {
        return setError('Invalid company code. Please check with your manager.');
      }
    }
    
    try {
      setError('');
      setLoading(true);
      await signup(email, password, role, companyCode);
      navigate('/dashboard');
    } catch (error) {
      setError('Failed to create account: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h1 className="text-center text-4xl font-bold text-blue-600">Upstand</h1>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Email address"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Password"
            />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Confirm password"
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Your Role</label>
              <select 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="MEMBER">Team Member</option>
                <option value="MANAGER">Manager/PM</option>
              </select>
              <p className="text-xs text-gray-500">
                {role === 'MANAGER' 
                  ? 'Managers can create companies and have admin access' 
                  : 'Team members need a company code from their manager'
                }
              </p>
            </div>

            {role === 'MEMBER' && (
              <input
                type="text"
                required
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Company Code (get from your manager)"
              />
            )}
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Creating account...' : 'Sign up'}
          </button>

          <p className="text-center text-sm">
            Already have an account? <Link to="/login" className="text-blue-600">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default Register;