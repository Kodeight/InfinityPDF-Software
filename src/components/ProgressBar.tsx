
import React from 'react';
import { translations, LanguageCode } from '../translations';

interface Props {
  progress: number;
  active: boolean;
  completed?: boolean;
  lang: string;
}

const ProgressBar: React.FC<Props> = ({ progress, active, completed, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  
  return (
    <div 
      className="w-full space-y-2"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={t('system_progress')}
    >
      <div className="flex justify-between text-xs font-bold tracking-widest uppercase transition-colors duration-500">
        <span className={completed ? "text-emerald-400" : "text-white/40"}>
          {completed ? t('transformation_success') : t('system_progress')}
        </span>
        <span className={completed ? "text-emerald-400" : "text-white/40"}>
          {completed ? "100%" : `${progress}%`}
        </span>
      </div>
      <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div 
          className={`h-full transition-all duration-300 ease-out relative ${
            completed ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gradient-to-r from-blue-600 to-blue-400'
          } ${active ? 'animate-pulse' : ''}`}
          style={{ width: `${progress}%` }}
        >
          {active && !completed && (
            <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite]" />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
