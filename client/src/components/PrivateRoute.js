import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';

function PrivateRoute() {
  const { currentUser } = useAuth();
  const { currentCompany, loading } = useCompany();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow access to company-related routes even without a current company
  const companyRoutes = ['/company/select', '/company/join', '/company/create'];
  const isCompanyRoute = companyRoutes.some(route => location.pathname.startsWith(route));

  // If no current company and not on a company route, redirect to company selection
  if (!currentCompany && !isCompanyRoute) {
    return <Navigate to="/company/select" />;
  }

  return <Outlet />;
}

export default PrivateRoute;