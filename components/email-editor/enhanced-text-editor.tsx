'use client';

import { useState, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { 
  Bold, 
  Italic, 
  List, 
  Link2, 
  Type, 
  MoreHorizontal,
  Eye
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface EnhancedTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  availableVariables?: string[];
  className?: string;
  error?: string;
}

export function EnhancedTextEditor({
  value,
  onChange,
  placeholder = "Enter your email content...",
  availableVariables = [],
  className = "",
  error
}: EnhancedTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = value.substring(0, start) + text + value.substring(end);
    
    onChange(newValue);
    
    // Reset cursor position after the inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const formatText = (type: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    if (!selectedText) {
      // If no text selected, insert placeholder
      let formattedText = '';
      switch (type) {
        case 'bold':
          formattedText = '**bold text**';
          break;
        case 'italic':
          formattedText = '*italic text*';
          break;
        case 'link':
          formattedText = '[link text](https://example.com)';
          break;
        case 'list':
          formattedText = '\n• List item 1\n• List item 2\n• List item 3';
          break;
        case 'heading':
          formattedText = '\n# Heading\n';
          break;
        case 'line':
          formattedText = '\n---\n';
          break;
      }
      insertAtCursor(formattedText);
    } else {
      // Format selected text
      let formattedText = selectedText;
      switch (type) {
        case 'bold':
          formattedText = `**${selectedText}**`;
          break;
        case 'italic':
          formattedText = `*${selectedText}*`;
          break;
        case 'link':
          formattedText = `[${selectedText}](https://example.com)`;
          break;
        case 'heading':
          formattedText = `# ${selectedText}`;
          break;
      }
      
      const newValue = value.substring(0, start) + formattedText + value.substring(end);
      onChange(newValue);
      
      // Select the formatted text
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start, start + formattedText.length);
      }, 0);
    }
  };

  const insertVariable = (variable: string) => {
    insertAtCursor(variable);
  };

  const addParagraph = () => {
    insertAtCursor('\n\n');
  };

  const addLineBreak = () => {
    insertAtCursor('\n');
  };

  // Convert markdown-like formatting to HTML for preview
  const renderPreview = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^• (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^(.*)/, '<p>$1')
      .replace(/(.*$)/, '$1</p>');
  };

  return (
    <div className="space-y-4">
      {/* Formatting Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 border rounded-lg bg-gray-50">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('bold')}
                className="h-8 w-8 p-0"
              >
                <Bold className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bold (**text**)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('italic')}
                className="h-8 w-8 p-0"
              >
                <Italic className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Italic (*text*)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('link')}
                className="h-8 w-8 p-0"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Link ([text](url))</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('heading')}
                className="h-8 w-8 p-0"
              >
                <Type className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Heading (# text)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('list')}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => formatText('line')}
                className="h-8 w-8 p-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Horizontal Line (---)</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-6 bg-border" />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={addParagraph}
                className="text-xs px-2 h-8"
              >
                ¶¶
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Paragraph Break</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={addLineBreak}
                className="text-xs px-2 h-8"
              >
                ↵
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add Line Break</TooltipContent>
          </Tooltip>
        </div>

        <div className="w-px h-6 bg-border" />

        <Button
          variant={showPreview ? "default" : "ghost"}
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className="text-xs px-3 h-8"
        >
          <Eye className="h-4 w-4 mr-1" />
          Preview
        </Button>
      </div>

      {/* Editor/Preview */}
      {showPreview ? (
        <div className="border rounded-lg p-4 min-h-[300px] bg-gray-50">
          <div className="bg-white p-4 rounded shadow-sm prose max-w-none">
            <div 
              dangerouslySetInnerHTML={{ __html: renderPreview(value) }}
            />
          </div>
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`min-h-[300px] font-mono text-sm leading-relaxed ${className} ${error ? 'border-red-500' : ''}`}
          style={{ 
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6'
          }}
        />
      )}

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Variable insertion */}
      {availableVariables.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Insert Variables:</Label>
          <div className="flex flex-wrap gap-1">
            {availableVariables.map((variable) => (
              <Badge
                key={variable}
                variant="outline"
                className="cursor-pointer hover:bg-background text-xs"
                onClick={() => insertVariable(variable)}
              >
                {variable}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Formatting Help */}
      <div className="text-xs text-gray-500 space-y-1">
        <p><strong>Formatting Tips:</strong></p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span>**bold** for <strong>bold text</strong></span>
          <span>*italic* for <em>italic text</em></span>
          <span># Heading for headings</span>
          <span>[text](url) for links</span>
          <span>• List item for bullets</span>
          <span>--- for horizontal lines</span>
        </div>
      </div>
    </div>
  );
}