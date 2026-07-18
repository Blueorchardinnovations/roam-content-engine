export const htmlThemes = [
  'classic',
  'modern',
  'ministry',
  'workbook',
  'magazine',
  'minimal',
  'dark'
] as const;

export type HtmlTheme = (typeof htmlThemes)[number];

export const htmlClassTokens = [
  'document',
  'document-header',
  'document-main',
  'document-footer',
  'section',
  'section-title',
  'toc',
  'toc-list',
  'toc-item',
  'content-block',
  'callout',
  'list',
  'table',
  'references',
  'footnotes'
] as const;

export type HtmlClassToken = (typeof htmlClassTokens)[number];
export type HtmlClassList = readonly HtmlClassToken[];

export type HtmlAttributes = {
  readonly id?: string;
  readonly href?: string;
  readonly src?: string;
  readonly alt?: string;
  readonly title?: string;
  readonly role?: string;
  readonly lang?: string;
  readonly target?: '_blank';
  readonly rel?: string;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  readonly ariaLabelledBy?: string;
  readonly scope?: 'row' | 'col';
  readonly colspan?: string;
  readonly rowspan?: string;
  readonly loading?: 'lazy' | 'eager';
  readonly decoding?: 'auto' | 'sync' | 'async';
  readonly referrerpolicy?: 'no-referrer' | 'strict-origin-when-cross-origin';
  readonly dataPublicationBlock?:
    | 'reflection'
    | 'call-to-action'
    | 'prayer'
    | 'journal-prompt'
    | 'sidebar'
    | 'key-takeaway'
    | 'warning'
    | 'highlight'
    | 'scripture';
  readonly dataReferenceId?: string;
  readonly dataCitationId?: string;
  readonly dataFootnoteId?: string;
};

export type HtmlStyleToken =
  | { readonly category: 'spacing'; readonly value: 'none' | 'compact' | 'comfortable' | 'expanded' }
  | { readonly category: 'typography'; readonly value: 'display' | 'heading' | 'body' | 'caption' | 'label' }
  | { readonly category: 'color-intent'; readonly value: 'neutral' | 'brand' | 'accent' | 'emphasis' | 'contrast' }
  | { readonly category: 'font-role'; readonly value: 'default' | 'reading' | 'display' | 'mono' }
  | { readonly category: 'border-intent'; readonly value: 'none' | 'subtle' | 'strong' | 'focus' }
  | { readonly category: 'shadow-intent'; readonly value: 'none' | 'raised' | 'overlay' }
  | { readonly category: 'radius'; readonly value: 'none' | 'soft' | 'rounded' | 'pill' }
  | {
    readonly category: 'callout-type';
    readonly value:
      | 'note'
      | 'reflection'
      | 'call-to-action'
      | 'prayer'
      | 'journal-prompt'
      | 'sidebar'
      | 'key-takeaway'
      | 'warning'
      | 'highlight';
  }
  | { readonly category: 'page-intent'; readonly value: 'reading' | 'study' | 'reference' }
  | { readonly category: 'section-intent'; readonly value: 'cover' | 'toc' | 'content' | 'references' | 'footnotes' }
  | { readonly category: 'heading-intent'; readonly value: 'document-title' | 'section-title' | 'subsection-title' }
  | { readonly category: 'content-width'; readonly value: 'narrow' | 'standard' | 'wide' }
  | { readonly category: 'image-alignment'; readonly value: 'left' | 'center' | 'right' | 'full-bleed' };

export type HtmlAssetReference = {
  readonly id: string;
  readonly assetId: string;
  readonly uri: string;
  readonly mimeType: string | null;
  readonly altText: string;
};

export type HtmlMetadata = {
  readonly publicationId: string;
  readonly publicationType: 'cta-guide';
  readonly title: string;
  readonly description: string | null;
  readonly language: string;
  readonly generatedAt: string;
  readonly sourceVersionId: string;
  readonly sourceContentHash: string;
  readonly audience: string;
  readonly theme: HtmlTheme;
  readonly styleTokens: readonly HtmlStyleToken[];
  readonly assetReferences: readonly HtmlAssetReference[];
};

export type HtmlHead = {
  readonly title: string;
  readonly lang: string;
  readonly metadata: readonly {
    readonly name: string;
    readonly content: string;
  }[];
  readonly styleTokens: readonly HtmlStyleToken[];
};

export type HtmlTextNode = {
  readonly nodeType: 'text';
  readonly text: string;
};

type HtmlElementBase = {
  readonly nodeType: 'element';
  readonly elementType: 'generic' | 'heading' | 'list' | 'table' | 'image' | 'callout';
  readonly id: string | null;
  readonly tag: string;
  readonly attributes: HtmlAttributes;
  readonly classList: HtmlClassList;
  readonly ariaLabel: string | null;
  readonly role: string | null;
  readonly styleTokens: readonly HtmlStyleToken[];
  readonly children: readonly HtmlNode[];
};

export type HtmlHeading = HtmlElementBase & {
  readonly elementType: 'heading';
  readonly tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
};

export type HtmlList = HtmlElementBase & {
  readonly elementType: 'list';
  readonly tag: 'ul' | 'ol';
  readonly ordered: boolean;
};

export type HtmlTable = HtmlElementBase & {
  readonly elementType: 'table';
  readonly tag: 'table';
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

export type HtmlImage = HtmlElementBase & {
  readonly elementType: 'image';
  readonly tag: 'figure';
  readonly assetId: string;
  readonly src: string;
  readonly alt: string;
  readonly caption: string | null;
};

export type HtmlCallout = HtmlElementBase & {
  readonly elementType: 'callout';
  readonly tag: 'aside';
  readonly calloutType:
    | 'note'
    | 'reflection'
    | 'call-to-action'
    | 'prayer'
    | 'journal-prompt'
    | 'sidebar'
    | 'key-takeaway'
    | 'warning'
    | 'highlight';
};

export type HtmlElement = HtmlElementBase | HtmlHeading | HtmlList | HtmlTable | HtmlImage | HtmlCallout;

export type HtmlNode = HtmlTextNode | HtmlElement;

export type HtmlSection = {
  readonly id: string;
  readonly title: string;
  readonly role: 'cover' | 'toc' | 'content' | 'references' | 'footnotes';
  readonly styleTokens: readonly HtmlStyleToken[];
  readonly elements: readonly HtmlElement[];
};

export type HtmlBody = {
  readonly skipNavigationTargetId: string;
  readonly sections: readonly HtmlSection[];
  readonly landmarks: readonly {
    readonly role: 'banner' | 'navigation' | 'main' | 'contentinfo';
    readonly sectionId: string;
    readonly label: string | null;
  }[];
};

export type HtmlDocument = {
  readonly schemaVersion: '1.0';
  readonly metadata: HtmlMetadata;
  readonly theme: HtmlTheme;
  readonly head: HtmlHead;
  readonly body: HtmlBody;
};
