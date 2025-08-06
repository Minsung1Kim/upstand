import React from 'react';

const LoadingSpinner = ({ size = 'md', color = 'blue', className = '' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const colors = {
    blue: 'border-blue-500',
    purple: 'border-purple-500',
    green: 'border-green-500',
    red: 'border-red-500',
    gray: 'border-gray-500'
  };

  return (
    <div className={`inline-block ${sizes[size]} ${className}`}>
      <div 
        className={`${sizes[size]} border-2 ${colors[color]} border-t-transparent rounded-full animate-spin`}
      ></div>
    </div>
  );
};

export const PageLoader = ({ message = 'Loading...' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="text-center">
        <div className="mb-4">
          <LoadingSpinner size="xl" color="blue" />
        </div>
        <p className="text-lg text-gray-600 font-medium">{message}</p>
        <div className="mt-2">
          <div className="flex space-x-1 justify-center">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const CardLoader = ({ message = 'Loading...' }) => {
  return (
    <div className="bg-white rounded-xl shadow-lg p-8 text-center">
      <div className="mb-4">
        <LoadingSpinner size="lg" color="blue" />
      </div>
      <p className="text-gray-600">{message}</p>
    </div>
  );
};

export default LoadingSpinner;