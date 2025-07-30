import React, { useState } from 'react';
import { colors } from '../../utils/colors';
import { useRealTime } from '../../context/RealTimeContext';

const LiveStandupFeed = () => {
  const { standupUpdates, isConnected, trackStandupActivity } = useRealTime();
  const [expandedItems, setExpandedItems] = useState(new Set());

  const toggleExpanded = (standupId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(standupId)) {
      newExpanded.delete(standupId);
    } else {
      newExpanded.add(standupId);
    }
    setExpandedItems(newExpanded);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getSentimentColor = (sentiment) => {
    if (!sentiment || !sentiment.sentiment) return colors.neutral[400];
    
    switch (sentiment.sentiment) {
      case 'positive':
        return colors.accent.success;
      case 'negative':
        return colors.accent.error;
      default:
        return colors.neutral[400];
    }
  };

  const getSentimentIcon = (sentiment) => {
    if (!sentiment || !sentiment.sentiment) return '😐';
    
    switch (sentiment.sentiment) {
      case 'positive':
        return '😊';
      case 'negative':
        return '😟';
      default:
        return '😐';
    }
  };

  const hasBlockers = (standup) => {
    return standup.blocker_analysis && standup.blocker_analysis.has_blockers;
  };

  const getBlockerSeverity = (standup) => {
    if (!hasBlockers(standup)) return null;
    return standup.blocker_analysis.severity || 'low';
  };

  const getBlockerColor = (severity) => {
    switch (severity) {
      case 'high':
        return colors.accent.error;
      case 'medium':
        return colors.accent.warning;
      case 'low':
        return colors.neutral[400];
      default:
        return colors.neutral[400];
    }
  };

  if (!isConnected) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4"
           style={{ borderColor: colors.neutral[200] }}>
        <div className="text-center">
          <div className="w-2 h-2 rounded-full mx-auto mb-2"
               style={{ backgroundColor: colors.neutral[400] }}>
          </div>
          <p className="text-sm" style={{ color: colors.neutral[500] }}>
            Connecting to live updates...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border"
         style={{ borderColor: colors.neutral[200] }}>
      <div className="p-4 border-b" style={{ borderColor: colors.neutral[200] }}>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full animate-pulse"
               style={{ backgroundColor: colors.accent.success }}>
          </div>
          <h3 className="font-semibold" style={{ color: colors.secondary[500] }}>
            Live Standups
          </h3>
          <span className="text-xs px-2 py-1 rounded-full"
                style={{ 
                  backgroundColor: colors.primary[100], 
                  color: colors.secondary[400] 
                }}>
            {standupUpdates.length} today
          </span>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {standupUpdates.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full mx-auto mb-3"
                 style={{ backgroundColor: colors.primary[50] }}>
              <svg className="w-6 h-6 mx-auto mt-3" style={{ color: colors.primary[200] }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: colors.neutral[500] }}>
              No standups yet today
            </p>
            <p className="text-xs mt-1" style={{ color: colors.neutral[400] }}>
              Live standup updates will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: colors.neutral[100] }}>
            {standupUpdates.map((standup) => {
              const isExpanded = expandedItems.has(standup.id);
              const sentiment = standup.sentiment;
              const hasBlocker = hasBlockers(standup);
              const blockerSeverity = getBlockerSeverity(standup);
              
              return (
                <div key={standup.id} className="p-4 hover:bg-gray-50 transition-colors animate-slide-in-up">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      {/* User Avatar */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                           style={{ backgroundColor: colors.primary[200], color: colors.secondary[500] }}>
                        {standup.user_email ? standup.user_email.charAt(0).toUpperCase() : '?'}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium text-sm" style={{ color: colors.secondary[500] }}>
                            {standup.user_email?.split('@')[0] || 'Unknown User'}
                          </h4>
                          <span className="text-xs" style={{ color: colors.neutral[400] }}>
                            {formatTime(standup.timestamp)}
                          </span>
                          {sentiment && (
                            <span className="text-xs">
                              {getSentimentIcon(sentiment)}
                            </span>
                          )}
                          {hasBlocker && (
                            <span className="text-xs px-1.5 py-0.5 rounded text-white font-medium"
                                  style={{ backgroundColor: getBlockerColor(blockerSeverity) }}>
                              🚫 {blockerSeverity.toUpperCase()}
                            </span>
                          )}
                        </div>
                        
                        {/* Preview */}
                        {!isExpanded && (
                          <div className="space-y-1">
                            {standup.yesterday && (
                              <p className="text-xs text-gray-600 line-clamp-1">
                                <span className="font-medium">Yesterday:</span> {standup.yesterday}
                              </p>
                            )}
                            {standup.today && (
                              <p className="text-xs text-gray-600 line-clamp-1">
                                <span className="font-medium">Today:</span> {standup.today}
                              </p>
                            )}
                          </div>
                        )}
                        
                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="space-y-3 mt-2">
                            {standup.yesterday && (
                              <div>
                                <h5 className="text-xs font-medium mb-1" style={{ color: colors.secondary[400] }}>
                                  Yesterday
                                </h5>
                                <p className="text-sm" style={{ color: colors.neutral[700] }}>
                                  {standup.yesterday}
                                </p>
                              </div>
                            )}
                            
                            {standup.today && (
                              <div>
                                <h5 className="text-xs font-medium mb-1" style={{ color: colors.secondary[400] }}>
                                  Today
                                </h5>
                                <p className="text-sm" style={{ color: colors.neutral[700] }}>
                                  {standup.today}
                                </p>
                              </div>
                            )}
                            
                            {standup.blockers && (
                              <div>
                                <h5 className="text-xs font-medium mb-1" style={{ color: colors.accent.error }}>
                                  Blockers
                                </h5>
                                <p className="text-sm" style={{ color: colors.neutral[700] }}>
                                  {standup.blockers}
                                </p>
                              </div>
                            )}
                            
                            {/* AI Analysis */}
                            {hasBlocker && standup.blocker_analysis.blockers && (
                              <div className="p-2 rounded text-xs"
                                   style={{ 
                                     backgroundColor: getBlockerColor(blockerSeverity) + '10',
                                     color: getBlockerColor(blockerSeverity)
                                   }}>
                                <div className="font-medium mb-1">🤖 AI Detected Blockers:</div>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {standup.blocker_analysis.blockers.map((blocker, index) => (
                                    <li key={index}>{blocker}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {sentiment && sentiment.sentiment !== 'neutral' && (
                              <div className="p-2 rounded text-xs"
                                   style={{ 
                                     backgroundColor: getSentimentColor(sentiment) + '10',
                                     color: getSentimentColor(sentiment)
                                   }}>
                                <div className="font-medium">
                                  🤖 Sentiment: {sentiment.sentiment} 
                                  {sentiment.score && (
                                    <span className="ml-1">({Math.round(sentiment.score * 100)}%)</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Expand Button */}
                    <button
                      onClick={() => toggleExpanded(standup.id)}
                      className="ml-2 p-1 rounded hover:bg-gray-200 transition-colors"
                      style={{ color: colors.neutral[400] }}
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                           fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveStandupFeed;