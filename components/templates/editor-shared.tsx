'use client';

import { useRef, useCallback, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, X } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VARIABLES = [
  '{{firstName}}',
  '{{lastName}}',
  '{{email}}',
  '{{companyName}}',
  '{{unsubscribeUrl}}',
];

export type EditorMode = 'visual' | 'html';

// ─── Switch-mode confirmation modals ─────────────────────────────────────────

export function SwitchToHTMLModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
          <span className="text-lg font-bold text-blue-600">&lt;/&gt;</span>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Switch to HTML editor?</h2>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">
          Your blocks will be converted to HTML. Manual HTML edits won't sync back to block form.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Convert to HTML
          </button>
        </div>
      </div>
    </div>
  );
}

export function SwitchToVisualModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100">
          <svg className="h-6 w-6 text-orange-500" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.6" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.3" />
          </svg>
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Switch to visual editor?</h2>
        <p className="mb-7 text-sm leading-relaxed text-gray-500">
          Your HTML will be discarded. The original visual blocks will be restored.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-orange-500 py-2.5 cursor-pointer text-sm font-semibold text-white hover:bg-orange-600"
          >
            Restore visual editor
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared dark top bar ──────────────────────────────────────────────────────

export function EditorTopBar({
  name,
  editorMode,
  previewMode,
  saving,
  onSwitchMode,
  onTogglePreview,
  onSave,
  onClose,
}: {
  name: string;
  editorMode: EditorMode;
  previewMode: boolean;
  saving: boolean;
  onSwitchMode: (target: EditorMode) => void;
  onTogglePreview: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between bg-[#01021f] px-5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="h-4 w-px bg-gray-700" />
        <span className="text-sm text-gray-400">{name.trim() || 'Untitled template'}</span>
      </div>

      <div className="flex items-center gap-2">
        {/* Visual / HTML toggle */}
        <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900 p-0.5">
          <button
            onClick={() => onSwitchMode('visual')}
            className={`rounded-md px-3 py-1.5 cursor-pointer text-xs font-medium transition-all ${
              editorMode === 'visual'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => onSwitchMode('html')}
            className={`rounded-md px-3 py-1.5 cursor-pointer text-xs font-medium transition-all ${
              editorMode === 'html'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            &lt;/&gt; HTML
          </button>
        </div>

        {/* Preview / Edit toggle */}
        <button
          onClick={onTogglePreview}
          className="rounded-lg border border-gray-700 px-3 py-1.5 cursor-pointer text-xs font-medium text-gray-300 transition-all hover:border-gray-500 hover:text-white"
        >
          {previewMode ? 'Edit' : 'Preview'}
        </button>

        {/* Save */}
        <button
          disabled={saving}
          onClick={onSave}
          className="rounded-lg bg-orange-500 px-4 py-1.5 cursor-pointer text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded cursor-pointer text-gray-500 hover:bg-gray-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Name / subject sub-bar ───────────────────────────────────────────────────

export function NameBar({
  name, setName,
  subject, setSubject,
  errors,
}: {
  name: string; setName: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-gray-700 bg-[#01021f] px-5 py-2">
      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-[11px] font-medium text-gray-500">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className={`h-7 w-44 border-gray-700 bg-gray-900 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 ${errors.name ? 'border-red-500' : ''}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-[11px] font-medium text-gray-500">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject line"
          className={`h-7 w-72 border-gray-700 bg-gray-900 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 ${errors.subject ? 'border-red-500' : ''}`}
        />
      </div>
      {(errors.name || errors.subject || errors.content) && (
        <span className="text-xs text-red-400">{errors.name || errors.subject || errors.content}</span>
      )}
    </div>
  );
}

// ─── HTML Code Editor ─────────────────────────────────────────────────────────

export function HtmlCodeEditor({
  content,
  onChange,
  defaultHtml,
}: {
  content: string;
  onChange: (v: string) => void;
  defaultHtml: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumRef = useRef<HTMLDivElement>(null);

  const lineCount = content.split('\n').length;
  const charCount = content.length;

  const syncScroll = useCallback(() => {
    if (textareaRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const insertVariable = (variable: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const scrollTop = ta.scrollTop;
    const newContent = content.substring(0, start) + variable + content.substring(end);
    onChange(newContent);
    setTimeout(() => {
      ta.focus();
      ta.scrollTop = scrollTop;
      ta.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const newContent = content.substring(0, start) + '  ' + content.substring(ta.selectionEnd);
      onChange(newContent);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-[#f5f3f0]">
      {/* Code area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineNumRef}
          className="w-10 shrink-0 overflow-hidden bg-[#f5f3f0] pt-4 text-right font-mono text-xs leading-[1.6rem] text-gray-600 select-none"
          aria-hidden
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="pr-3">{i + 1}</div>
          ))}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className="flex-1 resize-none bg-[#ffffff] p-4 font-mono text-sm leading-[1.6rem] text-black-100 outline-none placeholder:text-black-600"
          placeholder="Paste or write your HTML here…"
        />
      </div>

      {/* Right sidebar */}
      <div className="flex w-60 shrink-0 flex-col border-l border-stone-200 bg-[#ede9e3]">
        {/* Document stats */}
        <div className="border-b border-stone-200 px-5 py-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-600">Document</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Lines</span>
              <span className="font-bold text-gray-900">{lineCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Characters</span>
              <span className="font-bold text-gray-900">{charCount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Variables */}
        <div className="border-b border-stone-200 px-5 py-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-600">Variables</p>
          <div className="flex flex-col gap-2">
            {VARIABLES.map((v) => (
              <button
                key={v}
                onClick={() => insertVariable(v)}
                className="w-full rounded-xl border cursor-pointer border-stone-200 bg-white px-3 py-2 text-left font-mono text-sm text-blue-600 transition-colors hover:bg-stone-50"
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-600">Actions</p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onChange(defaultHtml)}
              className="w-full rounded-xl border border-stone-200 cursor-pointer bg-white px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-stone-50"
            >
              ↺ Reset to default
            </button>
            <button
              onClick={() => onChange('')}
              className="w-full rounded-xl border border-stone-200 cursor-pointer bg-white px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-stone-50"
            >
              ✕ Clear all
            </button>
          </div>
        </div>

        {/* Footer hints */}
        <div className="mt-auto border-t border-stone-200 px-5 py-4 space-y-1">
          <p className="text-[14px] text-gray-500">Tab = 2 spaces</p>
          <p className="text-[14px] text-gray-500">Click a variable to insert at cursor</p>
        </div>
      </div>
    </div>
  );
}

// ─── Preview overlay ──────────────────────────────────────────────────────────

const HEIGHT_REPORTER =
  `<script>window.addEventListener('load',function(){` +
  `window.parent.postMessage({type:'iframe-height',height:document.body.scrollHeight},'*');` +
  `});<\/script>`;

export function PreviewOverlay({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== 'null') return;
      if (e.data?.type !== 'iframe-height' || !iframeRef.current) return;
      const h = Math.min(Math.max(0, Number(e.data.height)), 10_000);
      iframeRef.current.style.height = (h + 32) + 'px';
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const safeHtml =
    typeof window !== 'undefined'
      ? DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true }) + HEIGHT_REPORTER
      : '';

  return (
    <div className="flex-1 overflow-auto bg-[#e5e7eb] py-8">
      <div className="mx-auto w-full max-w-[520px]">
        <div className="overflow-hidden rounded-2xl shadow-2xl">
          {/* Browser chrome */}
          <div className="flex items-center gap-3 bg-gray-200 px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 rounded bg-white/60 py-0.5 text-center text-[11px] text-gray-500">
              Email preview
            </div>
          </div>

          {/* Email body */}
          {html ? (
            <iframe
              ref={iframeRef}
              srcDoc={safeHtml}
              title="Email Preview"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              className="w-full border-0 bg-white"
              style={{ minHeight: '500px', display: 'block' }}
            />
          ) : (
            <div className="bg-white py-20 text-center">
              <p className="text-sm text-gray-400">No content yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
