import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Divider, Group, Menu, Select, Stack, Text } from '@mantine/core';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Node, mergeAttributes } from '@tiptap/core';
import { common, createLowlight } from 'lowlight';
import type { EntryAttachment, RichContentJson } from '../types';
import { createEmptyRichDoc } from '../lib/studyData';
import { getSignedStudyUrl, STUDY_UPLOAD_BUCKET, uploadStudyAsset } from '../lib/storageAssets';

const lowlight = createLowlight(common);

const CODE_LANGUAGE_OPTIONS = [
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'cpp', label: 'C++' },
  { value: 'go', label: 'Go' },
  { value: 'sql', label: 'SQL' },
  { value: 'other', label: 'Other' },
];

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

interface InterviewPrepEditorProps {
  entryId: string;
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

const collectAssetAttrs = (value: unknown): AssetNodeAttrs[] => {
  const results: AssetNodeAttrs[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const current = node as Record<string, unknown>;
    const nodeType = typeof current.type === 'string' ? current.type : '';

    if (nodeType === 'privateImage' || nodeType === 'privateAttachment') {
      const attrs = (current.attrs ?? {}) as Record<string, unknown>;
      const path = typeof attrs.path === 'string' ? attrs.path : '';
      const name = typeof attrs.name === 'string' ? attrs.name : nodeType === 'privateImage' ? 'Image' : 'Attachment';

      if (path) {
        results.push({
          id: typeof attrs.id === 'string' ? attrs.id : path,
          bucket: typeof attrs.bucket === 'string' ? attrs.bucket : STUDY_UPLOAD_BUCKET,
          path,
          name,
          mime: typeof attrs.mime === 'string' ? attrs.mime : undefined,
          size: typeof attrs.size === 'number' ? attrs.size : undefined,
          createdAt: typeof attrs.createdAt === 'string' ? attrs.createdAt : undefined,
          alt: typeof attrs.alt === 'string' ? attrs.alt : undefined,
          signedUrl: typeof attrs.signedUrl === 'string' ? attrs.signedUrl : undefined,
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
        next[key] = attrs;
        return;
      }

      next[key] = walk(child);
    });

    return next;
  };

  return (walk(value) as RichContentJson) ?? createEmptyRichDoc();
};

const appendParagraphText = (text: string) => ({
  type: 'paragraph',
  content: text
    ? [
        {
          type: 'text',
          text,
        },
      ]
    : undefined,
});

export default function InterviewPrepEditor({
  entryId,
  userId,
  value,
  attachments = [],
  onChange,
}: InterviewPrepEditorProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMetaRef = useRef<Map<string, EntryAttachment>>(new Map());
  const lastSerializedRef = useRef('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const nextMap = new Map<string, EntryAttachment>();
    attachments.forEach((item) => {
      nextMap.set(item.path, item);
    });
    attachmentMetaRef.current = nextMap;
  }, [attachments]);

  const initialContent = useMemo(() => value ?? createEmptyRichDoc(), [value]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: 'Type "/" for insert options, or start writing your notes.',
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      PrivateImageNode,
      AttachmentNode,
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
      const assetNodes = collectAssetAttrs(nextEditor.getJSON());
      const nextAttachments = assetNodes.map((asset) => {
        const existing = attachmentMetaRef.current.get(asset.path);
        return (
          existing ?? {
            id: asset.id,
            name: asset.name,
            bucket: asset.bucket,
            path: asset.path,
            mime: asset.mime ?? 'application/octet-stream',
            size: asset.size ?? 0,
            created_at: asset.createdAt ?? new Date().toISOString(),
          }
        );
      });

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

    const assetNodes = collectAssetAttrs(instance.getJSON());
    if (assetNodes.length === 0) {
      return;
    }

    const signedUrls = await Promise.all(
      assetNodes.map(async (asset) => ({
        path: asset.path,
        url: await getSignedStudyUrl(asset.path),
      })),
    );

    const urlByPath = new Map(signedUrls.map((item) => [item.path, item.url]));

    instance.commands.command(({ tr, state }) => {
      let changed = false;

      state.doc.descendants((node, pos) => {
        if ((node.type.name !== 'privateImage' && node.type.name !== 'privateAttachment') || !node.attrs.path) {
          return;
        }

        const nextUrl = urlByPath.get(node.attrs.path as string);
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

  const insertAtCursor = (content: Record<string, unknown>) => {
    if (!editor) {
      return;
    }

    editor.chain().focus().insertContent(content).run();
  };

  const insertParagraph = () => insertAtCursor(appendParagraphText(''));
  const insertHeading = () =>
    insertAtCursor({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading' }],
    });
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

  const currentCodeLanguage = editor?.getAttributes('codeBlock').language || 'other';

  const insertOrUpdateCodeBlock = (language: string) => {
    if (!editor) {
      return;
    }

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

  const addUploadedAssetNode = async (file: File, kind: 'image' | 'attachment') => {
    if (!userId) {
      return;
    }

    setUploadError('');
    setIsUploading(true);

    try {
      const uploaded = await uploadStudyAsset(file, userId, entryId);
      const signedUrl = await getSignedStudyUrl(uploaded.path);
      attachmentMetaRef.current.set(uploaded.path, uploaded);

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
    } finally {
      setIsUploading(false);
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    for (const file of Array.from(fileList)) {
      try {
        const kind = file.type.startsWith('image/') ? 'image' : 'attachment';
        await addUploadedAssetNode(file, kind);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Upload failed.');
      }
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
            <Text fw={700}>Interview Prep Editor</Text>
            <Text size="sm" c="dimmed">
              Rich blocks, private uploads, and signed URL previews.
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
            <Select
              size="xs"
              style={{ width: 150 }}
              data={CODE_LANGUAGE_OPTIONS}
              value={currentCodeLanguage}
              onChange={(value) => insertOrUpdateCodeBlock(value ?? 'other')}
            />
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
            <Button size="xs" variant="light" onClick={insertDivider}>
              Divider
            </Button>
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
                <Menu.Item onClick={() => insertOrUpdateCodeBlock(currentCodeLanguage)}>Code block</Menu.Item>
                <Menu.Item onClick={() => imageInputRef.current?.click()} disabled={!userId}>
                  Image
                </Menu.Item>
                <Menu.Item onClick={() => fileInputRef.current?.click()} disabled={!userId}>
                  Attachment
                </Menu.Item>
                <Menu.Item onClick={insertDivider}>Divider</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Stack>
      </Card>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(event) => {
          void handleFiles(event.currentTarget.files);
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
            void handleFiles(event.clipboardData.files);
          }
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) {
            event.preventDefault();
            void handleFiles(event.dataTransfer.files);
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
              ? 'Paste or drag files directly into the editor to upload them privately to Supabase Storage.'
              : 'Sign in with cloud sync enabled to upload private images and attachments.'}
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
