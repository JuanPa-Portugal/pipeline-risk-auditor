export interface ExportMarkdownButtonProps {
  content: string;
  sourceFileName: string;
  disabled?: boolean;
}

/**
 * Sanitizes a filename by replacing unsafe characters and cleaning up.
 * Unsafe characters for filenames: < > : " / \ | ? *
 */
function sanitizeFileName(name: string): string {
  return name
    // Replace unsafe characters with hyphen
    .replace(/[<>:"/\\|?*]/g, '-')
    // Collapse multiple consecutive hyphens
    .replace(/-{2,}/g, '-')
    // Remove trailing dots and spaces
    .replace(/[.\s]+$/, '');
}

/**
 * Builds the download filename from the source CSV filename.
 *
 * Order: trim → remove .csv extension → sanitize → build final name.
 *
 * Examples:
 *   " clientes.csv " → clientes-pipeline-risk-report.md
 *   "CLIENTES.CSV " → CLIENTES-pipeline-risk-report.md
 *   " .csv "         → pipeline-risk-report.md
 *   "datos"          → datos-pipeline-risk-report.md
 *   ""               → pipeline-risk-report.md
 */
function buildDownloadFileName(sourceFileName: string): string {
  // 1. Trim whitespace from both ends
  const trimmed = sourceFileName.trim();

  // 2. Remove only the final .csv extension (case-insensitive)
  const withoutExtension = trimmed.replace(/\.csv$/i, '');

  // 3. Sanitize the remaining name
  const sanitized = sanitizeFileName(withoutExtension);

  if (sanitized === '') {
    return 'pipeline-risk-report.md';
  }

  return `${sanitized}-pipeline-risk-report.md`;
}

/**
 * Triggers the download of a Markdown file.
 * Creates a temporary Blob URL, clicks a temporary <a> element, and cleans up.
 *
 * Resources (URL and anchor) are managed within try/finally to ensure cleanup
 * even if an error occurs. Errors propagate after cleanup.
 */
function triggerDownload(content: string, fileName: string): void {
  let url: string | null = null;
  let anchor: HTMLAnchorElement | null = null;

  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    url = URL.createObjectURL(blob);
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    // Remove anchor only if it exists and is connected to the DOM
    if (anchor && anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
    // Revoke URL only if it was created
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * ExportMarkdownButton — A button that triggers the download of a Markdown report.
 * Receives pre-generated content and source filename as props.
 * Does not access AppContext directly.
 */
export function ExportMarkdownButton({
  content,
  sourceFileName,
  disabled = false,
}: ExportMarkdownButtonProps) {
  const isDisabled = disabled || content.trim() === '';

  const handleClick = () => {
    if (isDisabled) return;
    const fileName = buildDownloadFileName(sourceFileName);
    triggerDownload(content, fileName);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label="Exportar el reporte de auditoría como archivo Markdown"
      className={`
        px-4 py-2 text-sm font-medium rounded-md border transition-colors
        focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400
        ${isDisabled
          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
          : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700 active:bg-blue-800'
        }
      `}
    >
      Exportar reporte Markdown
    </button>
  );
}
