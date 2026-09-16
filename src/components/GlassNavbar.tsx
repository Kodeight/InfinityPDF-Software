
import React from 'react';
import { ToolId } from '../types';
import { TOOLS, LANGUAGES } from '../constants';
import { translations, LanguageCode } from '../translations';
import MoreToolsMenu from './newtools/MoreToolsMenu';

interface Props {
  activeTab: 'dashboard' | ToolId;
  setActiveTab: (tab: 'dashboard' | ToolId) => void;
  lang: string;
  setLang: (l: string) => void;
}

const GlassNavbar: React.FC<Props> = ({ activeTab, setActiveTab, lang, setLang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;

  return (
    <nav 
      role="navigation" 
      aria-label="Main navigation"
      className="h-16 sticky top-0 z-50 px-6 flex items-center justify-between liquid-glass mx-4 mt-4 mb-2 rounded-2xl"
    >
      <div 
        className="flex items-center gap-3 cursor-pointer group rounded-lg p-1"
        onClick={() => setActiveTab('dashboard')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setActiveTab('dashboard')}
        aria-label="Go to Dashboard"
      >
        {/* Blue container with centered infinity icon. 
            ViewBox is set to 25.3125 square to wrap the icon's width exactly 
            and vertically center its ~11.4 height content. */}
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.5)] group-hover:shadow-[0_0_20px_rgba(37,99,235,0.7)] group-hover:scale-105 transition-all duration-300">
          <svg 
            className="w-5 h-5" 
            viewBox="0 0 25.3125 25.3125" 
            fill="white" 
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path 
              d="M18.1875 7.5C17.0625 7.5 16.125 7.96875 15.375 8.71875L12 12L8.625 15.2812C7.875 16.0312 6.9375 16.5 5.8125 16.5C3.75 16.5 2.0625 14.8125 2.0625 12.75C2.0625 10.6875 3.75 9 5.8125 9C6.9375 9 7.875 9.46875 8.625 10.2188L9.75 11.3438L11.0625 10.0312L9.9375 8.90625C8.8125 7.78125 7.3125 7.125 5.625 7.125C2.53125 7.125 0 9.65625 0 12.75C0 15.8438 2.53125 18.375 5.625 18.375C7.3125 18.375 8.8125 17.7188 9.9375 16.5938L13.3125 13.3125L16.6875 10.0312C17.4375 9.28125 18.375 8.8125 19.5 8.8125C21.5625 8.8125 23.25 10.5 23.25 12.5625C23.25 14.625 21.5625 16.3125 19.5 16.3125C18.375 16.3125 17.4375 15.8438 16.6875 15.0938L15.5625 13.9688L14.25 15.2812L15.375 16.4062C16.5 17.5312 18 18.1875 19.6875 18.1875C22.78125 18.1875 25.3125 15.6562 25.3125 12.5625C25.3125 9.46875 22.78125 6.9375 19.6875 6.9375" 
            />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight text-white">
          InfinityPDF
        </span>
      </div>

      <div className="flex items-center gap-1" role="menubar">
        <button
          role="menuitem"
          aria-current={activeTab === 'dashboard' ? 'page' : undefined}
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'dashboard' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
          }`}
        >
          {t('dashboard')}
        </button>
        {TOOLS.filter((tool) => !tool.hideFromNav).map((tool) => (
          <button
            key={tool.id}
            role="menuitem"
            aria-current={activeTab === tool.id ? 'page' : undefined}
            onClick={() => setActiveTab(tool.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tool.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {t(tool.id === 'multi_pdf' ? 'multi_pdf' : tool.id === 'permissions' ? 'pdf_security' : 'universal_converter')}
          </button>
        ))}
        {/* Additive expansion: overflow menu for the 25 new tools. Existing tabs above are untouched. */}
        <MoreToolsMenu activeTab={activeTab} setActiveTab={setActiveTab} />
      </div>

      <div className="flex items-center gap-4">
        <div className="h-6 w-px bg-white/10" aria-hidden="true" />
        <label htmlFor="language-selector" className="sr-only">Select Language</label>
        <select 
          id="language-selector"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="bg-transparent text-white/70 text-xs font-medium border-none cursor-pointer hover:text-white transition-colors outline-none p-1 rounded"
        >
          {LANGUAGES.map(l => (
            <option key={l.code} value={l.code} className="bg-[#1a1a1a]">
              {l.name}
            </option>
          ))}
        </select>
      </div>
    </nav>
  );
};

export default GlassNavbar;
