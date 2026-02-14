import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

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

  // Parse content into paragraphs
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Detect markdown-style headings
    const h2Match = trimmed.match(/^##\s+(.+)/);
    const h1Match = trimmed.match(/^#\s+(.+)/);
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);

    if (h1Match) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
          children: [
            new TextRun({
              text: h1Match[1],
              bold: true,
              size: 26,
              font: "Arial",
            }),
          ],
        })
      );
    } else if (h2Match) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 250, after: 100 },
          children: [
            new TextRun({
              text: h2Match[1],
              bold: true,
              size: 24,
              font: "Arial",
            }),
          ],
        })
      );
    } else if (boldMatch) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: boldMatch[1],
              bold: true,
              size: 22,
              font: "Arial",
            }),
          ],
        })
      );
    } else {
      // Process inline bold (**text**) within regular paragraphs
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      const runs: TextRun[] = parts
        .filter((p) => p)
        .map((part) => {
          const inlineBold = part.match(/^\*\*(.+)\*\*$/);
          if (inlineBold) {
            return new TextRun({
              text: inlineBold[1],
              bold: true,
              size: 22,
              font: "Arial",
            });
          }
          return new TextRun({
            text: part,
            size: 22,
            font: "Arial",
          });
        });

      paragraphs.push(
        new Paragraph({
          spacing: { after: 80 },
          children: runs,
        })
      );
    }
  }

  const doc = new Document({
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

  return Packer.toBuffer(doc) as Promise<Uint8Array>;
}
