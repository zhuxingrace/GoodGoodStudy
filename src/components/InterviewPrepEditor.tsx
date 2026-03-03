import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Divider, Group, Menu, Select, Stack, Text } from '@mantine/core';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Node, mergeAttributes } from '@tiptap/core';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import type { CodeLanguage, EntryAttachment, RichContentJson } from '../types';
import { CODE_LANGUAGE_OPTIONS } from '../types';
import { createEmptyRichDoc } from '../lib/studyData';
import { createUuid } from '../lib/id';
import { getSignedStudyUrl, STUDY_UPLOAD_BUCKET, uploadStudyAsset } from '../lib/storageAssets';

const lowlight = createLowlight();

lowlight.register({
  bash,
  cpp,
  go,
  java,
  javascript,
  json,
  plaintext,
  python,
  sql,
  typescript,
  yaml,
});
lowlight.registerAlias({
  cpp: 'c++',
  javascript: 'js',
  typescript: 'ts',
  plaintext: ['text', 'plain', 'other'],
});

const RICH_CODE_LANGUAGE_OPTIONS = CODE_LANGUAGE_OPTIONS.filter((item) => item.value !== 'other');
const RICH_CODE_LANGUAGE_STORAGE_KEY = 'study-tracker.rich-code-language.v1';
const DEFAULT_RICH_CODE_LANGUAGE: CodeLanguage = 'plaintext';

type RichEntryEditorType = 'InterviewPrep' | 'SystemDesign';

type AssetNodeAttrs = {
  id: string;
  bucket: string;
  path: string;
  name: string;
  mime?: string;
  size?: number;
  createdAt?: string;
  alt?: string;
  signedUrl?: string | null;
};

type DiagramNodeAttrs = {
  id: string;
  bucket: string;
  sourcePath: string;
  sourceName: string;
  sourceMime?: string;
  sourceSize?: number;
  sourceCreatedAt?: string;
  sourceSignedUrl?: string | null;
  previewPath?: string;
  previewName?: string;
  previewMime?: string;
  previewSize?: number;
  previewCreatedAt?: string;
  previewSignedUrl?: string | null;
};

type SignablePathRef = {
  nodeType: 'privateImage' | 'privateAttachment' | 'privateDiagram';
  path: string;
  urlAttr: 'signedUrl' | 'sourceSignedUrl' | 'previewSignedUrl';
};

interface InterviewPrepEditorProps {
  entryId: string;
  entryType: RichEntryEditorType;
  userId?: string;
  value?: RichContentJson | null;
  attachments?: EntryAttachment[];
  onChange: (contentJson: RichContentJson, attachments: EntryAttachment[]) => void;
}

const formatFileSize = (size?: number) => {
  if (!size) {
    return 'Unknown size';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const createTextNode = (text: string) => ({
  type: 'text',
  text,
});

const createParagraphNode = (text = '') => ({
  type: 'paragraph',
  content: text ? [createTextNode(text)] : undefined,
});

const createHeadingNode = (text: string, level = 2) => ({
  type: 'heading',
  attrs: { level },
  content: text ? [createTextNode(text)] : undefined,
});

const createBulletListNode = (items: string[] = ['']) => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [createParagraphNode(item)],
  })),
});

const SYSTEM_DESIGN_TEMPLATE_NODES = [
  { heading: 'Goal / Prompt', bullets: ['Primary use case', 'Success definition'] },
  { heading: 'Functional requirements', bullets: ['Must-have capabilities', 'Key user journeys'] },
  {
    heading: 'Non-functional (QPS / latency / availability / consistency)',
    bullets: ['Peak traffic assumptions', 'SLOs and trade-offs'],
  },
  { heading: 'API sketch', bullets: ['Core endpoints', 'Important request / response shapes'] },
  { heading: 'High-level architecture', bullets: ['Main services', 'Data flow between components'] },
  { heading: 'Data model', bullets: ['Primary entities', 'Storage choices'] },
  { heading: 'Core flows', bullets: ['Read path', 'Write path'] },
  { heading: 'Trade-offs', bullets: ['Why this design', 'What you are deliberately not optimizing'] },
  { heading: 'Failure modes & mitigations', bullets: ['Bottlenecks', 'Fallbacks and recovery'] },
  { heading: 'Metrics / observability', bullets: ['Golden signals', 'Alerts and dashboards'] },
  { heading: 'Follow-ups', bullets: ['Scale-up ideas', 'Alternative designs'] },
].flatMap((section) => [createHeadingNode(section.heading), createBulletListNode(section.bullets)]);

const ImageNodeView = ({ node, selected }: any) => {
  const attrs = node.attrs as AssetNodeAttrs;

  return (
    <NodeViewWrapper
      as="figure"
      className="interview-asset-block"
      data-selected={selected ? 'true' : 'false'}
      contentEditable={false}
    >
      {attrs.signedUrl ? (
        <img src={attrs.signedUrl} alt={attrs.alt || attrs.name} className="interview-image" />
      ) : (
        <div className="interview-image-placeholder">Private image</div>
      )}
      <figcaption>{attrs.name}</figcaption>
    </NodeViewWrapper>
  );
};

const AttachmentNodeView = ({ node, selected }: any) => {
  const attrs = node.attrs as AssetNodeAttrs;

  return (
    <NodeViewWrapper
      as="div"
      className="interview-asset-block interview-file-block"
      data-selected={selected ? 'true' : 'false'}
      contentEditable={false}
    >
      <div>
        <Text fw={600}>{attrs.name}</Text>
        <Text size="xs" c="dimmed">
          {formatFileSize(attrs.size)}
        </Text>
      </div>
      {attrs.signedUrl ? (
        <a href={attrs.signedUrl} target="_blank" rel="noreferrer" download={attrs.name} className="interview-file-link">
          Download
        </a>
      ) : (
        <Text size="sm" c="dimmed">
          Preparing download...
        </Text>
      )}
    </NodeViewWrapper>
  );
};

const DiagramNodeView = ({ node, selected }: any) => {
  const attrs = node.attrs as DiagramNodeAttrs;

  return (
    <NodeViewWrapper
      as="div"
      className="interview-asset-block interview-diagram-block"
      data-selected={selected ? 'true' : 'false'}
      contentEditable={false}
    >
      {attrs.previewSignedUrl ? (
        <img
          src={attrs.previewSignedUrl}
          alt={attrs.previewName || `${attrs.sourceName} preview`}
          className="interview-image"
        />
      ) : (
        <div className="interview-image-placeholder">Excalidraw source attached (no preview yet)</div>
      )}
      <div className="interview-diagram-meta">
        <div>
          <Text fw={600}>Excalidraw diagram</Text>
          <Text size="sm" c="dimmed">
            {attrs.sourceName}
          </Text>
          <Text size="xs" c="dimmed">
            {formatFileSize(attrs.sourceSize)}
          </Text>
        </div>
        <Group spacing="xs">
          {attrs.sourceSignedUrl ? (
            <a
              href={attrs.sourceSignedUrl}
              target="_blank"
              rel="noreferrer"
              download={attrs.sourceName}
              className="interview-file-link"
            >
              Download source
            </a>
          ) : null}
          <a href="https://excalidraw.com" target="_blank" rel="noreferrer" className="interview-file-link">
            Open in Excalidraw
          </a>
        </Group>
      </div>
      <Text size="xs" c="dimmed">
        Use “Download source” and import that file into Excalidraw to keep editing.
      </Text>
    </NodeViewWrapper>
  );
};

const PrivateImageNode = Node.create({
  name: 'privateImage',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: '' },
      bucket: { default: STUDY_UPLOAD_BUCKET },
      path: { default: '' },
      name: { default: 'Image' },
      alt: { default: '' },
      mime: { default: 'application/octet-stream' },
      size: { default: 0 },
      createdAt: { default: null },
      signedUrl: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="private-image"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-node-type': 'private-image' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

const AttachmentNode = Node.create({
  name: 'privateAttachment',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: '' },
      bucket: { default: STUDY_UPLOAD_BUCKET },
      path: { default: '' },
      name: { default: 'Attachment' },
      mime: { default: 'application/octet-stream' },
      size: { default: 0 },
      createdAt: { default: null },
      signedUrl: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="private-attachment"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-node-type': 'private-attachment' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView);
  },
});

const DiagramNode = Node.create({
  name: 'privateDiagram',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: '' },
      bucket: { default: STUDY_UPLOAD_BUCKET },
      sourcePath: { default: '' },
      sourceName: { default: 'diagram.excalidraw' },
      sourceMime: { default: 'application/json' },
      sourceSize: { default: 0 },
      sourceCreatedAt: { default: null },
      sourceSignedUrl: { default: null },
      previewPath: { default: '' },
      previewName: { default: '' },
      previewMime: { default: '' },
      previewSize: { default: 0 },
      previewCreatedAt: { default: null },
      previewSignedUrl: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node-type="private-diagram"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-node-type': 'private-diagram' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramNodeView);
  },
});

const DividerNode = Node.create({
  name: 'divider',
  group: 'block',
  atom: true,

  parseHTML() {
    return [{ tag: 'hr[data-node-type="divider"]' }];
  },

  renderHTML() {
    return ['hr', { 'data-node-type': 'divider' }];
  },
});

const collectEntryAttachments = (value: unknown): EntryAttachment[] => {
  const results = new Map<string, EntryAttachment>();

  const addAttachment = (
    path: string,
    name: string,
    fallbackId: string,
    bucket = STUDY_UPLOAD_BUCKET,
    mime = 'application/octet-stream',
    size = 0,
    createdAt?: string,
  ) => {
    if (!path || !name) {
      return;
    }

    results.set(path, {
      id: fallbackId || path,
      name,
      bucket,
      path,
      mime,
      size,
      created_at: createdAt || new Date().toISOString(),
    });
  };

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const current = node as Record<string, unknown>;
    const nodeType = typeof current.type === 'string' ? current.type : '';
    const attrs = current.attrs && typeof current.attrs === 'object' ? (current.attrs as Record<string, unknown>) : null;

    if (nodeType === 'privateImage' && attrs) {
      const path = typeof attrs.path === 'string' ? attrs.path : '';
      const name = typeof attrs.name === 'string' ? attrs.name : 'Image';
      addAttachment(
        path,
        name,
        typeof attrs.id === 'string' ? attrs.id : path,
        typeof attrs.bucket === 'string' ? attrs.bucket : STUDY_UPLOAD_BUCKET,
        typeof attrs.mime === 'string' ? attrs.mime : 'application/octet-stream',
        typeof attrs.size === 'number' ? attrs.size : 0,
        typeof attrs.createdAt === 'string' ? attrs.createdAt : undefined,
      );
    }

    if (nodeType === 'privateAttachment' && attrs) {
      const path = typeof attrs.path === 'string' ? attrs.path : '';
      const name = typeof attrs.name === 'string' ? attrs.name : 'Attachment';
      addAttachment(
        path,
        name,
        typeof attrs.id === 'string' ? attrs.id : path,
        typeof attrs.bucket === 'string' ? attrs.bucket : STUDY_UPLOAD_BUCKET,
        typeof attrs.mime === 'string' ? attrs.mime : 'application/octet-stream',
        typeof attrs.size === 'number' ? attrs.size : 0,
        typeof attrs.createdAt === 'string' ? attrs.createdAt : undefined,
      );
    }

    if (nodeType === 'privateDiagram' && attrs) {
      const bucket = typeof attrs.bucket === 'string' ? attrs.bucket : STUDY_UPLOAD_BUCKET;
      const sourcePath = typeof attrs.sourcePath === 'string' ? attrs.sourcePath : '';
      const sourceName = typeof attrs.sourceName === 'string' ? attrs.sourceName : 'diagram.excalidraw';
      addAttachment(
        sourcePath,
        sourceName,
        typeof attrs.id === 'string' ? `${attrs.id}:source` : sourcePath,
        bucket,
        typeof attrs.sourceMime === 'string' ? attrs.sourceMime : 'application/json',
        typeof attrs.sourceSize === 'number' ? attrs.sourceSize : 0,
        typeof attrs.sourceCreatedAt === 'string' ? attrs.sourceCreatedAt : undefined,
      );

      const previewPath = typeof attrs.previewPath === 'string' ? attrs.previewPath : '';
      const previewName = typeof attrs.previewName === 'string' ? attrs.previewName : '';
      if (previewPath && previewName) {
        addAttachment(
          previewPath,
          previewName,
          typeof attrs.id === 'string' ? `${attrs.id}:preview` : previewPath,
          bucket,
          typeof attrs.previewMime === 'string' ? attrs.previewMime : 'application/octet-stream',
          typeof attrs.previewSize === 'number' ? attrs.previewSize : 0,
          typeof attrs.previewCreatedAt === 'string' ? attrs.previewCreatedAt : undefined,
        );
      }
    }

    if (Array.isArray(current.content)) {
      current.content.forEach((child) => walk(child));
    }
  };

  walk(value);
  return Array.from(results.values());
};

const collectSignablePathRefs = (value: unknown): SignablePathRef[] => {
  const results: SignablePathRef[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const current = node as Record<string, unknown>;
    const nodeType = typeof current.type === 'string' ? current.type : '';
    const attrs = current.attrs && typeof current.attrs === 'object' ? (current.attrs as Record<string, unknown>) : null;

    if (!attrs) {
      if (Array.isArray(current.content)) {
        current.content.forEach((child) => walk(child));
      }
      return;
    }

    if (nodeType === 'privateImage' || nodeType === 'privateAttachment') {
      const path = typeof attrs.path === 'string' ? attrs.path : '';
      if (path) {
        results.push({
          nodeType,
          path,
          urlAttr: 'signedUrl',
        });
      }
    }

    if (nodeType === 'privateDiagram') {
      const sourcePath = typeof attrs.sourcePath === 'string' ? attrs.sourcePath : '';
      const previewPath = typeof attrs.previewPath === 'string' ? attrs.previewPath : '';

      if (sourcePath) {
        results.push({
          nodeType,
          path: sourcePath,
          urlAttr: 'sourceSignedUrl',
        });
      }

      if (previewPath) {
        results.push({
          nodeType,
          path: previewPath,
          urlAttr: 'previewSignedUrl',
        });
      }
    }

    if (Array.isArray(current.content)) {
      current.content.forEach((child) => walk(child));
    }
  };

  walk(value);
  return results;
};

const stripTransientEditorState = (value: unknown): RichContentJson => {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }

    if (!node || typeof node !== 'object') {
      return node;
    }

    const current = node as Record<string, unknown>;
    const next: Record<string, unknown> = {};

    Object.entries(current).forEach(([key, child]) => {
      if (key === 'attrs' && child && typeof child === 'object') {
        const attrs = { ...(child as Record<string, unknown>) };
        delete attrs.signedUrl;
        delete attrs.sourceSignedUrl;
        delete attrs.previewSignedUrl;
        next[key] = attrs;
        return;
      }

      next[key] = walk(child);
    });

    return next;
  };

  return (walk(value) as RichContentJson) ?? createEmptyRichDoc();
};

const isDiagramSourceFile = (file: File) => /\.excalidraw$/i.test(file.name);

const getStoredRichCodeLanguage = (): CodeLanguage => {
  if (typeof window === 'undefined') {
    return DEFAULT_RICH_CODE_LANGUAGE;
  }

  const stored = window.localStorage.getItem(RICH_CODE_LANGUAGE_STORAGE_KEY);
  const matched = RICH_CODE_LANGUAGE_OPTIONS.find((item) => item.value === stored);
  return matched?.value ?? DEFAULT_RICH_CODE_LANGUAGE;
};

const normalizeRichCodeLanguage = (language: string | null | undefined): CodeLanguage => {
  const matched = RICH_CODE_LANGUAGE_OPTIONS.find((item) => item.value === language);
  return matched?.value ?? DEFAULT_RICH_CODE_LANGUAGE;
};

export default function InterviewPrepEditor({
  entryId,
  entryType,
  userId,
  value,
  attachments = [],
  onChange,
}: InterviewPrepEditorProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const diagramSourceInputRef = useRef<HTMLInputElement | null>(null);
  const diagramPreviewInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMetaRef = useRef<Map<string, EntryAttachment>>(new Map());
  const lastSerializedRef = useRef('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pendingDiagramPreviewNodeId, setPendingDiagramPreviewNodeId] = useState<string | null>(null);
  const [preferredCodeLanguage, setPreferredCodeLanguage] = useState<CodeLanguage>(() => getStoredRichCodeLanguage());

  const initialContent = useMemo(() => value ?? createEmptyRichDoc(), [value]);

  useEffect(() => {
    attachmentMetaRef.current = new Map(attachments.map((item) => [item.path, item]));
  }, [attachments]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder:
          entryType === 'SystemDesign'
            ? 'Type "/" for insert options, or sketch your system design notes.'
            : 'Type "/" for insert options, or start writing your interview notes.',
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: DEFAULT_RICH_CODE_LANGUAGE,
        languageClassPrefix: 'language-',
        HTMLAttributes: {
          class: 'interview-code-block',
        },
      }),
      PrivateImageNode,
      AttachmentNode,
      DiagramNode,
      DividerNode,
    ],
    content: initialContent,
    onUpdate: ({ editor: nextEditor }) => {
      const cleanDoc = stripTransientEditorState(nextEditor.getJSON());
      const serialized = JSON.stringify(cleanDoc);

      if (serialized === lastSerializedRef.current) {
        return;
      }

      lastSerializedRef.current = serialized;
      const nextAttachments = collectEntryAttachments(nextEditor.getJSON()).map(
        (item) => attachmentMetaRef.current.get(item.path) ?? item,
      );
      attachmentMetaRef.current = new Map(nextAttachments.map((item) => [item.path, item]));
      onChange(cleanDoc, nextAttachments);
      void hydrateSignedUrls(nextEditor);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextContent = value ?? createEmptyRichDoc();
    const nextSerialized = JSON.stringify(stripTransientEditorState(nextContent));

    if (lastSerializedRef.current === nextSerialized) {
      void hydrateSignedUrls(editor);
      return;
    }

    editor.commands.setContent(nextContent, { emitUpdate: false });
    lastSerializedRef.current = nextSerialized;
    void hydrateSignedUrls(editor);
  }, [editor, value]);

  const hydrateSignedUrls = async (instance = editor) => {
    if (!instance) {
      return;
    }

    const signablePaths = collectSignablePathRefs(instance.getJSON());
    if (signablePaths.length === 0) {
      return;
    }

    const uniquePaths = Array.from(new Set(signablePaths.map((item) => item.path)));
    const signedUrls = await Promise.all(
      uniquePaths.map(async (path) => ({
        path,
        url: await getSignedStudyUrl(path),
      })),
    );
    const urlByPath = new Map(signedUrls.map((item) => [item.path, item.url]));

    instance.commands.command(({ tr, state }) => {
      let changed = false;

      state.doc.descendants((node, pos) => {
        if (!['privateImage', 'privateAttachment', 'privateDiagram'].includes(node.type.name)) {
          return;
        }

        if (node.type.name === 'privateDiagram') {
          const nextSourceUrl =
            typeof node.attrs.sourcePath === 'string' ? urlByPath.get(node.attrs.sourcePath as string) : undefined;
          const nextPreviewUrl =
            typeof node.attrs.previewPath === 'string' ? urlByPath.get(node.attrs.previewPath as string) : undefined;

          if (
            (nextSourceUrl && node.attrs.sourceSignedUrl !== nextSourceUrl) ||
            (nextPreviewUrl && node.attrs.previewSignedUrl !== nextPreviewUrl)
          ) {
            changed = true;
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              sourceSignedUrl: nextSourceUrl ?? node.attrs.sourceSignedUrl ?? null,
              previewSignedUrl: nextPreviewUrl ?? node.attrs.previewSignedUrl ?? null,
            });
          }
          return;
        }

        const nextUrl = typeof node.attrs.path === 'string' ? urlByPath.get(node.attrs.path as string) : undefined;
        if (!nextUrl || node.attrs.signedUrl === nextUrl) {
          return;
        }

        changed = true;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          signedUrl: nextUrl,
        });
      });

      return changed;
    });
  };

  const updateDiagramNode = (diagramId: string, changes: Partial<DiagramNodeAttrs>) => {
    if (!editor) {
      return;
    }

    editor.commands.command(({ tr, state }) => {
      let changed = false;

      state.doc.descendants((node, pos) => {
        if (node.type.name !== 'privateDiagram' || node.attrs.id !== diagramId) {
          return;
        }

        changed = true;
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          ...changes,
        });
      });

      return changed;
    });
  };

  const insertAtCursor = (content: Record<string, unknown> | Record<string, unknown>[]) => {
    if (!editor) {
      return;
    }

    editor.chain().focus().insertContent(content).run();
  };

  const insertParagraph = () => insertAtCursor(createParagraphNode(''));

  const insertHeading = () => insertAtCursor(createHeadingNode('Heading'));

  const insertBulletList = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().toggleBulletList().run();
  };

  const insertOrderedList = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().toggleOrderedList().run();
  };

  const insertDivider = () => insertAtCursor({ type: 'divider' });

  const insertSystemDesignTemplate = () => {
    if (entryType !== 'SystemDesign') {
      return;
    }

    insertAtCursor(SYSTEM_DESIGN_TEMPLATE_NODES);
  };

  const persistPreferredCodeLanguage = (language: CodeLanguage) => {
    setPreferredCodeLanguage(language);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RICH_CODE_LANGUAGE_STORAGE_KEY, language);
    }
  };

  const activeCodeLanguage = editor?.isActive('codeBlock')
    ? normalizeRichCodeLanguage(String(editor.getAttributes('codeBlock').language || DEFAULT_RICH_CODE_LANGUAGE))
    : null;

  const insertOrUpdateCodeBlock = (language: CodeLanguage) => {
    if (!editor) {
      return;
    }

    persistPreferredCodeLanguage(language);

    if (editor.isActive('codeBlock')) {
      editor.chain().focus().updateAttributes('codeBlock', { language }).run();
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'codeBlock',
        attrs: { language },
        content: [{ type: 'text', text: '' }],
      })
      .run();
  };

  const updateActiveCodeBlockLanguage = (language: CodeLanguage) => {
    if (!editor) {
      return;
    }

    persistPreferredCodeLanguage(language);
    editor.chain().focus().updateAttributes('codeBlock', { language }).run();
  };

  const insertUploadedNode = async (file: File, kind: 'image' | 'attachment') => {
    if (!userId) {
      return;
    }

    const uploaded = await uploadStudyAsset(file, userId, entryId);
    const signedUrl = await getSignedStudyUrl(uploaded.path);
    insertAtCursor(
      kind === 'image'
        ? {
            type: 'privateImage',
            attrs: {
              id: uploaded.id,
              bucket: uploaded.bucket,
              path: uploaded.path,
              name: uploaded.name,
              alt: uploaded.name,
              mime: uploaded.mime,
              size: uploaded.size,
              createdAt: uploaded.created_at,
              signedUrl,
            },
          }
        : {
            type: 'privateAttachment',
            attrs: {
              id: uploaded.id,
              bucket: uploaded.bucket,
              path: uploaded.path,
              name: uploaded.name,
              mime: uploaded.mime,
              size: uploaded.size,
              createdAt: uploaded.created_at,
              signedUrl,
            },
          },
    );
  };

  const insertDiagramSource = async (file: File, promptForPreview: boolean) => {
    if (!userId) {
      return;
    }

    const uploaded = await uploadStudyAsset(file, userId, entryId, { subfolder: 'diagrams' });
    const sourceSignedUrl = await getSignedStudyUrl(uploaded.path);
    const diagramNodeId = createUuid();

    insertAtCursor({
      type: 'privateDiagram',
      attrs: {
        id: diagramNodeId,
        bucket: uploaded.bucket,
        sourcePath: uploaded.path,
        sourceName: uploaded.name,
        sourceMime: uploaded.mime,
        sourceSize: uploaded.size,
        sourceCreatedAt: uploaded.created_at,
        sourceSignedUrl,
      },
    });

    if (promptForPreview && typeof window !== 'undefined') {
      const wantsPreview = window.confirm(
        'Upload a preview image for this diagram now? You can skip this and keep the Excalidraw source only.',
      );

      if (wantsPreview) {
        setPendingDiagramPreviewNodeId(diagramNodeId);
        window.setTimeout(() => {
          diagramPreviewInputRef.current?.click();
        }, 0);
      }
    }
  };

  const addDiagramPreview = async (file: File, diagramNodeId: string) => {
    if (!userId) {
      return;
    }

    const uploaded = await uploadStudyAsset(file, userId, entryId, { subfolder: 'diagrams' });
    const previewSignedUrl = await getSignedStudyUrl(uploaded.path);

    updateDiagramNode(diagramNodeId, {
      previewPath: uploaded.path,
      previewName: uploaded.name,
      previewMime: uploaded.mime,
      previewSize: uploaded.size,
      previewCreatedAt: uploaded.created_at,
      previewSignedUrl,
    });
  };

  const handleStandardFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setUploadError('');
    setIsUploading(true);

    try {
      for (const file of Array.from(fileList)) {
        const kind = file.type.startsWith('image/') ? 'image' : isDiagramSourceFile(file) ? 'diagram' : 'attachment';

        if (kind === 'diagram') {
          await insertDiagramSource(file, false);
        } else {
          await insertUploadedNode(file, kind);
        }
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiagramSourceFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setUploadError('');
    setIsUploading(true);

    try {
      await insertDiagramSource(fileList[0], true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Diagram upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDiagramPreviewFiles = async (fileList: FileList | null) => {
    const diagramNodeId = pendingDiagramPreviewNodeId;
    setPendingDiagramPreviewNodeId(null);

    if (!diagramNodeId || !fileList || fileList.length === 0) {
      return;
    }

    setUploadError('');
    setIsUploading(true);

    try {
      await addDiagramPreview(fileList[0], diagramNodeId);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Preview upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <Stack spacing="md">
      <Card withBorder radius="lg" className="section-card">
        <Stack spacing="sm">
          <Group position="apart" align="center">
            <Text fw={700}>{entryType === 'SystemDesign' ? 'System Design Editor' : 'Interview Prep Editor'}</Text>
            <Text size="sm" c="dimmed">
              Rich text, private uploads, and signed URL previews in the drawer.
            </Text>
          </Group>

          <Group spacing="xs" align="center">
            <Button size="xs" variant="light" onClick={insertParagraph}>
              Text
            </Button>
            <Button size="xs" variant="light" onClick={insertHeading}>
              Heading
            </Button>
            <Button size="xs" variant="light" onClick={insertBulletList}>
              Bullet list
            </Button>
            <Button size="xs" variant="light" onClick={insertOrderedList}>
              Numbered list
            </Button>
            <Button size="xs" variant="light" onClick={() => insertOrUpdateCodeBlock(preferredCodeLanguage)}>
              Code block
            </Button>
            <Button
              size="xs"
              variant="light"
              onClick={() => imageInputRef.current?.click()}
              loading={isUploading}
              disabled={!userId}
            >
              Image
            </Button>
            <Button
              size="xs"
              variant="light"
              onClick={() => fileInputRef.current?.click()}
              loading={isUploading}
              disabled={!userId}
            >
              Attachment
            </Button>
            <Button
              size="xs"
              variant="light"
              onClick={() => diagramSourceInputRef.current?.click()}
              loading={isUploading}
              disabled={!userId}
            >
              Diagram
            </Button>
            <Button size="xs" variant="light" onClick={insertDivider}>
              Divider
            </Button>
            {entryType === 'SystemDesign' ? (
              <Button size="xs" variant="light" onClick={insertSystemDesignTemplate}>
                Insert System Design Template
              </Button>
            ) : null}
            <Menu withinPortal position="bottom-end">
              <Menu.Target>
                <Button size="xs" variant="subtle">
                  /
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={insertParagraph}>Text</Menu.Item>
                <Menu.Item onClick={insertHeading}>Heading</Menu.Item>
                <Menu.Item onClick={insertBulletList}>Bullet list</Menu.Item>
                <Menu.Item onClick={insertOrderedList}>Numbered list</Menu.Item>
                <Menu.Item onClick={() => insertOrUpdateCodeBlock(preferredCodeLanguage)}>Code block</Menu.Item>
                <Menu.Item onClick={() => imageInputRef.current?.click()} disabled={!userId}>
                  Image
                </Menu.Item>
                <Menu.Item onClick={() => fileInputRef.current?.click()} disabled={!userId}>
                  Attachment
                </Menu.Item>
                <Menu.Item onClick={() => diagramSourceInputRef.current?.click()} disabled={!userId}>
                  Diagram (Excalidraw)
                </Menu.Item>
                <Menu.Item onClick={insertDivider}>Divider</Menu.Item>
                {entryType === 'SystemDesign' ? (
                  <Menu.Item onClick={insertSystemDesignTemplate}>Insert System Design Template</Menu.Item>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          </Group>
          {activeCodeLanguage ? (
            <Group spacing="sm" align="center">
              <Text size="sm" fw={600}>
                Code block language
              </Text>
              <Select
                size="xs"
                style={{ width: 180 }}
                data={RICH_CODE_LANGUAGE_OPTIONS}
                value={activeCodeLanguage}
                onChange={(value) => updateActiveCodeBlockLanguage((value ?? DEFAULT_RICH_CODE_LANGUAGE) as CodeLanguage)}
              />
              <Text size="xs" c="dimmed">
                Syntax highlighting updates immediately.
              </Text>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">
              New code blocks default to {RICH_CODE_LANGUAGE_OPTIONS.find((item) => item.value === preferredCodeLanguage)?.label ?? 'Plain text'}.
            </Text>
          )}
        </Stack>
      </Card>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void handleStandardFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(event) => {
          void handleStandardFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={diagramSourceInputRef}
        type="file"
        accept=".excalidraw,application/json"
        hidden
        onChange={(event) => {
          void handleDiagramSourceFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={diagramPreviewInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void handleDiagramPreviewFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <Card
        withBorder
        radius="lg"
        className="section-card interview-editor-card"
        onPaste={(event) => {
          if (event.clipboardData.files.length > 0) {
            event.preventDefault();
            void handleStandardFiles(event.clipboardData.files);
          }
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) {
            event.preventDefault();
            void handleStandardFiles(event.dataTransfer.files);
          }
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
          }
        }}
      >
        <Stack spacing="sm">
          <Text size="sm" c="dimmed">
            {userId
              ? 'Paste or drag files directly into the editor to upload them privately to Supabase Storage. Excalidraw source files should use the Diagram insert.'
              : 'Sign in with cloud sync enabled to upload private images, diagrams, and attachments.'}
          </Text>
          {uploadError ? (
            <Text size="sm" c="danger">
              {uploadError}
            </Text>
          ) : null}
          <Divider />
          <EditorContent editor={editor} className="interview-tiptap" />
        </Stack>
      </Card>
    </Stack>
  );
}
