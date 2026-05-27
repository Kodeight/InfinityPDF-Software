
import React, { useState } from 'react';
import { LogMessage } from '../types';
import { translations, LanguageCode } from '../translations';

interface Props {
  logs: LogMessage[];
  lang: string;
}

const LogDropdown: React.FC<Props> = ({ logs, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="logs-menu"
        className="flex items-center gap-2 px-4 py-2 liquid-glass rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" aria-hidden="true" />
        {t('live_logs')} ({logs.length})
        <svg 
          className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div 
          id="logs-menu"
          role="log"
          aria-live="polite"
          className="absolute top-full right-0 mt-3 w-80 max-h-96 overflow-y-auto liquid-glass rounded-2xl z-50 p-4 border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 origin-top-right custom-scrollbar"
        >
          {logs.length === 0 ? (
            <div className="text-white/20 text-center py-8 italic text-sm">
              {t('no_logs')}
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-3 text-xs leading-relaxed border-b border-white/5 pb-2 last:border-0">
                  <span className="text-white/20 font-mono shrink-0">{log.timestamp}</span>
                  <span className={
                    log.type === 'error' ? 'text-red-400 font-medium' : 
                    log.type === 'success' ? 'text-emerald-400 font-medium' : 'text-blue-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogDropdown;
