import type { PublicationTheme } from '../publications/types.js';
import type { HtmlDocument, HtmlStyleToken } from '../publications/html-types.js';

export const renderFormats = ['html', 'pdf', 'epub', 'docx', 'markdown'] as const;

export type RenderFormat = (typeof renderFormats)[number];

export const renderArtifactPayloadRepresentations = [
  'structured-json',
  'html-markup',
  'binary',
  'storage-reference'
] as const;

export type RenderArtifactPayloadRepresentation =
  (typeof renderArtifactPayloadRepresentations)[number];

export type RenderTheme = PublicationTheme;

export type RenderRequestMetadata = {
  title: string;
  subtitle: string | null;
  author: string;
  speaker: string | null;
  organization: string | null;
  publicationDate: string;
  language: string;
  theme: RenderTheme;
  keywords: string[];
  description: string | null;
  coverImageReference: string | null;
  copyright: string | null;
  license: string | null;
};

export type RenderOptions = {
  format: RenderFormat;
  theme: RenderTheme;
};

export type RenderRequest = {
  htmlDocument: HtmlDocument;
  metadata: RenderRequestMetadata;
  options: RenderOptions;
};

export type RenderWarning = {
  code: string;
  message: string;
};

export type RenderError = {
  code: string;
  message: string;
};

export type RenderArtifactStatus = 'ready' | 'warning' | 'error';

export type RenderArtifactMetadata = {
  artifactId: string;
  status: RenderArtifactStatus;
  format: RenderFormat;
  payloadRepresentation?: RenderArtifactPayloadRepresentation;
  mimeType: string;
  fileExtension: '.html' | '.json' | '.pdf' | '.epub' | '.docx' | '.md';
  checksumSha256: string;
  byteSize: number;
  createdAt: string;
  warnings: RenderWarning[];
  errors: RenderError[];
};

export type InlineArtifactContent = {
  kind: 'inline';
  encoding: 'utf-8' | 'base64';
  bytesBase64: string;
  serializedDocument: string;
};

export type ArtifactStorageReference =
  | {
      kind: 'none';
    }
  | {
      kind: 'storage';
      provider: 'azure-blob' | 's3' | 'gcs' | 'filesystem';
      uri: string;
      checksumSha256: string;
      byteSize: number;
    };

export type RenderArtifact = {
  metadata: RenderArtifactMetadata;
  content: InlineArtifactContent | null;
  storage: ArtifactStorageReference;
};

export type RendererCapabilities = {
  renderer: string;
  formats: RenderFormat[];
  themes: RenderTheme[];
  supportedTokenCategories: HtmlStyleToken['category'][];
};