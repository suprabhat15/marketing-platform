'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createTemplateSchema } from '@/lib/validators';
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

export function NewTemplatePage() {
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode');
  const initialMode: EditorMode = urlMode === 'html' ? 'html' : 'visual';

  const [editorMode, setEditorMode] = useState<EditorMode>(initialMode);
  const [previewMode, setPreviewMode] = useState(false);
  const [switching, setSwitching] = useState<null | 'to-visual' | 'to-html'>(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [htmlContent, setHtmlContent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (editorMode === 'html' && !htmlContent) {
      setHtmlContent(blocksToHTML(blocks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorMode]);

  const finalContent = editorMode === 'visual' ? blocksToHTML(blocks) : htmlContent;

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
    setBlocks([]);
    setEditorMode('visual');
    setSwitching(null);
  };

  const validate = (): boolean => {
    try {
      createTemplateSchema.parse({
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
        error.errors.forEach((err) => { newErrors[err.path[0] as string] = err.message; });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, content: finalContent, attachments: [] }),
      });
      if (response.ok) {
        router.push('/templates');
      }
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  if (!urlMode) {
    router.replace('/templates');
    return null;
  }

  return (
    <div className="-m-6 flex flex-col overflow-hidden" style={{ height: '100vh' }}>
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
          name={name} setName={setName}
          subject={subject} setSubject={setSubject}
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
          defaultHtml={blocksToHTML(blocks)}
        />
      )}

      {switching === 'to-html' && (
        <SwitchToHTMLModal onCancel={() => setSwitching(null)} onConfirm={confirmSwitchToHTML} />
      )}
      {switching === 'to-visual' && (
        <SwitchToVisualModal onCancel={() => setSwitching(null)} onConfirm={confirmSwitchToVisual} />
      )}
    </div>
  );
}
