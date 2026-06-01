
import React from 'react';
import { ToolId } from '../types';
import { TOOLS } from '../constants';
import { translations, LanguageCode } from '../translations';

interface Props {
  onSelectTool: (id: ToolId) => void;
  lang: string;
}

const Dashboard: React.FC<Props> = ({ onSelectTool, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;

  return (
    <div className="h-full flex flex-col items-center justify-start pt-12 p-4">
      <div className="mb-6 text-center max-w-4xl mx-auto px-4 overflow-visible">
        {/* Added overflow-visible and slightly more line-height to ensure 'Possibilities' is never clipped. */}
        <h1 className="text-5xl font-bold mb-4 tracking-tight leading-[1.3] py-2 text-white overflow-visible">
          {t('welcome_title')}
        </h1>
        <p className="text-white/40 text-lg max-w-lg mx-auto">
          {t('welcome_subtitle')}
        </p>
      </div>

      <div className="flex gap-8 items-center justify-center" role="list">
        {TOOLS.map((tool) => (
          <button 
            key={tool.id}
            role="listitem"
            aria-label={`${t(tool.id === 'multi_pdf' ? 'multi_pdf' : tool.id === 'permissions' ? 'pdf_security' : 'universal_converter')}: ${t(tool.id === 'multi_pdf' ? 'multi_pdf_desc' : tool.id === 'permissions' ? 'security_desc' : 'universal_desc')}`}
            className="group relative rounded-[2rem] transition-all"
            onClick={() => onSelectTool(tool.id)}
          >
            <div className="tool-btn w-64 h-64 liquid-glass rounded-3xl flex flex-col items-center justify-center gap-6 cursor-pointer p-6">
              {/* Clean icon container with no extra shadows */}
              <div className="p-4 rounded-2xl bg-white/5 group-hover:bg-blue-500/10 transition-colors">
                {tool.icon}
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{t(tool.id === 'multi_pdf' ? 'multi_pdf' : tool.id === 'permissions' ? 'pdf_security' : 'universal_converter')}</h3>
                <span className="text-white/20 text-xs uppercase tracking-widest font-bold">{t('tool_label')}</span>
              </div>
            </div>
            
            {/* Tooltip Description */}
            <div 
              className="absolute top-full mt-4 left-0 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none text-center"
              aria-hidden="true"
            >
               <p className="text-white/60 text-sm leading-relaxed px-4">
                  {t(tool.id === 'multi_pdf' ? 'multi_pdf_desc' : tool.id === 'permissions' ? 'security_desc' : 'universal_desc')}
               </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
