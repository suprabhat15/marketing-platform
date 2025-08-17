'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Type,
  Heading1,
  Heading2,
  Code,
} from 'lucide-react';
import { useState, useCallback } from 'react';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  onInsertVariable?: (variable: string) => void;
  availableVariables?: string[];
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = 'Start writing your email content...',
  className = '',
  onInsertVariable,
  availableVariables = [],
}: TiptapEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer',
        },
      }),
      Underline,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  const insertVariable = useCallback((variable: string) => {
    if (editor) {
      editor
        .chain()
        .focus()
        .insertContent(variable)
        .run();
    }
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;

    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: linkUrl })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .unsetLink()
        .run();
    }
    
    setShowLinkInput(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`border rounded-lg ${className}`}>
      {/* Toolbar */}
      <div className="border-b p-2 flex items-center gap-1 flex-wrap bg-gray-50">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? 'bg-gray-200' : ''}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? 'bg-gray-200' : ''}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive('underline') ? 'bg-gray-200' : ''}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : ''}
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : ''}
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={editor.isActive('paragraph') ? 'bg-gray-200' : ''}
          >
            <Type className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? 'bg-gray-200' : ''}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? 'bg-gray-200' : ''}
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={editor.isActive('blockquote') ? 'bg-gray-200' : ''}
          >
            <Quote className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={editor.isActive('code') ? 'bg-gray-200' : ''}
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLinkInput(!showLinkInput)}
            className={editor.isActive('link') ? 'bg-gray-200' : ''}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border mx-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Link Input */}
      {showLinkInput && (
        <div className="border-b p-3 bg-blue-50">
          <div className="flex items-center gap-2">
            <input
              type="url"
              placeholder="Enter URL..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex-1 px-3 py-1 text-sm border rounded"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setLink();
                }
              }}
            />
            <Button size="sm" onClick={setLink}>
              Set Link
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setShowLinkInput(false);
                setLinkUrl('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <EditorContent 
        editor={editor} 
        className="min-h-[300px]"
      />

      {/* Variable Insertion */}
      {availableVariables.length > 0 && (
        <div className="border-t p-3 bg-gray-50">
          <p className="text-xs text-gray-600 mb-2">Click to insert template variables:</p>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map((variable) => (
              <Button
                key={variable}
                variant="outline"
                size="sm"
                className="text-xs h-7 bg-white hover:bg-blue-50 hover:border-blue-300"
                onClick={() => insertVariable(variable)}
              >
                {variable}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}