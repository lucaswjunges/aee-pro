import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

/**
 * Convert LaTeX source to simplified text/markdown for DOCX generation.
 * Strips preamble, converts \section/\subsection to markdown headings,
 * removes common LaTeX commands, and preserves readable text.
 */
export function latexToText(latex: string): string {
  // Remove everything before \begin{document}
  const docStart = latex.indexOf("\\begin{document}");
  const docEnd = latex.indexOf("\\end{document}");
  let body = latex;
  if (docStart !== -1) {
    body = latex.slice(docStart + "\\begin{document}".length, docEnd !== -1 ? docEnd : undefined);
  }

  return (
    body
      // Convert sectioning commands to markdown headings
      .replace(/\\section\*?\{([^}]+)\}/g, "# $1")
      .replace(/\\subsection\*?\{([^}]+)\}/g, "## $1")
      .replace(/\\subsubsection\*?\{([^}]+)\}/g, "### $1")
      .replace(/\\paragraph\{([^}]+)\}/g, "**$1**")
      // Convert text formatting
      .replace(/\\textbf\{([^}]+)\}/g, "**$1**")
      .replace(/\\textit\{([^}]+)\}/g, "$1")
      .replace(/\\underline\{([^}]+)\}/g, "$1")
      .replace(/\\emph\{([^}]+)\}/g, "$1")
      // Convert lists
      .replace(/\\begin\{itemize\}/g, "")
      .replace(/\\end\{itemize\}/g, "")
      .replace(/\\begin\{enumerate\}/g, "")
      .replace(/\\end\{enumerate\}/g, "")
      .replace(/\\item\s*/g, "• ")
      // Convert common environments
      .replace(/\\begin\{center\}/g, "")
      .replace(/\\end\{center\}/g, "")
      .replace(/\\begin\{quote\}/g, "")
      .replace(/\\end\{quote\}/g, "")
      .replace(/\\begin\{tabular\}[^}]*\}/g, "")
      .replace(/\\end\{tabular\}/g, "")
      // Remove spacing/layout commands
      .replace(/\\vspace\*?\{[^}]*\}/g, "")
      .replace(/\\hspace\*?\{[^}]*\}/g, "")
      .replace(/\\noindent\s*/g, "")
      .replace(/\\newpage/g, "")
      .replace(/\\clearpage/g, "")
      .replace(/\\\\(\[.*?\])?/g, "\n")
      .replace(/\\hline/g, "")
      .replace(/\\centering/g, "")
      // Remove \maketitle and title/author/date commands
      .replace(/\\maketitle/g, "")
      .replace(/\\title\{([^}]+)\}/g, "# $1")
      .replace(/\\author\{([^}]+)\}/g, "$1")
      .replace(/\\date\{([^}]+)\}/g, "$1")
      // Remove remaining unknown commands (but keep their content if in braces)
      .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1")
      .replace(/\\[a-zA-Z]+/g, "")
      // Clean up table separators
      .replace(/&/g, " | ")
      // Clean up excess whitespace
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Split text on **bold** markers and return TextRun array */
function inlineRuns(text: string, size: number): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const m = part.match(/^\*\*(.+)\*\*$/);
    return new TextRun({ text: m ? m[1] : part, bold: m ? true : undefined, size, font: "Arial" });
  });
}

/** Strip **markers** from heading text (headings are already bold via style) */
function stripBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export async function generateDocx(
  title: string,
  content: string,
  studentName: string,
  date: string
): Promise<Uint8Array> {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 28,
          font: "Arial",
        }),
      ],
    })
  );

  // Subtitle with student name and date
  if (studentName) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: `Aluno(a): ${studentName} — ${date}`,
            size: 22,
            font: "Arial",
            color: "666666",
          }),
        ],
      })
    );
  }

  // Parse content into paragraphs
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Detect markdown-style headings
    const h3Match = trimmed.match(/^###\s+(.+)/);
    const h2Match = !h3Match && trimmed.match(/^##\s+(.+)/);
    const h1Match = !h3Match && !h2Match && trimmed.match(/^#\s+(.+)/);
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);

    if (h3Match) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: stripBold(h3Match[1]), bold: true, size: 22, font: "Arial" })],
        })
      );
    } else if (h1Match) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
          children: [new TextRun({ text: stripBold(h1Match[1]), bold: true, size: 26, font: "Arial" })],
        })
      );
    } else if (h2Match) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 250, after: 100 },
          children: [new TextRun({ text: stripBold(h2Match[1]), bold: true, size: 24, font: "Arial" })],
        })
      );
    } else if (boldMatch) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: boldMatch[1], bold: true, size: 22, font: "Arial" })],
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({ spacing: { after: 80 }, children: inlineRuns(trimmed, 22) })
      );
    }
  }

  console.log(`[export-docx] Generating DOCX: title="${title}", contentLength=${content.length}, paragraphs=${paragraphs.length}`);

  const doc = new Document({
    creator: "AEE+ Pro",
    title,
    styles: {
      default: {
        document: {
          run: {
            size: 22,
            font: "Arial",
          },
          paragraph: {
            spacing: { after: 120 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  // Use toBase64String to avoid Buffer/Blob compatibility issues in CF Workers
  const base64 = await Packer.toBase64String(doc);
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}
