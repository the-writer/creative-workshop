// 共享 UI 组件：提示条、印章、印框 chip、空态、结构标签等

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NameGender, RaceKey, RarityTier, StructurePart } from '@/lib/types';
import { GENDER_LABELS, raceLabel } from '@/lib/types';

/* ---------------- Toast ---------------- */

type ToastType = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  type: ToastType;
  text: string;
}

interface ToastContextValue {
  show: (text: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => undefined });

export function useAppToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((text: string, type: ToastType = 'info') => {
    const id = ++counter.current;
    setItems((prev) => [...prev.slice(-2), { id, type, text }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-layer">
        {items.map((t) => (
          <div key={t.id} className={cn('toast-item', `toast-${t.type}`)} role="status">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- 族群印章 ---------------- */

export function Seal({ race, size = 28, className }: { race: RaceKey; size?: number; className?: string }) {
  const label = race === 'elf' ? '精灵族' : race === 'yaogui' ? '妖鬼' : race === 'mixed' ? '混血' : '人族';
  const mark = race === 'elf' ? '灵' : race === 'yaogui' ? '妖' : race === 'mixed' ? '混' : '人';
  return (
    <span
      className={cn('seal-fallback', race === 'elf' && 'seal-elf', race === 'yaogui' && 'seal-yaogui', race === 'mixed' && 'seal-mixed', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.46) }}
      data-testid={`seal-${race}-${size}`}
      aria-label={label}
    >
      {mark}
    </span>
  );
}

export function SealBadge({ race, size = 20 }: { race: RaceKey; size?: number }) {
  return <Seal race={race} size={size} />;
}

/* ---------------- Chip ---------------- */

export function Chip({
  selected,
  onClick,
  children,
  tone = 'human',
  className,
  dataTestId,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  tone?: 'human' | 'elf' | 'yaogui' | 'mixed' | 'neutral';
  className?: string;
  dataTestId?: string;
}) {
  return (
    <button type="button" data-testid={dataTestId} onClick={onClick} className={cn('app-chip', selected && `app-chip-selected chip-tone-${tone}`, className)}>
      {children}
    </button>
  );
}

/* ---------------- 结构标签 ---------------- */

function isSurnameStructureLabel(label: string): boolean {
  return label === '姓氏' || label.startsWith('姓氏（') || label.startsWith('稀有姓氏');
}

export function visibleStructureParts(parts: StructurePart[]): StructurePart[] {
  return (parts ?? []).filter((part) => !isSurnameStructureLabel(part.label));
}

export function StructureTags({ parts, race, gender, rarity }: { parts: StructurePart[]; race: RaceKey; gender?: NameGender; rarity?: RarityTier }) {
  const visibleParts = visibleStructureParts(parts);
  const hasParts = visibleParts.length > 0;
  if (!hasParts && !gender && !rarity) return null;
  return (
    <div className="structure-tags">
      {hasParts
        ? visibleParts.map((p, i) => (
            <span key={`${p.label}-${i}`} className={cn('structure-tag', `tag-race-${race}`)}>
              {p.label}·{p.word}
            </span>
          ))
        : null}
      {rarity ? (
        <span className={cn('structure-tag', 'tag-rarity', `tag-rarity-${rarity.toLowerCase()}`)} title={`稀有度 ${rarity}`}>
          {rarity}
        </span>
      ) : null}
      {gender ? <span className={cn('structure-tag', 'tag-gender', `tag-gender-${gender}`)}>{GENDER_LABELS[gender]}</span> : null}
    </div>
  );
}

/* ---------------- 空态 ---------------- */

export function EmptyState({ title, desc, actions, testId }: { title: string; desc?: string; actions?: React.ReactNode; testId?: string }) {
  return (
    <div className="empty-state" data-testid={testId}>
      <div className="empty-seal-row">
        <Seal race="human" size={34} />
        <Seal race="elf" size={34} />
        <Seal race="yaogui" size={34} />
        <Seal race="mixed" size={34} />
      </div>
      <p className="empty-title">{title}</p>
      {desc ? <p className="empty-desc">{desc}</p> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  );
}

/* ---------------- 区块标题 ---------------- */

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="section-title-row">
      <h3 className="section-title">{children}</h3>
      {right ? <div className="section-title-right">{right}</div> : null}
    </div>
  );
}

/* ---------------- 确认弹窗（复用 AlertDialog 原语） ---------------- */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  destructive,
  showCancel = true,
  onConfirm,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  showCancel?: boolean;
  onConfirm: () => void;
  testId?: string;
}) {
  useEscape(open, () => onOpenChange(false));
  if (!open) return null;
  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" data-testid={testId}>
        <h2 id="confirm-title" className="dialog-title">
          {title}
        </h2>
        {description ? <div className="dialog-description">{description}</div> : null}
        <div className="dialog-actions">
          {showCancel ? (
            <button type="button" className="secondary-btn" onClick={() => onOpenChange(false)} data-testid={testId ? `${testId}-cancel` : undefined}>
              {cancelText}
            </button>
          ) : null}
          <button
            type="button"
            className={destructive ? 'danger-btn' : 'primary-btn'}
            onClick={() => onConfirm()}
            data-testid={testId ? `${testId}-confirm` : undefined}
          >
            {confirmText}
          </button>
        </div>
      </section>
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  children,
  className,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div
      className="modal-layer sheet-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={cn('bottom-sheet', className)} role="dialog" aria-modal="true" data-testid={testId}>
        <button type="button" className="bottom-sheet-close" aria-label="关闭" onClick={onClose}>
          <X size={16} />
        </button>
        {children}
      </section>
    </div>
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);
}

/* ---------------- 通用辅助 ---------------- */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (window.workshop?.clipboard) {
      await window.workshop.clipboard.writeText(text);
      return true;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function formatTime(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function raceName(race: RaceKey): string {
  return raceLabel(race);
}
