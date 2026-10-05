'use client';

import { ReactNodeViewRenderer, ReactNodeViewProps } from '@tiptap/react';
import Image from '@tiptap/extension-image';
import EnhancedResizableImageView from '@/components/email-editor/EnhancedResizableImageView';

export interface ResizableImageOptions {
  allowBase64?: boolean;
  HTMLAttributes?: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      /**
       * Add an image
       */
      setImage: (options: { src: string; alt?: string; title?: string; width?: string; height?: string }) => ReturnType;
    };
  }
}

export const ResizableImage = Image.extend<ResizableImageOptions>({
  name: 'image',

  addOptions() {
    return {
      ...this.parent?.(),
      allowBase64: true,
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width') || element.style.width || null,
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height') || element.style.height || null,
      },
      alignment: {
        default: 'left',
        parseHTML: (element) => element.style.textAlign || element.getAttribute('data-alignment') || 'left',
      },
      borderWidth: {
        default: '0',
        parseHTML: (element) => element.style.borderWidth || '0',
      },
      borderColor: {
        default: '#000000',
        parseHTML: (element) => element.style.borderColor || '#000000',
      },
      borderRadius: {
        default: '0',
        parseHTML: (element) => element.style.borderRadius || '0',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]:not([src^="data:image/svg+xml"])',
        getAttrs: (node) => {
          const element = node as HTMLElement;
          return {
            src: element.getAttribute('src'),
            alt: element.getAttribute('alt'),
            title: element.getAttribute('title'),
            width: element.getAttribute('width') || element.style.width || null,
            height: element.getAttribute('height') || element.style.height || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, height, alignment, borderWidth, borderColor, borderRadius, ...rest } = HTMLAttributes;
    const style = [];
    
    if (width) {
      style.push(`width: ${width}`);
    }
    if (height) {
      style.push(`height: ${height}`);
    }
    if (borderWidth && borderWidth !== '0') {
      style.push(`border: ${borderWidth} solid ${borderColor || '#000000'}`);
    }
    if (borderRadius && borderRadius !== '0') {
      style.push(`border-radius: ${borderRadius}`);
    }

    const containerStyle = [];
    if (alignment) {
      containerStyle.push(`text-align: ${alignment}`);
    }

    if (alignment === 'left' || alignment === 'right' || alignment === 'center') {
      return [
        'div',
        {
          style: containerStyle.join('; '),
          'data-alignment': alignment,
        },
        [
          'img',
          {
            ...rest,
            ...(style.length > 0 ? { style: style.join('; ') } : {}),
          },
        ],
      ];
    }

    return [
      'img',
      {
        ...rest,
        ...(style.length > 0 ? { style: style.join('; ') } : {}),
      },
    ];
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(EnhancedResizableImageView);
  },
});