
import React, { useState, useCallback, useEffect } from 'react';
import { ToolId } from './types';
import GlassNavbar from './components/GlassNavbar';
import Dashboard from './components/Dashboard';
import ToolView from './components/ToolView';
import Loader from './components/Loader';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | ToolId>('dashboard');
  const [lang, setLang] = useState('en');
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    // Initial boot sequence
    const timer = setTimeout(() => {
      setIsLoading(false);
      setIsInitialLoad(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Force LTR layout for all languages as per user request
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  const handleSetTab = (tab: 'dashboard' | ToolId) => {
    if (tab !== activeTab) {
      setIsLoading(true);
      setTimeout(() => {
        setActiveTab(tab);
        setIsLoading(false);
      }, 600);
    }
  };

  const handleSelectTool = useCallback((id: ToolId) => {
    handleSetTab(id);
  }, [activeTab]);

  return (
    <div className="h-screen relative flex flex-col overflow-hidden bg-black">
      {/* Initial load covers everything */}
      {isInitialLoad && <Loader fullScreen={true} />}

      <GlassNavbar 
        activeTab={activeTab} 
        setActiveTab={handleSetTab} 
        lang={lang} 
        setLang={setLang} 
      />
      
      <main className="flex-1 min-h-0 relative">
        {/* Navigation loading replaces content, stays below navbar */}
        {isLoading && !isInitialLoad ? (
          <Loader fullScreen={false} />
        ) : (
          <>
            {activeTab === 'dashboard' ? (
              <Dashboard onSelectTool={handleSelectTool} lang={lang} />
            ) : (
              <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-500 tool-scaling-base">
                <ToolView toolId={activeTab as ToolId} lang={lang} />
              </div>
            )}
          </>
        )}
      </main>


    </div>
  );
};

export default App;
