import React from 'react';

interface AppLoadingScreenProps {
  message?: string;
}

const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({ message = 'Chargement...' }) => {
  return (
    <div className="app-loading-screen min-h-[100svh] w-full bg-white flex items-center justify-center px-6">
      <div className="app-loading-content flex flex-col items-center">
        <div className="app-loading-logo-ring">
          <img
            src="/icons/validel-logo.png"
            alt="Validel"
            className="app-loading-logo h-20 w-20 object-contain"
          />
        </div>
        <p className="mt-5 text-sm text-gray-600 tracking-[0.02em]">{message}</p>
        <div className="app-loading-dots mt-3" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
};

export default AppLoadingScreen;
