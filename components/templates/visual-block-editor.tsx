'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Type,
  Image as ImageIcon,
  MousePointer,
  Minus,
  Columns,
  Layout,
  Layers,
  AlignCenter,
  AlignLeft,
  AlignRight,
  MoveVertical,
} from 'lucide-react';

// ─── Block Types ─────────────────────────────────────────────────────────────

export type BlockType =
  | 'header'
  | 'hero'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'two-columns'
  | 'footer';

export interface Block {
  id: string;
  type: BlockType;
  settings: Record<string, string>;
}

const DEFAULT_SETTINGS: Record<BlockType, Record<string, string>> = {
  header: {
    logoText: 'Company Name',
    backgroundColor: '#ffffff',
    textColor: '#111827',
  },
  hero: {
    headline: 'Your Headline Here',
    subtext: 'A short supporting sentence that explains your offer.',
    backgroundColor: '#4F46E5',
    textColor: '#ffffff',
    buttonLabel: 'Get Started',
    buttonUrl: '#',
    buttonBg: '#ffffff',
    buttonTextColor: '#4F46E5',
  },
  text: {
    content: 'Add your text content here. This is a paragraph block for email copy.',
    textColor: '#374151',
    fontSize: '16',
    textAlign: 'left',
  },
  image: {
    src: '',
    alt: 'Image',
    alignment: 'center',
    width: '100%',
  },
  button: {
    label: 'Click Here',
    url: '#',
    backgroundColor: '#4F46E5',
    textColor: '#ffffff',
    alignment: 'center',
  },
  divider: {
    color: '#e5e7eb',
    marginTop: '16',
    marginBottom: '16',
  },
  'two-columns': {
    leftContent: 'Left column content goes here.',
    rightContent: 'Right column content goes here.',
    textColor: '#374151',
    fontSize: '15',
  },
  footer: {
    text: '© 2025 Company Name. All rights reserved.',
    unsubscribeText: 'Unsubscribe',
    unsubscribeUrl: '{{unsubscribeUrl}}',
    backgroundColor: '#f9fafb',
    textColor: '#6b7280',
  },
};

// ─── Block Palette Config ─────────────────────────────────────────────────────

const BLOCK_PALETTE: { type: BlockType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'header', label: 'Header', icon: <Layout className="h-4 w-4" />, description: 'Logo & brand name' },
  { type: 'hero', label: 'Hero', icon: <Layers className="h-4 w-4" />, description: 'Headline with CTA' },
  { type: 'text', label: 'Text', icon: <Type className="h-4 w-4" />, description: 'Paragraph copy' },
  { type: 'image', label: 'Image', icon: <ImageIcon className="h-4 w-4" />, description: 'Single image' },
  { type: 'button', label: 'Button', icon: <MousePointer className="h-4 w-4" />, description: 'Call-to-action' },
  { type: 'divider', label: 'Divider', icon: <Minus className="h-4 w-4" />, description: 'Horizontal rule' },
  { type: 'two-columns', label: '2 Columns', icon: <Columns className="h-4 w-4" />, description: 'Side-by-side layout' },
  { type: 'footer', label: 'Footer', icon: <AlignCenter className="h-4 w-4" />, description: 'Footer & unsubscribe' },
];

// ─── HTML Generation ──────────────────────────────────────────────────────────

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateUrl(s: unknown): string {
  const str = String(s ?? '').trim();
  if (/^https?:\/\//i.test(str)) return str;
  if (/^data:image\//i.test(str)) return str;
  return '#';
}

function sanitizeColor(s: unknown): string {
  const str = String(s ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(str)) return str;
  if (/^(rgb|rgba|hsl|hsla)\([\d,.\s%/]+\)$/.test(str)) return str;
  if (/^[a-zA-Z]{2,30}$/.test(str)) return str;
  return 'inherit';
}

function safeNum(s: unknown, fallback: number): number {
  const n = Number(s);
  return isFinite(n) ? n : fallback;
}

function sanitizeAlign(s: unknown): string {
  const str = String(s ?? '').trim().toLowerCase();
  return ['left', 'center', 'right', 'justify'].includes(str) ? str : 'left';
}

function blockToHTML(block: Block): string {
  const s = block.settings;
  switch (block.type) {
    case 'header':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${sanitizeColor(s.backgroundColor)};padding:20px 40px;">
  <tr><td style="font-size:22px;font-weight:700;color:${sanitizeColor(s.textColor)};font-family:sans-serif;">${escapeHtml(s.logoText)}</td></tr>
</table>`;

    case 'hero':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${sanitizeColor(s.backgroundColor)};padding:60px 40px;text-align:center;">
  <tr><td style="font-size:36px;font-weight:800;color:${sanitizeColor(s.textColor)};font-family:sans-serif;padding-bottom:16px;">${escapeHtml(s.headline)}</td></tr>
  <tr><td style="font-size:16px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;opacity:0.85;padding-bottom:32px;">${escapeHtml(s.subtext)}</td></tr>
  <tr><td><a href="${validateUrl(s.buttonUrl)}" style="display:inline-block;background-color:${sanitizeColor(s.buttonBg)};color:${sanitizeColor(s.buttonTextColor)};font-family:sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${escapeHtml(s.buttonLabel)}</a></td></tr>
</table>`;

    case 'text':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 40px;">
  <tr><td style="font-size:${safeNum(s.fontSize, 16)}px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;line-height:1.7;text-align:${sanitizeAlign(s.textAlign)};">${escapeHtml(s.content)}</td></tr>
</table>`;

    case 'image':
      if (!s.src) return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 40px;"><tr><td style="text-align:${sanitizeAlign(s.alignment)};"><div style="background:#f3f4f6;border:2px dashed #d1d5db;padding:40px;border-radius:8px;color:#9ca3af;font-family:sans-serif;font-size:14px;">Image placeholder — add a URL</div></td></tr></table>`;
      return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 40px;">
  <tr><td style="text-align:${sanitizeAlign(s.alignment)};"><img src="${validateUrl(s.src)}" alt="${escapeHtml(s.alt)}" width="${safeNum(s.width, 600)}" style="max-width:100%;border-radius:6px;" /></td></tr>
</table>`;

    case 'button':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 40px;">
  <tr><td style="text-align:${sanitizeAlign(s.alignment)};"><a href="${validateUrl(s.url)}" style="display:inline-block;background-color:${sanitizeColor(s.backgroundColor)};color:${sanitizeColor(s.textColor)};font-family:sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${escapeHtml(s.label)}</a></td></tr>
</table>`;

    case 'divider':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:${safeNum(s.marginTop, 0)}px 40px ${safeNum(s.marginBottom, 0)}px;">
  <tr><td><hr style="border:none;border-top:1px solid ${sanitizeColor(s.color)};margin:0;" /></td></tr>
</table>`;

    case 'two-columns':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 40px;">
  <tr>
    <td width="48%" style="font-size:${safeNum(s.fontSize, 16)}px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;line-height:1.7;vertical-align:top;padding-right:16px;">${escapeHtml(s.leftContent)}</td>
    <td width="4%"></td>
    <td width="48%" style="font-size:${safeNum(s.fontSize, 16)}px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;line-height:1.7;vertical-align:top;">${escapeHtml(s.rightContent)}</td>
  </tr>
</table>`;

    case 'footer':
      return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${sanitizeColor(s.backgroundColor)};padding:32px 40px;text-align:center;">
  <tr><td style="font-size:13px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;padding-bottom:8px;">${escapeHtml(s.text)}</td></tr>
  <tr><td><a href="${validateUrl(s.unsubscribeUrl)}" style="font-size:12px;color:${sanitizeColor(s.textColor)};font-family:sans-serif;text-decoration:underline;">${escapeHtml(s.unsubscribeText)}</a></td></tr>
</table>`;

    default:
      return '';
  }
}

export function blocksToHTML(blocks: Block[]): string {
  const body = blocks.map(blockToHTML).join('\n');
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;">
        <tr><td>
${body}
        </td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ─── Block Canvas Preview ─────────────────────────────────────────────────────

function BlockPreview({ block, isSelected, onClick, onMoveUp, onMoveDown, onDelete, isFirst, isLast }: {
  block: Block;
  isSelected: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const s = block.settings;

  const renderPreview = () => {
    switch (block.type) {
      case 'header':
        return (
          <div style={{ backgroundColor: s.backgroundColor, padding: '16px 32px' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: s.textColor, fontFamily: 'sans-serif' }}>
              {s.logoText}
            </span>
          </div>
        );
      case 'hero':
        return (
          <div style={{ backgroundColor: s.backgroundColor, padding: '40px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.textColor, fontFamily: 'sans-serif', marginBottom: 10 }}>{s.headline}</div>
            <div style={{ fontSize: 14, color: s.textColor, fontFamily: 'sans-serif', opacity: 0.85, marginBottom: 20 }}>{s.subtext}</div>
            <span style={{ display: 'inline-block', backgroundColor: s.buttonBg, color: s.buttonTextColor, fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600, padding: '10px 24px', borderRadius: 8 }}>{s.buttonLabel}</span>
          </div>
        );
      case 'text':
        return (
          <div style={{ padding: '16px 32px', textAlign: s.textAlign as 'left' | 'center' | 'right' }}>
            <p style={{ fontSize: 14, color: s.textColor, fontFamily: 'sans-serif', lineHeight: 1.7, margin: 0 }}>{s.content}</p>
          </div>
        );
      case 'image':
        return (
          <div style={{ padding: '16px 32px', textAlign: s.alignment as 'left' | 'center' | 'right' }}>
            {s.src ? (
              <img src={s.src} alt={s.alt} style={{ maxWidth: '100%', borderRadius: 6, maxHeight: 120, objectFit: 'cover' }} />
            ) : (
              <div style={{ background: '#f3f4f6', border: '2px dashed #d1d5db', padding: '24px', borderRadius: 8, color: '#9ca3af', fontSize: 13, fontFamily: 'sans-serif', textAlign: 'center' }}>
                Image — add a URL in settings
              </div>
            )}
          </div>
        );
      case 'button':
        return (
          <div style={{ padding: '16px 32px', textAlign: s.alignment as 'left' | 'center' | 'right' }}>
            <span style={{ display: 'inline-block', backgroundColor: s.backgroundColor, color: s.textColor, fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600, padding: '10px 24px', borderRadius: 8 }}>{s.label}</span>
          </div>
        );
      case 'divider':
        return (
          <div style={{ padding: '12px 32px' }}>
            <hr style={{ border: 'none', borderTop: `1px solid ${s.color}` }} />
          </div>
        );
      case 'two-columns':
        return (
          <div style={{ padding: '16px 32px', display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, fontSize: 13, color: s.textColor, fontFamily: 'sans-serif', lineHeight: 1.7 }}>{s.leftContent}</div>
            <div style={{ flex: 1, fontSize: 13, color: s.textColor, fontFamily: 'sans-serif', lineHeight: 1.7 }}>{s.rightContent}</div>
          </div>
        );
      case 'footer':
        return (
          <div style={{ backgroundColor: s.backgroundColor, padding: '24px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: s.textColor, fontFamily: 'sans-serif', marginBottom: 6 }}>{s.text}</div>
            <span style={{ fontSize: 11, color: s.textColor, fontFamily: 'sans-serif', textDecoration: 'underline' }}>{s.unsubscribeText}</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative group cursor-pointer border-2 transition-all ${isSelected ? 'border-orange-500' : 'border-transparent hover:border-orange-200'}`}
    >
      {renderPreview()}

      {/* Block controls */}
      <div className={`absolute top-2 right-2 flex gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-700/90 text-white shadow hover:bg-gray-800 disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-700/90 text-white shadow hover:bg-gray-800 disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/90 text-white shadow hover:bg-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isSelected && (
        <div className="absolute inset-0 pointer-events-none ring-2 ring-orange-500 ring-inset" />
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-gray-200 p-1"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 font-mono text-sm"
        />
      </div>
    </div>
  );
}

function AlignmentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">Alignment</Label>
      <div className="flex gap-1">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            onClick={() => onChange(align)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${value === align ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            {align === 'left' ? <AlignLeft className="h-4 w-4" /> : align === 'center' ? <AlignCenter className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

function SettingsPanel({ block, onChange }: { block: Block; onChange: (settings: Record<string, string>) => void }) {
  const s = block.settings;
  const set = (key: string, value: string) => onChange({ ...s, [key]: value });

  switch (block.type) {
    case 'header':
      return (
        <div className="space-y-4">
          <Field label="Brand Name / Logo Text"><Input value={s.logoText} onChange={(e) => set('logoText', e.target.value)} className="h-9 text-sm" /></Field>
          <ColorInput label="Background" value={s.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
        </div>
      );
    case 'hero':
      return (
        <div className="space-y-4">
          <Field label="Headline"><Input value={s.headline} onChange={(e) => set('headline', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="Subtext"><Textarea value={s.subtext} onChange={(e) => set('subtext', e.target.value)} className="min-h-[72px] text-sm" /></Field>
          <ColorInput label="Background" value={s.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
          <Field label="Button Label"><Input value={s.buttonLabel} onChange={(e) => set('buttonLabel', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="Button URL"><Input value={s.buttonUrl} onChange={(e) => set('buttonUrl', e.target.value)} className="h-9 text-sm" /></Field>
          <ColorInput label="Button Background" value={s.buttonBg} onChange={(v) => set('buttonBg', v)} />
          <ColorInput label="Button Text Color" value={s.buttonTextColor} onChange={(v) => set('buttonTextColor', v)} />
        </div>
      );
    case 'text':
      return (
        <div className="space-y-4">
          <Field label="Content"><Textarea value={s.content} onChange={(e) => set('content', e.target.value)} className="min-h-[120px] text-sm" /></Field>
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
          <Field label="Font Size (px)"><Input type="number" value={s.fontSize} onChange={(e) => set('fontSize', e.target.value)} className="h-9 text-sm" /></Field>
          <AlignmentPicker value={s.textAlign} onChange={(v) => set('textAlign', v)} />
        </div>
      );
    case 'image':
      return (
        <div className="space-y-4">
          <Field label="Image URL"><Input value={s.src} onChange={(e) => set('src', e.target.value)} placeholder="https://…" className="h-9 text-sm" /></Field>
          <Field label="Alt Text"><Input value={s.alt} onChange={(e) => set('alt', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="Width"><Input value={s.width} onChange={(e) => set('width', e.target.value)} placeholder="100%" className="h-9 text-sm" /></Field>
          <AlignmentPicker value={s.alignment} onChange={(v) => set('alignment', v)} />
        </div>
      );
    case 'button':
      return (
        <div className="space-y-4">
          <Field label="Label"><Input value={s.label} onChange={(e) => set('label', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="URL"><Input value={s.url} onChange={(e) => set('url', e.target.value)} className="h-9 text-sm" /></Field>
          <ColorInput label="Background" value={s.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
          <AlignmentPicker value={s.alignment} onChange={(v) => set('alignment', v)} />
        </div>
      );
    case 'divider':
      return (
        <div className="space-y-4">
          <ColorInput label="Color" value={s.color} onChange={(v) => set('color', v)} />
          <Field label="Top Margin (px)"><Input type="number" value={s.marginTop} onChange={(e) => set('marginTop', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="Bottom Margin (px)"><Input type="number" value={s.marginBottom} onChange={(e) => set('marginBottom', e.target.value)} className="h-9 text-sm" /></Field>
        </div>
      );
    case 'two-columns':
      return (
        <div className="space-y-4">
          <Field label="Left Column"><Textarea value={s.leftContent} onChange={(e) => set('leftContent', e.target.value)} className="min-h-[80px] text-sm" /></Field>
          <Field label="Right Column"><Textarea value={s.rightContent} onChange={(e) => set('rightContent', e.target.value)} className="min-h-[80px] text-sm" /></Field>
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
          <Field label="Font Size (px)"><Input type="number" value={s.fontSize} onChange={(e) => set('fontSize', e.target.value)} className="h-9 text-sm" /></Field>
        </div>
      );
    case 'footer':
      return (
        <div className="space-y-4">
          <Field label="Footer Text"><Textarea value={s.text} onChange={(e) => set('text', e.target.value)} className="min-h-[60px] text-sm" /></Field>
          <Field label="Unsubscribe Label"><Input value={s.unsubscribeText} onChange={(e) => set('unsubscribeText', e.target.value)} className="h-9 text-sm" /></Field>
          <Field label="Unsubscribe URL"><Input value={s.unsubscribeUrl} onChange={(e) => set('unsubscribeUrl', e.target.value)} className="h-9 text-sm" /></Field>
          <ColorInput label="Background" value={s.backgroundColor} onChange={(v) => set('backgroundColor', v)} />
          <ColorInput label="Text Color" value={s.textColor} onChange={(v) => set('textColor', v)} />
        </div>
      );
    default:
      return null;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface VisualBlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function VisualBlockEditor({ blocks, onChange }: VisualBlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback((type: BlockType) => {
    const newBlock: Block = {
      id: crypto.randomUUID(),
      type,
      settings: { ...DEFAULT_SETTINGS[type] },
    };
    onChange([...blocks, newBlock]);
    setSelectedId(newBlock.id);
  }, [blocks, onChange]);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const newBlocks = [...blocks];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newBlocks.length) return;
    [newBlocks[idx], newBlocks[swapIdx]] = [newBlocks[swapIdx], newBlocks[idx]];
    onChange(newBlocks);
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [blocks, onChange, selectedId]);

  const updateBlock = useCallback((id: string, settings: Record<string, string>) => {
    onChange(blocks.map((b) => b.id === id ? { ...b, settings } : b));
  }, [blocks, onChange]);

  return (
    <div className="flex h-full min-h-[600px] gap-0 rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Left: Block palette */}
      <div className="w-[176px] shrink-0 border-r border-gray-100 bg-gray-50 p-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Blocks</p>
        <div className="space-y-1">
          {BLOCK_PALETTE.map(({ type, label, icon, description }) => (
            <button
              key={type}
              onClick={() => addBlock(type)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-white hover:shadow-sm"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-indigo-500 shadow-sm group-hover:bg-indigo-50">
                {icon}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-700">{label}</div>
                <div className="text-[10px] text-gray-400 leading-tight">{description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 overflow-y-auto bg-gray-100 p-6">
        <div className="mx-auto w-full max-w-[600px] overflow-hidden rounded-xl shadow-md">
          {/* Email client chrome */}
          <div className="bg-gray-200 px-4 py-2.5 flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 mx-4 bg-white rounded text-[11px] text-gray-400 px-3 py-0.5 text-center truncate">Email Preview</div>
          </div>

          {/* Email body */}
          <div className="bg-white min-h-[400px]">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
                  <MoveVertical className="h-5 w-5 text-indigo-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">Add blocks from the left panel</p>
                <p className="mt-1 text-xs text-gray-400">Click any block type to add it here</p>
              </div>
            ) : (
              blocks.map((block, idx) => (
                <BlockPreview
                  key={block.id}
                  block={block}
                  isSelected={selectedId === block.id}
                  onClick={() => setSelectedId(block.id === selectedId ? null : block.id)}
                  onMoveUp={() => moveBlock(block.id, 'up')}
                  onMoveDown={() => moveBlock(block.id, 'down')}
                  onDelete={() => deleteBlock(block.id)}
                  isFirst={idx === 0}
                  isLast={idx === blocks.length - 1}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right: Settings */}
      <div className="w-80 shrink-0 border-l border-gray-100 bg-white">
        {selectedBlock ? (
          <div className="h-full overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                {BLOCK_PALETTE.find((b) => b.type === selectedBlock.type)?.label} Settings
              </p>
              <button onClick={() => setSelectedId(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <SettingsPanel
              block={selectedBlock}
              onChange={(settings) => updateBlock(selectedBlock.id, settings)}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
              <Layout className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">Select a block to<br />edit its settings</p>
          </div>
        )}
      </div>
    </div>
  );
}
