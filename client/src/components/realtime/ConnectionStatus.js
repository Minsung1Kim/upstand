import React, { useState } from 'react';
import { colors } from '../../utils/colors';
import { useRealTime } from '../../context/RealTimeContext';

const ConnectionStatus = ({ position = 'bottom-left' }) => {
  const { isConnected, connectionStatus, teamOnlineCount } = useRealTime();
  const [showDetails, setShowDetails] = useState(false);

  // Defensive: Don't render if context is missing
  if (typeof isConnected === 'undefined' || typeof connectionStatus === 'undefined') {
    return null;
  }

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
      default:
        return 'bottom-4 left-4';
    }
  };

  const getStatusColor = () => {
    if (isConnected) {
      return colors.accent.success;
    }
    return colors.accent.error;
  };

  const getStatusText = () => {
    if (isConnected) {
      return 'Connected';
    }
    return 'Disconnected';
  };

  const getStatusIcon = () => {
    if (isConnected) {
      return (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    );
  };


  return (
    <div className={`fixed ${getPositionClasses()} z-40`}>
      <div className="relative">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center space-x-2 px-3 py-2 rounded-lg shadow-lg border transition-all duration-200 ${
            showDetails ? 'rounded-b-none' : ''
          }`}
          style={{
            backgroundColor: 'white',
            borderColor: getStatusColor(),
            color: colors.neutral[700]
          }}
        >
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
               style={{ backgroundColor: getStatusColor() }}>
          </div>
          <span className="text-xs font-medium">
            {getStatusText()}
          </span>
          {teamOnlineCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ 
                    backgroundColor: colors.primary[100], 
                    color: colors.secondary[400] 
                  }}>
              {teamOnlineCount}
            </span>
          )}
          <div style={{ color: getStatusColor() }}>
            {getStatusIcon()}
          </div>
        </button>

        {/* Details Panel */}
        {showDetails && (
          <div className="absolute bottom-full left-0 mb-0 w-64 bg-white rounded-lg rounded-bl-none shadow-lg border border-t-0"
               style={{ borderColor: getStatusColor() }}>
            <div className="p-3">
              <div className="text-xs font-medium mb-2" style={{ color: colors.secondary[500] }}>
                Real-time Status
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: colors.neutral[600] }}>Connection:</span>
                  <div className="flex items-center space-x-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'animate-pulse' : ''}`}
                         style={{ backgroundColor: getStatusColor() }}>
                    </div>
                    <span className="text-xs font-medium" style={{ color: getStatusColor() }}>
                      {getStatusText()}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: colors.neutral[600] }}>WebSocket:</span>
                  <span className="text-xs" style={{ color: colors.neutral[500] }}>
                    {connectionStatus.hasWebSocket ? '✓' : '✗'}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: colors.neutral[600] }}>Listeners:</span>
                  <span className="text-xs" style={{ color: colors.neutral[500] }}>
                    {connectionStatus.activeListeners}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: colors.neutral[600] }}>Team Online:</span>
                  <span className="text-xs font-medium" style={{ color: colors.accent.success }}>
                    {teamOnlineCount}
                  </span>
                </div>
              </div>
              
              {!isConnected && (
                <div className="mt-3 p-2 rounded text-xs"
                     style={{ 
                       backgroundColor: colors.accent.error + '10',
                       color: colors.accent.error 
                     }}>
                  Real-time features unavailable. Check your connection.
                </div>
              )}
              
              {isConnected && (
                <div className="mt-3 p-2 rounded text-xs"
                     style={{ 
                       backgroundColor: colors.accent.success + '10',
                       color: colors.accent.success 
                     }}>
                  ✓ Receiving live updates
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;