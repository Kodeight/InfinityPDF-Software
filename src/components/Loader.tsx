
import React from 'react';

interface Props {
  fullScreen?: boolean;
}

const Loader: React.FC<Props> = ({ fullScreen = true }) => {
  return (
    <div className={`${fullScreen ? 'fixed inset-0 z-[99999]' : 'absolute inset-0 z-40'} flex flex-col items-center justify-center bg-black animate-in fade-in duration-500`}>
      <div className="relative w-32 h-16">
        <svg
          viewBox="0 0 100 50"
          className="w-full h-full"
        >
          {/* Background Track */}
          <path
            className="loader-track"
            d="M25,12.5 C10,12.5 10,37.5 25,37.5 C35,37.5 65,12.5 75,12.5 C90,12.5 90,37.5 75,37.5 C65,37.5 35,12.5 25,12.5 Z"
            fill="none"
            stroke="rgba(255, 255, 255, 0.03)"
            strokeWidth="3"
          />
          
          {/* Glowing Liquid Trail - Layer 1 */}
          <path
            d="M25,12.5 C10,12.5 10,37.5 25,37.5 C35,37.5 65,12.5 75,12.5 C90,12.5 90,37.5 75,37.5 C65,37.5 35,12.5 25,12.5 Z"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="3.5"
            strokeDasharray="40 160"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))' }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="200"
              to="0"
              dur="2s"
              repeatCount="indefinite"
            />
          </path>

          {/* Glowing Liquid Trail - Layer 2 (Ghosting) */}
          <path
            d="M25,12.5 C10,12.5 10,37.5 25,37.5 C35,37.5 65,12.5 75,12.5 C90,12.5 90,37.5 75,37.5 C65,37.5 35,12.5 25,12.5 Z"
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
            strokeDasharray="20 180"
            strokeLinecap="round"
            style={{ filter: 'blur(2px)' }}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="200"
              to="0"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      </div>
    </div>
  );
};

export default Loader;
