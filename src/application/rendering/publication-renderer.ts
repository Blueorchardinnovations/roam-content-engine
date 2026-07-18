import type {
  RenderArtifact,
  RenderFormat,
  RendererCapabilities,
  RenderRequest,
  RenderTheme
} from '../../domain/rendering/types.js';

export interface PublicationRenderer {
  render(request: RenderRequest, signal?: AbortSignal): RenderArtifact;
  validate(request: RenderRequest): void;
  getCapabilities(): RendererCapabilities;
  supports(format: RenderFormat): boolean;
  supportedThemes(): readonly RenderTheme[];
  supportedFormats(): readonly RenderFormat[];
}
