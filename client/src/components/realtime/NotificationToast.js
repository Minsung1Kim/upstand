import React from 'react';
import { colors } from '../../utils/colors';
import { useRealTime } from '../../context/RealTimeContext';

const NotificationToast = () => {
  const { toastNotifications, clearToastNotification } = useRealTime();

  if (toastNotifications.length === 0) return null;

  const getToastStyle = (type) => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: colors.accent.success + '10',
          borderColor: colors.accent.success,
          iconColor: colors.accent.success
        };
      case 'warning':
        return {
          backgroundColor: colors.accent.warning + '10',
          borderColor: colors.accent.warning,
          iconColor: colors.accent.warning
        };
      case 'error':
        return {
          backgroundColor: colors.accent.error + '10',
          borderColor: colors.accent.error,
          iconColor: colors.accent.error
        };
      default:
        return {
          backgroundColor: colors.primary[50],
          borderColor: colors.primary[200],
          iconColor: colors.secondary[500]
        };
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toastNotifications.map((toast) => {
        const style = getToastStyle(toast.type);
        return (
          <div
            key={toast.id}
            className="max-w-sm bg-white rounded-lg shadow-lg border-l-4 p-4 animate-slide-in-right"
            style={{ borderLeftColor: style.borderColor, backgroundColor: style.backgroundColor }}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0" style={{ color: style.iconColor }}>
                {getIcon(toast.type)}
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium" style={{ color: colors.secondary[500] }}>
                  {toast.title}
                </p>
                <p className="text-sm mt-1" style={{ color: colors.neutral[600] }}>
                  {toast.message}
                </p>
                <div className="text-xs mt-2" style={{ color: colors.neutral[400] }}>
                  {new Date(toast.timestamp).toLocaleTimeString()}
                </div>
              </div>
              <div className="ml-4 flex-shrink-0 flex">
                <button
                  onClick={() => clearToastNotification(toast.id)}
                  className="rounded-md inline-flex hover:opacity-75 transition-opacity"
                  style={{ color: colors.neutral[400] }}
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationToast;