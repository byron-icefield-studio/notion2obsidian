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
  const sessionIdRef = useRef<string | null>(null);

  const selectedCount = Object.keys(selectedItems).length;
  const canStart = Boolean(token && vaultPath && selectedCount > 0 && !isMigrating);

  /**
   * 清理当前迁移会话引用，避免取消操作落到旧 session
   * Clear active migration session refs to avoid cancelling stale sessions
   */
  const resetMigrationSession = () => {
    sessionIdRef.current = null;
    abortRef.current = null;
  };

  const handleStartMigration = () => {
    if (!canStart) return;

    clearMigrationEvents();
    setIsMigrating(true);

    const items = Object.values(selectedItems);
    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    abortRef.current = startMigration(
      token,
      vaultPath,
      sessionId,
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
          resetMigrationSession();
        }
      },
      (error: string) => {
        addMigrationEvent({ type: 'error', message: error });
        setIsMigrating(false);
        resetMigrationSession();
      },
    );
  };

  const handleCancel = async () => {
    try {
      if (sessionIdRef.current) {
        await cancelMigration(sessionIdRef.current);
      }
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
          {selectedCount > 0 && !isMigrating && (
            <button
              className="btn btn-primary start-migration-btn"
              disabled={!canStart}
              onClick={handleStartMigration}
            >
              <Rocket size={18} />
              开始迁移 ({selectedCount} 项)
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
