import { useState, useEffect } from 'react';
import { Folder, ChevronRight, ArrowUp, Check, X } from 'lucide-react';
import { getHomeDir, listDir } from '../services/api';
import type { DirEntry } from '../types';

interface DirectoryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  currentPath?: string;
}

export default function DirectoryPicker({ isOpen, onClose, onSelect, currentPath }: DirectoryPickerProps) {
  const [dirPath, setDirPath] = useState('');
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [parentPath, setParentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initPath = currentPath || '';
      if (initPath) {
        loadDir(initPath);
      } else {
        getHomeDir().then(home => loadDir(home)).catch(console.error);
      }
    }
  }, [isOpen]);

  const loadDir = async (path: string) => {
    setLoading(true);
    setSelected(null);
    try {
      const result = await listDir(path);
      setDirPath(result.current);
      setParentPath(result.parent);
      setDirs(result.dirs);
    } catch (err) {
      console.error('加载目录失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    const finalPath = selected || dirPath;
    onSelect(finalPath);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
        <div className="modal-title">
          <Folder size={20} />
          选择目录
        </div>

        {/* Current path display */}
        <div className="dir-picker-path">
          <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>📍</span>
          {dirPath}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => loadDir(parentPath)}
            disabled={dirPath === parentPath}
          >
            <ArrowUp size={14} />
            上级目录
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelected(null);
              // Select current directory
            }}
            style={!selected ? { background: 'var(--accent-purple-dim)', color: 'var(--accent-purple)' } : {}}
          >
            选择当前目录
          </button>
        </div>

        {/* Directory list */}
        <div className="dir-list">
          {loading ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid var(--text-muted)', borderTopColor: 'var(--accent-purple)', borderRadius: '50%' }} />
              加载中...
            </div>
          ) : dirs.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}>
              <span style={{ fontSize: '0.85rem' }}>此目录下没有子目录</span>
            </div>
          ) : (
            dirs.map(dir => (
              <div
                key={dir.path}
                className={`dir-item ${selected === dir.path ? 'selected' : ''}`}
                onClick={() => setSelected(dir.path)}
                onDoubleClick={() => loadDir(dir.path)}
              >
                <Folder size={16} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir.name}</span>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="dir-picker-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSelect}>
            <Check size={16} />
            选择: {selected ? selected.split('/').pop() : '当前目录'}
          </button>
        </div>
      </div>
    </div>
  );
}
