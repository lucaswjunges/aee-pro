export interface TemplateFile {
  path: string;
  content: string;
  mimeType: string;
}

/**
 * Pre-seeded files for project templates.
 * Key = templateId, value = array of files to create in the project.
 * Currently empty — project templates use frontend-only prompts via sessionStorage.
 */
export const TEMPLATE_FILES: Record<string, TemplateFile[]> = {};
