
import React from 'react';
import { ToolId } from '../types';
import { TOOLS } from '../constants';
import { translations, LanguageCode } from '../translations';
import { NEW_TOOL_CATEGORIES, NEW_TOOL_DEFS } from './newtools/toolDefs';

interface Props {
  onSelectTool: (id: ToolId) => void;
  lang: string;
}

const Dashboard: React.FC<Props> = ({ onSelectTool, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;

  // Existing tools keep their exact rendering; new tools read name/desc
  // from their own definitions (translations file stays frozen).
  const legacyName = (id: string) => t(id === 'multi_pdf' ? 'multi_pdf' : id === 'permissions' ? 'pdf_security' : 'universal_converter');
  const legacyDesc = (id: string) => t(id === 'multi_pdf' ? 'multi_pdf_desc' : id === 'permissions' ? 'security_desc' : 'universal_desc');
  const existing = TOOLS.filter((tool) => !tool.hideFromNav);

  return (
    <div className="h-full flex flex-col items-center justify-start pt-12 p-4 overflow-y-auto custom-scrollbar">
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
        {existing.map((tool) => (
          <button
            key={tool.id}
            role="listitem"
            aria-label={`${legacyName(tool.id)}: ${legacyDesc(tool.id)}`}
            className="group relative rounded-[2rem] transition-all"
            onClick={() => onSelectTool(tool.id)}
          >
            <div className="tool-btn w-64 h-64 liquid-glass rounded-3xl flex flex-col items-center justify-center gap-6 cursor-pointer p-6">
              {/* Clean icon container with no extra shadows */}
              <div className="p-4 rounded-2xl bg-white/5 group-hover:bg-blue-500/10 transition-colors">
                {tool.icon}
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-1">{legacyName(tool.id)}</h3>
                <span className="text-white/20 text-xs uppercase tracking-widest font-bold">{t('tool_label')}</span>
              </div>
            </div>

            {/* Tooltip Description */}
            <div
              className="absolute top-full mt-4 left-0 w-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none text-center"
              aria-hidden="true"
            >
               <p className="text-white/60 text-sm leading-relaxed px-4">
                  {legacyDesc(tool.id)}
               </p>
            </div>
          </button>
        ))}
      </div>

      {/* Additive expansion: categorized grid of new tools, appended below. */}
      <div className="w-full max-w-6xl mx-auto mt-14 pb-16">
        <h2 className="text-center text-[0.625em] font-bold uppercase tracking-[0.35em] text-white/30 mb-6">More Tools</h2>
        {NEW_TOOL_CATEGORIES.map((cat) => (
          <div key={cat} className="mb-6">
            <h3 className="text-sm font-bold text-white/60 mb-3 px-2">{cat}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {NEW_TOOL_DEFS.filter((d) => d.category === cat).map((d) => (
                <button
                  key={d.id}
                  onClick={() => onSelectTool(d.id as ToolId)}
                  className="group liquid-glass rounded-2xl p-4 border border-white/5 text-left hover:border-blue-500/30 transition-all"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-8 h-8 shrink-0 [&>svg]:w-8 [&>svg]:h-8 text-white/70">{d.icon}</div>
                    <span className="text-sm font-bold text-white/90">{d.title}</span>
                  </div>
                  <p className="text-[0.6875em] text-white/35 leading-snug">{d.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
