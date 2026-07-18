import { ErrorCode } from '../../platform/shared/errors/codes.js';

export class HtmlValidationError extends Error {
  public readonly code = ErrorCode.HTML_VALIDATION_ERROR;

  public constructor(message = 'HTML document failed validation.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'HtmlValidationError';
  }
}

export class HtmlCompositionError extends Error {
  public readonly code = ErrorCode.HTML_COMPOSITION_ERROR;

  public constructor(message = 'HTML composition failed.') {
    super(message);
    this.name = 'HtmlCompositionError';
  }
}

export class UnsupportedHtmlElementError extends Error {
  public readonly code = ErrorCode.HTML_UNSUPPORTED_ELEMENT;

  public constructor(message = 'Unsupported HTML element mapping encountered.') {
    super(message);
    this.name = 'UnsupportedHtmlElementError';
  }
}

export class HtmlCancelledError extends Error {
  public constructor(message = 'HTML composition was cancelled.') {
    super(message);
    this.name = 'HtmlCancelledError';
  }
}
