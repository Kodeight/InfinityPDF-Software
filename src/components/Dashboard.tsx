
import React from 'react';
import { ToolId } from '../types';
import { TOOLS } from '../constants';
import { translations, LanguageCode } from '../translations';
import { NEW_TOOL_DEFS, ntTitle, ntDesc } from './newtools/toolDefs';

interface Props {
  onSelectTool: (id: ToolId) => void;
  lang: string;
}

interface CardProps {
  id: string;
  icon: React.ReactNode;
  name: string;
  desc: string;
  kindLabel: string;
  onSelect: (id: ToolId) => void;
  boxClass?: string;
}

/*! @preserve InfinityPDF v1.5.0 TOOL CARD HOVER IMPLEMENTATION — Dashboard ToolCard */
// One stable card geometry for Core Tools and More Tools.
//
// IMPORTANT: the icon slot NEVER changes size or participates in layout
// reflow during hover. The icon itself is the only element being scaled.
// The description is absolutely positioned inside the fixed card, so its
// appearance can never push/re-center the icon, title, or More Tools section.
// This prevents the previous "center first, then jump upward" animation.
const ToolCard: React.FC<CardProps> = ({ id, icon, name, desc, kindLabel, onSelect, boxClass }) => (
  <button
    role="listitem"
    aria-label={`${name}: ${desc}`}
    className="group relative rounded-[2rem] transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
    onClick={() => onSelect(id as ToolId)}
  >
    <div className={`tool-btn ${boxClass || 'w-64 h-64'} liquid-glass rounded-3xl overflow-hidden flex flex-col items-center justify-center gap-5 cursor-pointer p-6 relative`}>
      {/* Fixed icon slot: its geometry never changes on hover.
          Only the inner icon scales/lifts around its exact center.
          This eliminates flex reflow and the late upward jump. */}
      <div className="w-20 h-20 shrink-0 rounded-2xl bg-white/5 group-hover:bg-blue-500/10 flex items-center justify-center">
        <span className="flex items-center justify-center shrink-0 origin-center motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-hover:scale-[0.6] group-focus-visible:scale-[0.6] group-active:scale-[0.6] group-hover:-translate-y-1 group-focus-visible:-translate-y-1 group-active:-translate-y-1">
          {icon}
        </span>
      </div>

      {/* Fixed-flow title block. Description is NOT part of this flow. */}
      <div className="text-center min-w-0 w-full shrink-0">
        <h3 className="text-lg font-semibold mb-1 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out group-hover:-translate-y-1 group-focus-visible:-translate-y-1 group-active:-translate-y-1">
          {name}
        </h3>
        <span className="block text-white/20 text-xs uppercase tracking-widest font-bold motion-safe:transition-opacity motion-safe:duration-200 group-hover:opacity-0 group-focus-visible:opacity-0 group-active:opacity-0">
          {kindLabel}
        </span>
      </div>

      {/* Description is absolutely positioned INSIDE the card.
          It cannot change card height or re-center the flex column.
          Its animation is only opacity/transform. */}
      <div
        className="absolute left-6 right-6 bottom-6 max-h-14 overflow-hidden pointer-events-none text-center opacity-0 translate-y-2 motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-active:translate-y-0 group-active:opacity-100"
        aria-hidden="true"
      >
        <p className="text-white/60 text-[11px] leading-snug">
          {desc}
        </p>
      </div>
    </div>
  </button>
);

const Dashboard: React.FC<Props> = ({ onSelectTool, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;

  // Existing tools keep their exact rendering; new tools read name/desc
  // from their own definitions (translations file stays frozen).
  const legacyName = (id: string) => t(id === 'multi_pdf' ? 'multi_pdf' : id === 'permissions' ? 'pdf_security' : 'universal_converter');
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
          <ToolCard
            key={tool.id}
            id={tool.id}
            icon={tool.icon}
            name={legacyName(tool.id)}
            desc={t(tool.id === 'multi_pdf' ? 'multi_pdf_card_desc' : tool.id === 'permissions' ? 'pdf_security_card_desc' : 'universal_card_desc')}
            kindLabel={t('tool_label')}
            onSelect={onSelectTool}
          />
        ))}
      </div>

      {/* All 25 new tools, same card style, 5 per row under the core tools. */}
      <div className="w-full max-w-7xl mx-auto mt-14 pb-16">
        <h2 className="text-center text-[0.625em] font-bold uppercase tracking-[0.35em] text-white/30 mb-6">{t('more_tools')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-start justify-center" role="list">
          {NEW_TOOL_DEFS.map((d) => (
            <ToolCard
              key={d.id}
              id={d.id}
              icon={d.icon}
              name={ntTitle(d.id, lang)}
              desc={ntDesc(d.id, lang)}
              kindLabel={t('tool_label')}
              onSelect={onSelectTool}
              boxClass="w-full h-64"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
