'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  Edit,
  Mail,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { z } from 'zod';

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  subject: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string(),
  _count: z.object({ campaigns: z.number() }).optional(),
});

type Template = z.infer<typeof templateSchema>;

const THUMB_GRADIENTS = [
  'from-[oklch(0.97_0.02_38)] to-[oklch(0.99_0.01_55)]',
  'from-[oklch(0.95_0.02_265)] to-[oklch(0.98_0.01_280)]',
  'from-[oklch(0.95_0.02_145)] to-[oklch(0.98_0.01_160)]',
  'from-[oklch(0.97_0.02_340)] to-[oklch(0.99_0.01_350)]',
  'from-[oklch(0.96_0.02_200)] to-[oklch(0.99_0.01_210)]',
];

function getGradient(index: number) {
  return THUMB_GRADIENTS[index % THUMB_GRADIENTS.length];
}

function formatDate(iso: string) {
  return format(new Date(iso), 'MMM d, yyyy');
}

// ─── Editor Picker Modal ──────────────────────────────────────────────────────

function EditorPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: 'visual' | 'html') => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-[680px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Dark header */}
        <div className="relative overflow-hidden bg-[#0d1117] px-7 py-8">
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#3d1a2e] opacity-70" />
          <div className="pointer-events-none absolute -right-2 top-4 h-24 w-24 rounded-full bg-[#2a1020] opacity-80" />
          <h2 className="relative text-3xl font-bold text-white">Choose your editor</h2>
          <p className="relative mt-1.5 text-base text-gray-400">
            How would you like to build this template?
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 gap-4 bg-white p-5">
          {/* Visual editor */}
          <button
            onClick={() => onSelect('visual')}
            className="group overflow-hidden rounded-2xl border border-gray-200 bg-white text-left transition-all hover:border-orange-300 hover:shadow-md"
          >
            <div className="bg-[#fdf8f6] p-5">
              <div className="space-y-2">
                <div className="h-7 w-full rounded-lg bg-[#0d1117]" />
                <div className="h-10 w-full rounded-lg bg-[#fce8e0]" />
                <div className="h-3 w-3/4 rounded bg-gray-200" />
                <div className="h-3 w-1/2 rounded bg-gray-200" />
                <div className="flex justify-center pt-1">
                  <div className="h-8 w-28 rounded-lg bg-orange-500" />
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100">
                  <svg className="h-4 w-4 text-orange-500" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.8" />
                    <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" opacity="0.5" />
                    <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.5" />
                    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" opacity="0.3" />
                  </svg>
                </div>
                <span className="text-base font-bold text-gray-900">Visual editor</span>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-gray-500">
                Drag-and-drop blocks. No code needed. What you see is what you get.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Blocks', 'Drag & drop', 'Live preview'].map((tag) => (
                  <span key={tag} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </button>

          {/* HTML editor */}
          <button
            onClick={() => onSelect('html')}
            className="group overflow-hidden rounded-2xl bg-[#0d1117] text-left transition-all hover:ring-2 hover:ring-blue-400"
          >
            <div className="p-5 font-mono text-sm leading-relaxed">
              <div><span className="text-green-400">&lt;table</span><span className="text-white"> width=</span><span className="text-yellow-300">&quot;600&quot;</span><span className="text-green-400">&gt;</span></div>
              <div className="pl-4"><span className="text-green-400">&lt;tr&gt;&lt;td&gt;</span></div>
              <div className="pl-8"><span className="text-green-400">&lt;h1</span><span className="text-white"> style=</span><span className="text-yellow-300">&quot;…&quot;</span><span className="text-green-400">&gt;</span></div>
              <div className="pl-12 text-gray-300">Your headline</div>
              <div className="pl-8"><span className="text-green-400">&lt;/h1&gt;</span></div>
              <div className="pl-4"><span className="text-green-400">&lt;/td&gt;&lt;/tr&gt;</span></div>
              <div><span className="text-green-400">&lt;/table&gt;</span></div>
            </div>
            <div className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-900/50">
                  <span className="text-xs font-bold text-blue-400">&lt;/&gt;</span>
                </div>
                <span className="text-base font-bold text-white">HTML editor</span>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-gray-400">
                Write raw HTML and inline CSS. Full control over every pixel.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Full control', 'Syntax highlight', 'Pasted HTML'].map((tag) => (
                  <span key={tag} className="rounded-full bg-blue-900/50 px-3 py-1 text-xs font-medium text-blue-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-white px-6 py-4">
          <span className="text-sm text-gray-400">You can switch modes later from the toolbar.</span>
          <button onClick={onClose} className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  index,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  index: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const usageCount = template._count?.campaigns ?? 0;

  return (
    <div
      onClick={onEdit}
      className="group cursor-pointer overflow-hidden rounded-[18px] border border-[oklch(0.91_0.005_265)] bg-white transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(5,10,48,0.10),0_2px_6px_rgba(5,10,48,0.06)]"
    >
      {/* Thumbnail */}
      <div
        className={`flex h-[140px] items-center justify-center bg-gradient-to-br ${getGradient(index)}`}
      >
        <span className="text-5xl font-extrabold tracking-tight text-[oklch(0.65_0.19_38)]">
          {template.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="p-5">
        {/* Name + menu */}
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold leading-snug text-[oklch(0.14_0.03_265)]">
            {template.name}
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-md p-0.5 text-[oklch(0.48_0.02_265)] opacity-0 transition-opacity hover:bg-[oklch(0.965_0.006_80)] group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="mr-2 h-3.5 w-3.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-3.5 w-3.5" />Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Subject */}
        <p className="mb-4 truncate text-sm text-[oklch(0.48_0.02_265)]">
          {template.subject}
        </p>

        {/* Divider */}
        <div className="mb-3 border-t border-[oklch(0.93_0.005_265)]" />

        {/* Meta rows */}
        <div className="space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-[oklch(0.55_0.02_265)]">Created</span>
            <span className="font-semibold text-[oklch(0.14_0.03_265)]">{formatDate(template.createdAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[oklch(0.55_0.02_265)]">Updated</span>
            <span className="font-semibold text-[oklch(0.14_0.03_265)]">{formatDate(template.updatedAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[oklch(0.55_0.02_265)]">Used</span>
            <span className="font-semibold text-[oklch(0.14_0.03_265)]">{usageCount}×</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function TemplatesDashboard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDuplicate = async (template: Template) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${template.name} (Copy)`,
          subject: template.subject,
          content: template.content,
        }),
      });
      if (response.ok) fetchTemplates();
    } catch (error) {
      console.error('Error duplicating template:', error);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`/api/templates/${templateId}`, { method: 'DELETE' });
      if (response.ok) fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[320px] animate-pulse rounded-[18px] border bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <EditorPickerModal
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(mode) => {
          setShowPicker(false);
          router.push(`/templates/new?mode=${mode}`);
        }}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[oklch(0.14_0.03_265)]">
            Templates
          </h1>
          <p className="mt-1 text-sm text-[oklch(0.48_0.02_265)]">
            {templates.length} template{templates.length !== 1 ? 's' : ''} — create reusable email designs
          </p>
        </div>
        {templates.length > 0 && (
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[oklch(0.48_0.02_265)]" />
            <Input
              placeholder="Search templates…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-[9px] border-[1.5px] border-[oklch(0.91_0.005_265)] pl-9 text-sm sm:w-64"
            />
          </div>
        )}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* New template card */}
        <button
          onClick={() => setShowPicker(true)}
          className="group flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[18px] border-2 border-dashed border-[oklch(0.91_0.005_265)] bg-transparent p-7 text-center transition-all hover:border-[oklch(0.65_0.19_38)] hover:bg-[oklch(0.99_0.005_38)]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[oklch(0.97_0.01_38)] text-[oklch(0.65_0.19_38)] transition-colors group-hover:bg-[oklch(0.94_0.03_38)]">
            <Plus className="h-5 w-5" />
          </div>
          <div className="text-sm font-bold text-[oklch(0.14_0.03_265)]">New template</div>
          <div className="text-xs leading-relaxed text-[oklch(0.48_0.02_265)]">
            Start from scratch or pick a layout
          </div>
        </button>

        {/* Template cards */}
        {filteredTemplates.map((template, index) => (
          <TemplateCard
            key={template.id}
            template={template}
            index={index}
            onEdit={() => router.push(`/templates/${template.id}/edit`)}
            onDuplicate={() => handleDuplicate(template)}
            onDelete={() => handleDelete(template.id)}
          />
        ))}
      </div>

      {/* Empty state */}
      {templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.97_0.01_38)]">
            <Mail className="h-7 w-7 text-[oklch(0.65_0.19_38)]" />
          </div>
          <h3 className="mb-1 text-base font-bold text-[oklch(0.14_0.03_265)]">No templates yet</h3>
          <p className="mb-6 max-w-xs text-sm text-[oklch(0.48_0.02_265)]">
            Create your first email template to get started with campaigns.
          </p>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-2 rounded-[9px] bg-[oklch(0.65_0.19_38)] px-5 py-2 text-sm font-semibold text-white hover:brightness-[0.91]"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </button>
        </div>
      )}

      {/* No search results */}
      {templates.length > 0 && filteredTemplates.length === 0 && searchQuery && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(0.965_0.006_80)]">
            <Search className="h-7 w-7 text-[oklch(0.48_0.02_265)]" />
          </div>
          <h3 className="mb-1 text-base font-bold text-[oklch(0.14_0.03_265)]">No matches</h3>
          <p className="mb-4 text-sm text-[oklch(0.48_0.02_265)]">
            No templates match &ldquo;{searchQuery}&rdquo;
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="rounded-[9px] border px-4 py-1.5 text-sm text-[oklch(0.48_0.02_265)] hover:bg-gray-50"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
