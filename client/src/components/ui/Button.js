import React from 'react';
import { colors, buttonStyles } from '../../utils/colors';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false, 
  loading = false,
  className = '',
  onClick,
  type = 'button',
  ...props 
}) => {
  const variants = {
    primary: buttonStyles.primary,
    secondary: buttonStyles.secondary,
    accent: buttonStyles.accent,
    success: buttonStyles.success,
    warning: buttonStyles.warning,
    error: buttonStyles.error,
    outline: {
      backgroundColor: 'transparent',
      color: colors.secondary[500],
      border: `1px solid ${colors.secondary[500]}`,
      hover: {
        backgroundColor: colors.secondary[50],
      }
    },
    ghost: {
      backgroundColor: 'transparent',
      color: colors.secondary[500],
      hover: {
        backgroundColor: colors.secondary[50],
      }
    }
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg'
  };

  const baseClasses = 'font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyle = variants[variant] || variants.primary;
  const sizeClasses = sizes[size];

  const buttonStyle = {
    backgroundColor: variantStyle.backgroundColor,
    color: variantStyle.color,
    border: variantStyle.border || 'none',
    ...props.style
  };

  const handleMouseEnter = (e) => {
    if (!disabled && !loading && variantStyle.hover) {
      Object.assign(e.target.style, variantStyle.hover);
    }
  };

  const handleMouseLeave = (e) => {
    if (!disabled && !loading) {
      e.target.style.backgroundColor = variantStyle.backgroundColor;
      e.target.style.color = variantStyle.color;
      if (variantStyle.border) {
        e.target.style.border = variantStyle.border;
      }
    }
  };

  return (
    <button
      type={type}
      className={`${baseClasses} ${sizeClasses} ${className}`}
      style={buttonStyle}
      disabled={disabled || loading}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {loading ? (
        <div className="flex items-center justify-center">
          <div 
            className="animate-spin rounded-full h-4 w-4 border-b-2 mr-2"
            style={{ borderBottomColor: 'currentColor' }}
          ></div>
          Loading...
        </div>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;