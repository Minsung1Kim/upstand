import React from 'react';
import { colors } from '../../utils/colors';

const FirebaseDebug = () => {
  const envVars = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_APP_ID'
  ];

  const checkEnvVar = (varName) => {
    const value = process.env[varName];
    return {
      name: varName,
      isSet: !!value,
      value: value ? `${value.substring(0, 10)}...` : 'Not set'
    };
  };

  const envStatus = envVars.map(checkEnvVar);
  const allSet = envStatus.every(env => env.isSet);

  if (process.env.NODE_ENV === 'production') {
    return null; // Don't show in production
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-white rounded-lg shadow-lg border-2 z-50 p-4"
         style={{ borderColor: allSet ? colors.accent.success : colors.accent.error }}>
      <div className="flex items-center mb-2">
        <div className={`w-3 h-3 rounded-full mr-2`}
             style={{ backgroundColor: allSet ? colors.accent.success : colors.accent.error }}></div>
        <h3 className="font-bold text-sm" style={{ color: colors.secondary[500] }}>
          Firebase Config
        </h3>
      </div>
      
      <div className="space-y-1">
        {envStatus.map((env) => (
          <div key={env.name} className="flex items-center justify-between text-xs">
            <span className="truncate pr-2" style={{ color: colors.neutral[600] }}>
              {env.name.replace('REACT_APP_FIREBASE_', '')}
            </span>
            <span className={`font-medium`}
                  style={{ color: env.isSet ? colors.accent.success : colors.accent.error }}>
              {env.isSet ? '✓' : '✗'}
            </span>
          </div>
        ))}
      </div>

      {!allSet && (
        <div className="mt-2 text-xs p-2 rounded"
             style={{ backgroundColor: colors.accent.error + '10', color: colors.accent.error }}>
          Missing Firebase environment variables. Check your .env file.
        </div>
      )}

      <div className="mt-2 text-xs" style={{ color: colors.neutral[500] }}>
        Check browser console for detailed logs
      </div>
    </div>
  );
};

export default FirebaseDebug;