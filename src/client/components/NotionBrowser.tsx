import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Database, FileText, Loader, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { getDatabaseSchema, searchNotion } from '../services/api';

export default function NotionBrowser() {
  const {
    token,
    notionItems, setNotionItems,
    isLoading, setIsLoading,
    error, setError,
    selectedItems, toggleItem,
    databaseSchemas, setDatabaseSchema,
    setShowSettings,
  } = useStore();

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [loadingDbs, setLoadingDbs] = useState<Set<string>>(new Set());

  // Organize items into tree: databases at top level, pages grouped by parent
  const databases = notionItems.filter(i => i.type === 'database');
  const standalonePages = notionItems.filter(i => i.type === 'page' && !i.parentId);
  const pagesByDb = new Map<string, typeof notionItems>();
  notionItems.filter(i => i.type === 'page' && i.parentId).forEach(p => {
    const arr = pagesByDb.get(p.parentId!) || [];
    arr.push(p);
    pagesByDb.set(p.parentId!, arr);
  });

  const handleRefresh = async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const items = await searchNotion(token);
      setNotionItems(items);
    } catch (err: any) {
      setError(err.message || '刷新失败');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = useCallback(async (dbId: string) => {
    setExpandedDbs(prev => {
      const next = new Set(prev);
      if (next.has(dbId)) {
        next.delete(dbId);
      } else {
        next.add(dbId);
      }
      return next;
    });

    // Load schema if not cached
    if (!databaseSchemas[dbId] && token) {
      setLoadingDbs(prev => new Set(prev).add(dbId));
      try {
        const schema = await getDatabaseSchema(token, dbId);
        setDatabaseSchema(dbId, schema);
      } catch (err) {
        console.error('获取数据库结构失败:', err);
      } finally {
        setLoadingDbs(prev => {
          const next = new Set(prev);
          next.delete(dbId);
          return next;
        });
      }
    }
  }, [token, databaseSchemas, setDatabaseSchema]);

  const isSelected = (id: string) => selectedItems.has(id);

  const handleToggleItem = (item: { id: string; type: 'database' | 'page'; title: string }) => {
    toggleItem(item);
  };

  // Select all pages in a database
  const toggleDatabase = (dbId: string, dbTitle: string) => {
    const dbItem = { id: dbId, type: 'database' as const, title: dbTitle };
    handleToggleItem(dbItem);
  };

  const selectedCount = selectedItems.size;

  if (!token) {
    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <h3><Database size={16} /> Notion 工作空间</h3>
        </div>
        <div className="empty-state" style={{ flex: 1 }}>
          <Database size={40} />
          <p>请先配置 Notion Token</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSettings(true)}>
            打开设置
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h3><Database size={16} /> 工作空间</h3>
        <button
          className="btn btn-icon btn-ghost"
          onClick={handleRefresh}
          disabled={isLoading}
          title="刷新"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="sidebar-body">
        {isLoading && notionItems.length === 0 ? (
          <div className="empty-state">
            <Loader size={24} className="animate-spin" />
            <p>加载中...</p>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="error-banner" style={{ width: '100%' }}>
              {error}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleRefresh} style={{ marginTop: 8 }}>
              重试
            </button>
          </div>
        ) : notionItems.length === 0 ? (
          <div className="empty-state">
            <Database size={32} />
            <p>未发现数据</p>
            <p style={{ fontSize: '0.78rem' }}>请确认已共享页面给 Integration</p>
          </div>
        ) : (
          <>
            {/* Databases */}
            {databases.map(db => {
              const isExpanded = expandedDbs.has(db.id);
              const isDbLoading = loadingDbs.has(db.id);
              const childPages = pagesByDb.get(db.id) || [];

              return (
                <div key={db.id} className="animate-fade-in">
                  <div className="tree-item">
                    <div
                      className="tree-item-toggle"
                      onClick={() => toggleExpand(db.id)}
                    >
                      {isDbLoading ? (
                        <Loader size={12} className="animate-spin" />
                      ) : isExpanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </div>
                    <div
                      className={`checkbox ${isSelected(db.id) ? 'checked' : ''}`}
                      onClick={() => toggleDatabase(db.id, db.title)}
                    >
                      {isSelected(db.id) && <span style={{ fontSize: 11, color: 'white' }}>✓</span>}
                    </div>
                    <span className="tree-item-icon">{db.icon || '📊'}</span>
                    <span className="tree-item-title" onClick={() => toggleExpand(db.id)}>{db.title}</span>
                    {childPages.length > 0 && (
                      <span className="badge badge-purple">{childPages.length}</span>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="tree-children">
                      {childPages.length === 0 ? (
                        <div style={{ padding: '8px 10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {isDbLoading ? '加载中...' : '暂无页面'}
                        </div>
                      ) : (
                        childPages.map(page => (
                          <div key={page.id} className="tree-item animate-slide-in">
                            <div style={{ width: 20 }} />
                            <div
                              className={`checkbox ${isSelected(page.id) ? 'checked' : ''}`}
                              onClick={() => handleToggleItem({ id: page.id, type: 'page', title: page.title })}
                            >
                              {isSelected(page.id) && <span style={{ fontSize: 11, color: 'white' }}>✓</span>}
                            </div>
                            <span className="tree-item-icon">{page.icon || '📄'}</span>
                            <span className="tree-item-title">{page.title}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Standalone pages */}
            {standalonePages.length > 0 && (
              <>
                <div style={{ padding: '12px 10px 6px', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  独立页面
                </div>
                {standalonePages.map(page => (
                  <div key={page.id} className="tree-item animate-fade-in">
                    <div style={{ width: 20 }} />
                    <div
                      className={`checkbox ${isSelected(page.id) ? 'checked' : ''}`}
                      onClick={() => handleToggleItem({ id: page.id, type: 'page', title: page.title })}
                    >
                      {isSelected(page.id) && <span style={{ fontSize: 11, color: 'white' }}>✓</span>}
                    </div>
                    <span className="tree-item-icon">{page.icon || '📄'}</span>
                    <span className="tree-item-title">{page.title}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <span>已选择 {selectedCount} 项</span>
        {selectedCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => useStore.getState().clearSelection()}
            style={{ fontSize: '0.75rem' }}
          >
            清空
          </button>
        )}
      </div>
    </div>
  );
}
