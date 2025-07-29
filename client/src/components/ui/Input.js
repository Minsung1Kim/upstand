import React from 'react';
import { colors, inputStyles } from '../../utils/colors';

const Input = ({ 
  label,
  error,
  helperText,
  className = '',
  containerClassName = '',
  ...props 
}) => {
  const baseClasses = 'w-full px-3 py-2 border rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0';
  
  const inputStyle = {
    borderColor: error ? colors.accent.error : colors.neutral[300],
    backgroundColor: inputStyles.base.backgroundColor,
    color: inputStyles.base.color,
  };

  const focusStyle = {
    borderColor: error ? colors.accent.error : colors.primary[200],
    boxShadow: error 
      ? `0 0 0 3px ${colors.accent.error}20` 
      : `0 0 0 3px ${colors.primary[200]}20`,
  };

  const handleFocus = (e) => {
    Object.assign(e.target.style, focusStyle);
  };

  const handleBlur = (e) => {
    e.target.style.borderColor = error ? colors.accent.error : colors.neutral[300];
    e.target.style.boxShadow = 'none';
  };

  return (
    <div className={containerClassName}>
      {label && (
        <label className="block text-sm font-medium mb-2" style={{ color: colors.neutral[700] }}>
          {label}
        </label>
      )}
      <input
        className={`${baseClasses} ${className}`}
        style={inputStyle}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm" style={{ color: colors.accent.error }}>
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="mt-1 text-sm" style={{ color: colors.neutral[500] }}>
          {helperText}
        </p>
      )}
    </div>
  );
};

export default Input;