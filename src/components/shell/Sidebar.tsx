import { useEffect, useRef } from 'react';
import {
  BarChart3,
  Building2,
  CheckSquare,
  Compass,
  Flag,
  GitBranch,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  SETTINGS_NAV_ITEM,
  SIDEBAR_NAV_GROUPS,
} from '../../services/overviewApi';
import type { NavSectionId } from '../../types/overview';

const NAV_ICONS: Record<NavSectionId, LucideIcon> = {
  overview: LayoutGrid,
  campaigns: Flag,
  sponsors: Building2,
  pipeline: GitBranch,
  tasks: CheckSquare,
  collections: Wallet,
  analytics: BarChart3,
  'growth-analyst': Compass,
  'team-settings': SlidersHorizontal,
};

interface SidebarProps {
  activeSection: NavSectionId;
  onSelectSection: (section: NavSectionId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const mobileRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!mobileOpen)return;
    const previous=document.activeElement as HTMLElement|null;
    const rail=mobileRef.current;
    const controls=()=>Array.from(rail?.querySelectorAll<HTMLElement>('button,a[href],select,input,[tabindex="0"]')??[]);
    controls()[0]?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();onCloseMobile();}
      if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };
    const old=document.body.style.overflow;document.body.style.overflow='hidden';document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);previous?.focus();};
  },[mobileOpen]);
  const handleNavigate = (section: NavSectionId) => {
    onSelectSection(section);
    onCloseMobile();
  };

  const renderNavContent = (isCompact: boolean) => (
    <div className="app-sidebar flex h-full flex-col">
      {/* Brand header */}
      <div
        className={`flex h-16 shrink-0 items-center border-b border-[var(--color-border)] ${
          isCompact ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        {!isCompact ? (
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-none"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#DDE6CD] text-[12px] font-semibold tracking-tight text-[#173F34]"
              aria-hidden="true"
            >
              S
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.025em] text-[var(--color-ink)] whitespace-nowrap">
              Sponsorship
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleNavigate('overview')}
            title="Sponsorship Ops"
            aria-label="Sponsorship Ops — Overview"
            className="flex h-7 w-7 items-center justify-center rounded bg-[#DDE6CD] text-[13px] font-semibold text-[#173F34]"
          >
            S
          </button>
        )}

        {/* Desktop collapse toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-ink-subtle)] transition-colors duration-150 hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)] ${
            isCompact ? 'mt-0' : ''
          }`}
        >
          {isCompact ? (
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          )}
        </button>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="flex lg:hidden h-7 w-7 items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Navigation groups */}
      <nav
        aria-label="Primary workspace navigation"
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        <div className="space-y-6">
          {SIDEBAR_NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {!isCompact ? (
                <p className="mb-1.5 px-2.5 text-[12px] font-medium tracking-[0.02em] text-[var(--color-ink-subtle)]">
                  {group.label}
                </p>
              ) : (
                <div
                  className="mx-auto mb-2 h-px w-6 bg-[var(--color-border-subtle)]"
                  aria-hidden="true"
                />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = NAV_ICONS[item.id];
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={isCompact ? item.label : undefined}
                        className={`group flex w-full items-center gap-2.5 rounded-md py-2 text-[14px] transition-colors duration-150 whitespace-nowrap ${
                          isCompact ? 'justify-center px-2' : 'px-2.5'
                        } ${
                          isActive
                            ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
                            : 'font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive
                              ? 'text-[var(--color-accent)]'
                              : 'text-[var(--color-ink-subtle)] group-hover:text-[var(--color-ink-muted)]'
                          }`}
                          aria-hidden="true"
                        />
                        {!isCompact ? (
                          <span className="truncate">{item.label}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Bottom settings anchor */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        {(() => {
          const SettingsIcon = NAV_ICONS['team-settings'];
          const isActive = activeSection === 'team-settings';
          return (
            <button
              type="button"
              onClick={() => handleNavigate('team-settings')}
              aria-current={isActive ? 'page' : undefined}
              title={isCompact ? SETTINGS_NAV_ITEM.label : undefined}
              className={`group flex w-full items-center gap-2.5 rounded-md py-2 text-[14px] transition-colors duration-150 whitespace-nowrap ${
                isCompact ? 'justify-center px-2' : 'px-2.5'
              } ${
                isActive
                  ? 'bg-[var(--color-accent-soft)] font-semibold text-[var(--color-accent)]'
                  : 'font-medium text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]'
              }`}
            >
              <SettingsIcon
                className={`h-4 w-4 shrink-0 ${
                  isActive
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-ink-subtle)] group-hover:text-[var(--color-ink-muted)]'
                }`}
                aria-hidden="true"
              />
              {!isCompact ? (
                <span className="truncate">{SETTINGS_NAV_ITEM.label}</span>
              ) : null}
            </button>
          );
        })()}
        {isCompact ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="mt-1 hidden lg:flex w-full items-center justify-center rounded-md py-1.5 text-[12px] font-medium text-[var(--color-ink-subtle)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-ink)]"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed-width collapsible rail */}
      <aside
        className={`product-navigation hidden lg:block shrink-0 ${
          collapsed ? 'w-[68px]' : 'w-[236px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderNavContent(collapsed)}</div>
      </aside>

      {/* Mobile overlay drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[var(--color-ink)]/25"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside ref={mobileRef} role="dialog" aria-modal="true" aria-label="Workspace navigation" className="product-navigation relative z-10 h-full w-[280px] shadow-lg">
            {renderNavContent(false)}
          </aside>
        </div>
      ) : null}
    </>
  );
}

