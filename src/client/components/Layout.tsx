import { useRef } from 'react';
import { Settings as SettingsIcon, Rocket, X } from 'lucide-react';
import { useStore } from '../store';
import { startMigration, cancelMigration } from '../services/api';
import type { MigrationEvent } from '../types';

import NotionBrowser from './NotionBrowser';
import MigrationConfig from './MigrationConfig';
import MigrationProgress from './MigrationProgress';
import SettingsModal from './Settings';

export default function Layout() {
  const {
    token, vaultPath,
    selectedItems, config,
    isMigrating, setIsMigrating,
    addMigrationEvent, clearMigrationEvents,
    setMigrationTotal, setMigrationCurrent,
    setShowSettings,
  } = useStore();

  const abortRef = useRef<AbortController | null>(null);

  const canStart = token && vaultPath && selectedItems.size > 0 && !isMigrating;

  const handleStartMigration = () => {
    if (!canStart) return;

    clearMigrationEvents();
    setIsMigrating(true);

    const items = Array.from(selectedItems.values());

    abortRef.current = startMigration(
      token,
      vaultPath,
      items,
      config,
      (event: MigrationEvent) => {
        addMigrationEvent(event);

        if (event.type === 'total') {
          setMigrationTotal(event.total || 0);
        }
        if (event.type === 'progress' || event.type === 'page_done') {
          setMigrationCurrent(event.current || 0);
        }
        if (event.type === 'done' || event.type === 'error' || event.type === 'cancelled') {
          setIsMigrating(false);
        }
      },
      (error: string) => {
        addMigrationEvent({ type: 'error', message: error });
        setIsMigrating(false);
      },
    );
  };

  const handleCancel = async () => {
    try {
      await cancelMigration();
      abortRef.current?.abort();
    } catch { /* ignore */ }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <div className="header-logo">🔄</div>
          <div>
            <div className="header-title">Notion → Obsidian</div>
            <div className="header-subtitle">数据迁移工具</div>
          </div>
        </div>
        <div className="header-actions">
          {isMigrating && (
            <button className="btn btn-danger btn-sm" onClick={handleCancel}>
              <X size={14} />
              取消迁移
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
            <SettingsIcon size={16} />
            设置
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="main-content">
        {/* Left: Notion Browser */}
        <NotionBrowser />

        {/* Right: Config + Progress */}
        <div className="right-panel">
          <MigrationConfig />

          {/* Start button */}
          {selectedItems.size > 0 && !isMigrating && (
            <button
              className="btn btn-primary start-migration-btn"
              disabled={!canStart}
              onClick={handleStartMigration}
            >
              <Rocket size={18} />
              开始迁移 ({selectedItems.size} 项)
            </button>
          )}

          <MigrationProgress />
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}
