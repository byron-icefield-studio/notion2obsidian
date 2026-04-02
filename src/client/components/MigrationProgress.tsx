import { CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';
import type { MigrationEvent } from '../types';

export default function MigrationProgress() {
  const { migrationEvents, migrationTotal, migrationCurrent, isMigrating } = useStore();

  if (migrationEvents.length === 0) return null;

  const pageEvents = migrationEvents.filter(e => e.type === 'page_done');
  const successCount = pageEvents.filter(e => e.status === 'success').length;
  const failedCount = pageEvents.filter(e => e.status === 'failed').length;
  const doneEvent = migrationEvents.find(e => e.type === 'done');
  const errorEvent = migrationEvents.find(e => e.type === 'error');
  const cancelledEvent = migrationEvents.find(e => e.type === 'cancelled');
  const percent = migrationTotal > 0 ? Math.round((migrationCurrent / migrationTotal) * 100) : 0;

  const isFinished = !!doneEvent || !!errorEvent || !!cancelledEvent;

  return (
    <div className="progress-panel glass-card">
      <div className="progress-header">
        <div className="config-card-header" style={{ margin: 0 }}>
          {isFinished ? (
            doneEvent ? <CheckCircle2 size={18} style={{ color: 'var(--success)' }} /> :
            cancelledEvent ? <AlertTriangle size={18} style={{ color: 'var(--warning)' }} /> :
            <XCircle size={18} style={{ color: 'var(--error)' }} />
          ) : (
            <Clock size={18} className="animate-pulse" />
          )}
          <span>
            {isFinished
              ? (doneEvent ? '迁移完成' : cancelledEvent ? '迁移已取消' : '迁移出错')
              : '正在迁移...'
            }
          </span>
        </div>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {percent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="progress-bar" style={{ marginBottom: 4 }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${percent}%`,
            background: errorEvent ? 'var(--error)' : cancelledEvent ? 'var(--warning)' : undefined,
          }}
        />
      </div>

      {/* Stats */}
      <div className="progress-stats">
        <div className="progress-stat">
          <span style={{ color: 'var(--text-muted)' }}>总计</span>
          <span className="progress-stat-value">{migrationTotal}</span>
        </div>
        <div className="progress-stat">
          <CheckCircle2 size={13} style={{ color: 'var(--success)' }} />
          <span className="progress-stat-value" style={{ color: 'var(--success)' }}>{successCount}</span>
        </div>
        <div className="progress-stat">
          <XCircle size={13} style={{ color: 'var(--error)' }} />
          <span className="progress-stat-value" style={{ color: 'var(--error)' }}>{failedCount}</span>
        </div>
      </div>

      {/* Log */}
      <div className="progress-log">
        {pageEvents.map((event, index) => (
          <div
            key={index}
            className={`progress-log-item ${event.status}`}
          >
            {event.status === 'success' ? (
              <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
            ) : (
              <XCircle size={14} style={{ color: 'var(--error)', flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {event.title}
            </span>
            {event.status === 'success' && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0 }}>
                {event.path}
              </span>
            )}
            {event.status === 'success' && event.imageCount > 0 && (
              <span className="badge badge-purple" style={{ flexShrink: 0 }}>
                🖼 {event.imageCount}
              </span>
            )}
            {event.status === 'failed' && (
              /* 用 CSS overflow + title 展示完整错误，不再硬截断 / Show full error via title, no hard substring cut */
              <span
                style={{
                  color: 'var(--error)',
                  fontSize: '0.75rem',
                  flexShrink: 0,
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={event.error}
              >
                {event.error}
              </span>
            )}
          </div>
        ))}

        {isMigrating && (
          <div className="progress-log-item pending">
            <div className="animate-spin" style={{ width: 14, height: 14, border: '2px solid var(--text-muted)', borderTopColor: 'var(--accent-purple)', borderRadius: '50%', flexShrink: 0 }} />
            <span>处理中...</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {errorEvent && (
        <div className="error-banner" style={{ marginTop: 12 }}>
          <AlertTriangle size={15} />
          {errorEvent.message}
        </div>
      )}
    </div>
  );
}
