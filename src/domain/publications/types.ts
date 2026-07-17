export const publicationThemes = [
  'classic',
  'modern',
  'ministry',
  'workbook',
  'magazine',
  'minimal',
  'dark'
] as const;

export type PublicationTheme = (typeof publicationThemes)[number];

export const publicationAudiences = [
  'general',
  'church',
  'youth',
  'small-group',
  'leadership',
  'bible-study',
  'education',
  'nonprofit',
  'coaching'
] as const;

export type PublicationAudience = (typeof publicationAudiences)[number];

export type PublicationStyle = {
  readonly tone: string;
  readonly readingLevel: 'introductory' | 'intermediate' | 'advanced';
  readonly voice: 'pastoral' | 'instructional' | 'reflective';
};

export type PublicationMetadata = {
  readonly publicationId: string;
  readonly publicationType: 'cta-guide';
  readonly title: string;
  readonly subtitle: string | null;
  readonly author: string;
  readonly organization: string | null;
  readonly generatedAt: string;
  readonly sourceVersionId: string;
  readonly sourceContentHash: string;
  readonly pipelineVersion: string;
  readonly audience: PublicationAudience;
  readonly theme: PublicationTheme;
  readonly style: PublicationStyle;
};

export type PublicationAsset = {
  readonly id: string;
  readonly type: 'image';
  readonly uri: string;
  readonly altText: string | null;
  readonly mimeType: string | null;
};

export type PublicationReference = {
  readonly id: string;
  readonly referenceType: 'bible' | 'external' | 'internal';
  readonly label: string;
  readonly detail: string;
  readonly url: string | null;
  readonly targetId: string | null;
};

export type PublicationCitation = {
  readonly id: string;
  readonly label: string;
  readonly text: string;
  readonly referenceId: string | null;
};

export type PublicationFootnote = {
  readonly id: string;
  readonly marker: string;
  readonly text: string;
};

export type PublicationTable = {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export type PublicationSidebar = {
  readonly title: string;
  readonly body: string;
};

export type PublicationImage = {
  readonly assetId: string;
  readonly caption: string | null;
};

export type PublicationBlock =
  | {
      readonly id: string;
      readonly type: 'heading';
      readonly level: 1 | 2 | 3;
      readonly text: string;
      readonly citationIds?: readonly string[];
      readonly footnoteIds?: readonly string[];
    }
  | {
      readonly id: string;
      readonly type: 'paragraph' | 'reflection' | 'prayer' | 'journal-prompt' | 'key-takeaway' | 'warning' | 'highlight' | 'quote';
      readonly text: string;
      readonly attribution: string | null;
      readonly citationIds?: readonly string[];
      readonly footnoteIds?: readonly string[];
    }
  | {
      readonly id: string;
      readonly type: 'call-to-action';
      readonly title: string;
      readonly description: string;
      readonly action: string;
      readonly citationIds?: readonly string[];
      readonly footnoteIds?: readonly string[];
    }
  | {
      readonly id: string;
      readonly type: 'scripture';
      readonly references: readonly string[];
      readonly text: string;
      readonly citationIds?: readonly string[];
      readonly footnoteIds?: readonly string[];
    }
  | {
      readonly id: string;
      readonly type: 'checklist' | 'bullet-list' | 'numbered-list';
      readonly items: readonly string[];
      readonly citationIds?: readonly string[];
      readonly footnoteIds?: readonly string[];
    }
  | {
      readonly id: string;
      readonly type: 'sidebar';
      readonly sidebar: PublicationSidebar;
    }
  | {
      readonly id: string;
      readonly type: 'image-placeholder';
      readonly image: PublicationImage;
    }
  | {
      readonly id: string;
      readonly type: 'table';
      readonly table: PublicationTable;
    }
  | {
      readonly id: string;
      readonly type: 'divider';
    };

export type PublicationSection = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly order: number;
  readonly blocks: readonly PublicationBlock[];
};

export type PublicationCover = {
  readonly title: string;
  readonly subtitle: string | null;
  readonly author: string;
  readonly organization: string | null;
  readonly coverImageAssetId: string | null;
  readonly branding: string | null;
  readonly generatedDate: string;
  readonly publicationType: 'cta-guide';
};

export type PublicationTableOfContentsEntry = {
  readonly id: string;
  readonly targetId: string;
  readonly title: string;
  readonly level: 1 | 2 | 3;
  readonly anchor: string;
  readonly parentId: string | null;
  readonly pageNumber: number | null;
};

export type PublicationTableOfContents = {
  readonly entries: readonly PublicationTableOfContentsEntry[];
};

export type PublicationDocument = {
  readonly schemaVersion: '1.0';
  readonly layoutIntent: 'digital-first' | 'print-first';
  readonly language: string;
};

export type PublicationRenderOptions = {
  readonly preferredTargets: readonly ('cta-guide' | 'epub' | 'pdf' | 'html' | 'docx' | 'markdown')[];
  readonly includeCover: boolean;
  readonly includeToc: boolean;
};

export type Publication = {
  readonly metadata: PublicationMetadata;
  readonly cover: PublicationCover;
  readonly toc: PublicationTableOfContents;
  readonly sections: readonly PublicationSection[];
  readonly references: readonly PublicationReference[];
  readonly citations: readonly PublicationCitation[];
  readonly footnotes: readonly PublicationFootnote[];
  readonly assets: readonly PublicationAsset[];
  readonly document: PublicationDocument;
  readonly renderOptions: PublicationRenderOptions;
};