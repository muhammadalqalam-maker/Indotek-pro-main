import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'underline' | 'segmented';
  className?: string;
  ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
  ariaLabel = 'Tab navigasi',
}) => {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex >= 0) {
      const nextTab = tabs[nextIndex];
      onChange(nextTab.id);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      if (buttons && buttons[nextIndex]) {
        buttons[nextIndex].focus();
      }
    }
  };

  if (variant === 'segmented') {
    return (
      <div
        ref={tabListRef}
        role="tablist"
        aria-label={ariaLabel}
        className={`inline-flex items-center p-1 bg-[#EAEFEA] rounded-lg gap-1 ${className}`}
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#12352B] ${
                isActive
                  ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                  : 'text-[#4F5D56] hover:text-[#202B26]'
              }`}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded font-mono tabular-nums ${
                    isActive ? 'bg-[#E5F4EB] text-[#1C6843]' : 'bg-[#E2E8E4] text-[#4F5D56]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`border-b border-[#E2E8E4] flex items-center gap-6 overflow-x-auto ${className}`}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex items-center gap-2 pb-3 pt-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#12352B] rounded-t ${
              isActive
                ? 'border-[#12352B] text-[#12352B] font-semibold'
                : 'border-transparent text-[#4F5D56] hover:text-[#202B26] hover:border-[#CBD5CF]'
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-mono tabular-nums ${
                  isActive ? 'bg-[#E5F4EB] text-[#1C6843]' : 'bg-[#F1F4F2] text-[#4F5D56]'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
