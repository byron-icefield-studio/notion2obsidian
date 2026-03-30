import { useState } from 'react';
import { Settings as SettingsIcon, Eye, EyeOff, X, Zap, FolderOpen, AlertCircle } from 'lucide-react';
import { useStore } from '../store';
import { searchNotion } from '../services/api';
import DirectoryPicker from './DirectoryPicker';

export default function Settings() {
  const {
    token, setToken,
    vaultPath, setVaultPath,
    showSettings, setShowSettings,
    setNotionItems, setIsLoading, setError, setDatabaseSchemas,
  } = useStore();

  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [localToken, setLocalToken] = useState(token);
  const [localVaultPath, setLocalVaultPath] = useState(vaultPath);

  const handleTestConnection = async () => {
    if (!localToken.trim()) {
      setTestResult({ ok: false, message: '请输入 Notion Token' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const items = await searchNotion(localToken);
      setTestResult({ ok: true, message: `连接成功！发现 ${items.length} 个项目` });
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || '连接失败' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setToken(localToken);
    setVaultPath(localVaultPath);

    if (localToken.trim()) {
      setIsLoading(true);
      setError(null);
      try {
        const items = await searchNotion(localToken);
        setNotionItems(items);
      } catch (err: any) {
        setError(err.message || '获取数据失败');
      } finally {
        setIsLoading(false);
      }
    }

    setShowSettings(false);
  };

  if (!showSettings) return null;

  return (
    <>
      <div className="overlay" onClick={() => setShowSettings(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">
            <SettingsIcon size={20} style={{ color: 'var(--accent-purple)' }} />
            设置
            <div style={{ flex: 1 }} />
            <button className="btn btn-icon btn-ghost" onClick={() => setShowSettings(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Notion Token */}
          <div className="form-group">
            <label className="form-label">Notion Integration Token</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={localToken}
                onChange={e => { setLocalToken(e.target.value); setTestResult(null); }}
                placeholder="ntn_xxxxxxxxxxxxxxxxxxxxx"
                style={{ paddingRight: 40 }}
              />
              <button
                className="btn btn-icon btn-ghost"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="form-hint">
              在 <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-purple)' }}>Notion Integrations</a> 创建，并共享要迁移的页面
            </div>
          </div>

          {/* Test Connection */}
          <div className="form-group">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleTestConnection}
              disabled={testing || !localToken.trim()}
            >
              {testing ? (
                <>
                  <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid var(--text-muted)', borderTopColor: 'var(--accent-purple)', borderRadius: '50%' }} />
                  测试中...
                </>
              ) : (
                <>
                  <Zap size={14} />
                  测试连接
                </>
              )}
            </button>
            {testResult && (
              <div
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  background: testResult.ok ? 'var(--success-dim)' : 'var(--error-dim)',
                  color: testResult.ok ? 'var(--success)' : 'var(--error)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {testResult.ok ? '✅' : <AlertCircle size={14} />}
                {testResult.message}
              </div>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0' }} />

          {/* Obsidian Vault Path */}
          <div className="form-group">
            <label className="form-label">Obsidian Vault 路径</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={localVaultPath}
                onChange={e => setLocalVaultPath(e.target.value)}
                placeholder="/Users/xxx/ObsidianVault"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDirPicker(true)}
              >
                <FolderOpen size={14} />
                浏览
              </button>
            </div>
            <div className="form-hint">
              Obsidian 库的本地路径，迁移的文件将写入此目录
            </div>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!localToken.trim() || !localVaultPath.trim()}
            >
              保存并加载
            </button>
          </div>
        </div>
      </div>

      <DirectoryPicker
        isOpen={showDirPicker}
        onClose={() => setShowDirPicker(false)}
        onSelect={path => setLocalVaultPath(path)}
        currentPath={localVaultPath}
      />
    </>
  );
}
