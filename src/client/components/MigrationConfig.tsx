import { useState } from 'react';
import { FolderTree, FileCode, Image, Info, FolderOpen } from 'lucide-react';
import { useStore } from '../store';
import DirectoryPicker from './DirectoryPicker';

// Available template variables with descriptions
const PATH_VARIABLES = [
  { var: '{{title}}', desc: '页面标题' },
  { var: '{{database}}', desc: '所属数据库名' },
  { var: '{{date}}', desc: '创建日期 YYYY-MM-DD' },
  { var: '{{date|year}}', desc: '创建年份' },
  { var: '{{date|month}}', desc: '创建月份' },
  { var: '{{date|day}}', desc: '创建日' },
  { var: '{{last_edited}}', desc: '最后编辑日期' },
  { var: '{{id}}', desc: 'Notion Page ID' },
  { var: '{{prop.属性名}}', desc: '任意属性值' },
];

const TEMPLATE_VARIABLES = [
  { var: '{{title}}', desc: '页面标题' },
  { var: '{{date}}', desc: '创建日期' },
  { var: '{{date|year}}', desc: '年份 (如 2025)' },
  { var: '{{date|month}}', desc: '月份 (如 03)' },
  { var: '{{date|day}}', desc: '日 (如 30)' },
  { var: '{{date|format:YYYY/MM/DD}}', desc: '自定义日期格式' },
  { var: '{{last_edited}}', desc: '最后编辑日期' },
  { var: '{{last_edited|year}}', desc: '最后编辑年份' },
  { var: '{{id}}', desc: 'Notion Page ID' },
  { var: '{{url}}', desc: 'Notion 原始链接' },
  { var: '{{content}}', desc: 'Markdown 正文' },
  { var: '{{prop.属性名}}', desc: '数据库属性值' },
  { var: '{{#each properties}}', desc: '遍历所有属性' },
  { var: '{{key}} / {{value}}', desc: 'each 内的键值' },
  { var: '{{/each}}', desc: '结束遍历' },
];

export default function MigrationConfig() {
  const { config, setConfig, selectedItems, vaultPath, setShowSettings } = useStore();
  const [showImageDirPicker, setShowImageDirPicker] = useState(false);
  const [activeVarGroup, setActiveVarGroup] = useState<'path' | 'template'>('path');

  const selectedCount = Object.keys(selectedItems).length;

  if (selectedCount === 0) {
    return (
      <div className="config-card glass-card">
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <FolderTree size={36} />
          <p style={{ color: 'var(--text-secondary)' }}>从左侧选择要迁移的数据</p>
          <p style={{ fontSize: '0.78rem' }}>选择数据库或独立页面后，在这里配置迁移规则</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Vault path reminder */}
      {!vaultPath && (
        <div className="error-banner" style={{ marginBottom: 0 }}>
          <Info size={16} />
          请先在设置中配置 Obsidian Vault 路径
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)} style={{ marginLeft: 'auto' }}>
            打开设置
          </button>
        </div>
      )}

      {/* Path Template */}
      <div className="config-card glass-card">
        <div className="config-card-header">
          <FolderTree size={18} />
          目标路径模板
        </div>

        <div className="form-group">
          <input
            type="text"
            value={config.pathTemplate}
            onChange={e => setConfig({ pathTemplate: e.target.value })}
            placeholder="{{database}}/{{title}}"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
          />
          <div className="form-hint">
            文件保存路径 = Vault根目录 / 路径模板.md
            {config.pathTemplate && (
              <span style={{ marginLeft: 8, color: 'var(--accent-purple)' }}>
                预览: {vaultPath || '/vault'}/{config.pathTemplate.replace(/\{\{(\w+)\}\}/g, '示例')}.md
              </span>
            )}
          </div>
        </div>

        <div className="section-title" style={{ marginTop: 12 }}>
          <Info size={12} />
          可用变量 <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>（点击复制）</span>
        </div>
        <div className="var-tags">
          {PATH_VARIABLES.map(v => (
            <span
              key={v.var}
              className="var-tag"
              title={v.desc}
              onClick={() => navigator.clipboard.writeText(v.var)}
            >
              {v.var}
            </span>
          ))}
        </div>
      </div>

      {/* Image Settings */}
      <div className="config-card glass-card">
        <div className="config-card-header">
          <Image size={18} />
          图片保存设置
        </div>

        <div className="radio-group">
          <label
            className="radio-label"
            onClick={() => setConfig({ imagePathType: 'relative' })}
          >
            <div className={`radio-dot ${config.imagePathType === 'relative' ? 'active' : ''}`} />
            <div>
              <div style={{ fontWeight: 500 }}>相对路径</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>相对于 MD 文件所在目录</div>
            </div>
          </label>
          <label
            className="radio-label"
            onClick={() => setConfig({ imagePathType: 'absolute' })}
          >
            <div className={`radio-dot ${config.imagePathType === 'absolute' ? 'active' : ''}`} />
            <div>
              <div style={{ fontWeight: 500 }}>绝对路径</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>指定固定目录存放所有图片</div>
            </div>
          </label>
        </div>

        <div className="form-group" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={config.imagePath}
              onChange={e => setConfig({ imagePath: e.target.value })}
              placeholder={config.imagePathType === 'relative' ? './assets' : '/Users/xxx/vault/assets'}
              style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
            />
            {config.imagePathType === 'absolute' && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowImageDirPicker(true)}
              >
                <FolderOpen size={14} />
                浏览
              </button>
            )}
          </div>
          <div className="form-hint">
            图片命名: UUID.ext，引用: ![[uuid.png]]
          </div>
        </div>
      </div>

      {/* MD Template */}
      <div className="config-card glass-card">
        <div className="config-card-header">
          <FileCode size={18} />
          Markdown 文件模板
        </div>

        <div className="template-editor">
          <textarea
            value={config.mdTemplate}
            onChange={e => setConfig({ mdTemplate: e.target.value })}
            rows={12}
            spellCheck={false}
          />
        </div>

        <div className="section-title" style={{ marginTop: 14 }}>
          <Info size={12} />
          可用变量
        </div>
        <div className="var-tags">
          {TEMPLATE_VARIABLES.map(v => (
            <span
              key={v.var}
              className="var-tag"
              title={v.desc}
              onClick={() => navigator.clipboard.writeText(v.var)}
            >
              {v.var}
            </span>
          ))}
        </div>
      </div>

      <DirectoryPicker
        isOpen={showImageDirPicker}
        onClose={() => setShowImageDirPicker(false)}
        onSelect={path => setConfig({ imagePath: path })}
        currentPath={config.imagePath}
      />
    </>
  );
}
