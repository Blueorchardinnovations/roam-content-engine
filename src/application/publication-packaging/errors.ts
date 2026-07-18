export class PublicationPackagingError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PublicationPackagingError';
  }
}

export class InvalidPublicationPackageCompositionInputError extends PublicationPackagingError {
  public constructor(message = 'Publication package composition input is invalid.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InvalidPublicationPackageCompositionInputError';
  }
}

export class HtmlSerializationError extends PublicationPackagingError {
  public constructor(options?: { cause?: unknown }) {
    super('HTML serialization failed during publication packaging.', options);
    this.name = 'HtmlSerializationError';
  }
}

export class CssPackagingError extends PublicationPackagingError {
  public constructor(options?: { cause?: unknown }) {
    super('CSS packaging failed during publication packaging.', options);
    this.name = 'CssPackagingError';
  }
}

export class MissingPublicationTitleError extends PublicationPackagingError {
  public constructor() {
    super('Publication title is required for standalone document composition.');
    this.name = 'MissingPublicationTitleError';
  }
}

export class InvalidPublicationLanguageError extends PublicationPackagingError {
  public constructor() {
    super('Publication language metadata is invalid for standalone document composition.');
    this.name = 'InvalidPublicationLanguageError';
  }
}

export class InvalidSerializedHtmlDocumentError extends PublicationPackagingError {
  public constructor(message = 'Serialized HTML document structure is invalid.', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InvalidSerializedHtmlDocumentError';
  }
}

export class UnsafeStandaloneHtmlError extends PublicationPackagingError {
  public constructor(message = 'Standalone HTML output contains prohibited active content or invalid embedded CSS.') {
    super(message);
    this.name = 'UnsafeStandaloneHtmlError';
  }
}

export class InvalidStandaloneHtmlDocumentInvariantError extends PublicationPackagingError {
  public constructor(message = 'Standalone HTML document invariants are invalid.') {
    super(message);
    this.name = 'InvalidStandaloneHtmlDocumentInvariantError';
  }
}
