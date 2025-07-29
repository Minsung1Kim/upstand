// Upstand Design System - Color Palette

export const colors = {
  // Primary Colors
  primary: {
    50: '#F5F3F0',   // Very light beige
    100: '#E8E3DA',  // Light beige
    200: '#D7C49E',  // Main beige (existing)
    300: '#C5B087',  // Medium beige
    400: '#B39C70',  // Darker beige
    500: '#A18859',  // Deep beige
  },
  
  // Secondary Colors (Purple family)
  secondary: {
    50: '#F2F1F4',   // Very light purple
    100: '#DDDBE2',  // Light purple  
    200: '#B8B3C7',  // Medium light purple
    300: '#928BAC',  // Medium purple
    400: '#6D6391',  // Medium dark purple
    500: '#343148',  // Main dark purple (existing)
    600: '#2A2639',  // Darker purple
    700: '#201B2A',  // Very dark purple
  },

  // Accent Colors
  accent: {
    success: '#10B981',    // Green
    warning: '#F59E0B',    // Orange
    error: '#EF4444',      // Red
    info: '#3B82F6',       // Blue
  },

  // Sprint-specific colors
  sprint: {
    planning: '#8B5CF6',   // Purple
    active: '#10B981',     // Green
    review: '#F59E0B',     // Orange
    retrospective: '#EC4899', // Pink
  },

  // Status colors
  status: {
    todo: '#94A3B8',       // Gray
    inProgress: '#3B82F6', // Blue
    review: '#F59E0B',     // Orange
    done: '#10B981',       // Green
    blocked: '#EF4444',    // Red
  },

  // Neutral colors
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  }
};

// Helper function to get color with opacity
export const withOpacity = (color, opacity) => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Common component styles
export const buttonStyles = {
  primary: {
    backgroundColor: colors.secondary[500],
    color: 'white',
    hover: {
      backgroundColor: colors.secondary[600],
    }
  },
  secondary: {
    backgroundColor: colors.primary[200],
    color: colors.secondary[500],
    hover: {
      backgroundColor: colors.primary[300],
    }
  },
  accent: {
    backgroundColor: colors.primary[400],
    color: 'white',
    hover: {
      backgroundColor: colors.primary[500],
    }
  },
  success: {
    backgroundColor: colors.accent.success,
    color: 'white',
    hover: {
      backgroundColor: '#059669',
    }
  },
  warning: {
    backgroundColor: colors.accent.warning,
    color: 'white',
    hover: {
      backgroundColor: '#D97706',
    }
  },
  error: {
    backgroundColor: colors.accent.error,
    color: 'white',
    hover: {
      backgroundColor: '#DC2626',
    }
  }
};

export const inputStyles = {
  base: {
    borderColor: colors.neutral[300],
    backgroundColor: 'white',
    color: colors.neutral[700],
    focus: {
      borderColor: colors.primary[200],
      boxShadow: `0 0 0 3px ${withOpacity(colors.primary[200], 0.1)}`,
    }
  }
};