import React from 'react';

const Card = ({ 
  children, 
  className = '', 
  hover = true,
  glassmorphism = false,
  ...props 
}) => {
  const baseClasses = 'rounded-2xl shadow-xl p-6 border transition-all duration-300';
  const hoverClasses = hover ? 'hover:scale-105 hover:shadow-2xl' : '';
  const styleClasses = glassmorphism 
    ? 'bg-white/80 backdrop-blur-sm border-white/20' 
    : 'bg-white border-gray-200';

  return (
    <div 
      className={`${baseClasses} ${styleClasses} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;