'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { templateUpdateSchema } from '@/lib/validators';
import { ZodError } from 'zod';
import {
  EditorTopBar,
  NameBar,
  HtmlCodeEditor,
  PreviewOverlay,
  SwitchToHTMLModal,
  SwitchToVisualModal,
  type EditorMode,
} from './editor-shared';
import {
  VisualBlockEditor,
  blocksToHTML,
  type Block,
} from './visual-block-editor';

interface EditTemplatePageProps {
  params: Promise<{ templateId: string }>;
}

export function EditTemplatePage({ params }: EditTemplatePageProps) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editorMode, setEditorMode] = useState<EditorMode>('html');
  const [previewMode, setPreviewMode] = useState(false);
  const [switching, setSwitching] = useState<null | 'to-visual' | 'to-html'>(
    null
  );

  // Content
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [htmlContent, setHtmlContent] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    params.then((p) => {
      setTemplateId(p.templateId);
      fetchTemplate(p.templateId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const fetchTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) {
        router.push('/templates');
        return;
      }
      const data = await res.json();
      const t = data.template;
      setName(t.name || '');
      setSubject(t.subject || '');
      setHtmlContent(t.content || '');
      // Existing templates are always stored as HTML — start in HTML mode
      setEditorMode('html');
    } catch {
      router.push('/templates');
    } finally {
      setLoading(false);
    }
  };

  const finalContent =
    editorMode === 'visual' ? blocksToHTML(blocks) : htmlContent;

  const handleSwitchMode = (target: EditorMode) => {
    if (target === editorMode) return;
    setSwitching(target === 'html' ? 'to-html' : 'to-visual');
  };

  const confirmSwitchToHTML = () => {
    setHtmlContent(blocksToHTML(blocks));
    setEditorMode('html');
    setSwitching(null);
  };

  const confirmSwitchToVisual = () => {
    // Cannot restore original blocks from HTML — start fresh
    setBlocks([]);
    setEditorMode('visual');
    setSwitching(null);
  };

  const validate = (): boolean => {
    try {
      templateUpdateSchema.parse({
        name: name.trim(),
        subject: subject.trim(),
        content: finalContent.trim(),
        attachments: [],
      });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          newErrors[err.path[0] as string] = err.message;
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSave = async () => {
    if (!validate() || !templateId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          subject,
          content: finalContent,
          attachments: [],
        }),
      });
      if (response.ok) {
        router.push('/templates');
      }
    } catch (error) {
      console.error('Error updating template:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="-m-6 flex h-screen items-center justify-center bg-[#f5f3f0]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div
      className="-m-6 flex flex-col overflow-hidden"
      style={{ height: '100vh' }}
    >
      <EditorTopBar
        name={name}
        editorMode={editorMode}
        previewMode={previewMode}
        saving={saving}
        onSwitchMode={handleSwitchMode}
        onTogglePreview={() => setPreviewMode((p) => !p)}
        onSave={handleSave}
        onClose={() => router.push('/templates')}
      />

      {!previewMode && (
        <NameBar
          name={name}
          setName={setName}
          subject={subject}
          setSubject={setSubject}
          errors={errors}
        />
      )}

      {previewMode ? (
        <PreviewOverlay html={finalContent} />
      ) : editorMode === 'visual' ? (
        <div className="flex-1 overflow-hidden">
          <VisualBlockEditor blocks={blocks} onChange={setBlocks} />
        </div>
      ) : (
        <HtmlCodeEditor
          content={htmlContent}
          onChange={setHtmlContent}
          defaultHtml={htmlContent}
        />
      )}

      {switching === 'to-html' && (
        <SwitchToHTMLModal
          onCancel={() => setSwitching(null)}
          onConfirm={confirmSwitchToHTML}
        />
      )}
      {switching === 'to-visual' && (
        <SwitchToVisualModal
          onCancel={() => setSwitching(null)}
          onConfirm={confirmSwitchToVisual}
        />
      )}
    </div>
  );
}
