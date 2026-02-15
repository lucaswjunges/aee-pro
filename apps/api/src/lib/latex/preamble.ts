interface PreambleOptions {
  documentTitle: string;
  studentName: string;
  schoolName: string;
}

export function getLatexPreamble(options: PreambleOptions): string {
  const { documentTitle, studentName, schoolName } = options;

  return `% ============================================================================
% ${documentTitle} - Atendimento Educacional Especializado (AEE)
% Gerado por AEE+ PRO | www.blumenauti.com.br
% ============================================================================
\\documentclass[12pt,a4paper]{article}

% --- Encoding & Language ---
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[brazil]{babel}

% --- Typography ---
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{setspace}
\\onehalfspacing

% --- Page Layout ---
\\usepackage[
  top=2.5cm,
  bottom=2.5cm,
  left=2.5cm,
  right=2.5cm,
  headheight=15pt
]{geometry}

% --- Colors ---
\\usepackage[dvipsnames,svgnames,x11names]{xcolor}
\\definecolor{aeeblue}{HTML}{1E3A5F}
\\definecolor{aeegold}{HTML}{C9A84C}
\\definecolor{aeelightblue}{HTML}{E8F0FE}
\\definecolor{aeegreen}{HTML}{2E7D32}
\\definecolor{aeered}{HTML}{C62828}
\\definecolor{aeeorange}{HTML}{E65100}
\\definecolor{aeepurple}{HTML}{6A1B9A}
\\definecolor{aeeteal}{HTML}{00695C}
\\definecolor{aeegray}{HTML}{F5F5F5}
\\definecolor{textgray}{HTML}{555555}
\\definecolor{lightgreen}{HTML}{E8F5E9}
\\definecolor{lightorange}{HTML}{FFF3E0}
\\definecolor{lightpurple}{HTML}{F3E5F5}
\\definecolor{lightteal}{HTML}{E0F2F1}
\\definecolor{lightred}{HTML}{FFEBEE}
\\definecolor{lightyellow}{HTML}{FFFDE7}

% --- Graphics & Tables ---
\\usepackage[draft]{graphicx}  % draft mode: ignore missing images
\\usepackage{tikz}
\\usetikzlibrary{positioning,shapes.geometric,calc,decorations.pathmorphing,shadows,patterns,fit,arrows.meta,backgrounds}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepackage{tabularx}
\\usepackage{booktabs}
\\usepackage{multirow}
\\usepackage{makecell}
\\usepackage{colortbl}
\\usepackage{array}
\\usepackage{longtable}
\\usepackage{adjustbox}

% --- Lists & Enumerations ---
\\usepackage{pifont}
\\usepackage{enumitem}
\\setlist[itemize]{leftmargin=1.5em, itemsep=2pt, parsep=0pt}
\\setlist[enumerate]{leftmargin=1.5em, itemsep=2pt, parsep=0pt}

% --- Icons shortcut ---
\\newcommand{\\cmark}{\\ding{51}}
\\newcommand{\\starmark}{\\ding{72}}
\\newcommand{\\hand}{\\ding{43}}
\\newcommand{\\bulb}{\\ding{228}}

% --- Headers & Footers ---
\\usepackage{fancyhdr}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{textgray}\\textit{${escapeLatex(documentTitle)}}}
\\fancyhead[R]{\\small\\color{textgray}\\textit{${escapeLatex(studentName)} --- ${escapeLatex(schoolName)}}}
\\fancyfoot[C]{\\small\\color{textgray}\\thepage}
\\fancyfoot[R]{\\scriptsize\\color{textgray}AEE+ PRO}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\renewcommand{\\footrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\footrulewidth\\hfill}}

% --- Section Formatting ---
\\usepackage{titlesec}
\\titleformat{\\section}
  {\\Large\\bfseries\\color{aeeblue}}
  {\\thesection.}{0.5em}{}
  [\\vspace{-0.5em}{\\color{aeegold}\\rule{\\textwidth}{1.5pt}}]

\\titleformat{\\subsection}
  {\\large\\bfseries\\color{aeeblue!80}}
  {\\thesubsection}{0.5em}{}

\\titleformat{\\subsubsection}
  {\\normalsize\\bfseries\\color{aeeblue!65}}
  {\\thesubsubsection}{0.5em}{}

% --- Boxes ---
\\usepackage[most]{tcolorbox}

\\newtcolorbox{infobox}[1][]{
  colback=aeelightblue,
  colframe=aeeblue,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  shadow={1mm}{-1mm}{0mm}{black!20},
  before skip=10pt, after skip=10pt
}

\\newtcolorbox{alertbox}[1][]{
  colback=aeered!5,
  colframe=aeered!70,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=10pt, after skip=10pt
}

\\newtcolorbox{successbox}[1][]{
  colback=aeegreen!5,
  colframe=aeegreen!70,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=10pt, after skip=10pt
}

\\newtcolorbox{datacard}{
  colback=aeegray,
  colframe=aeeblue!30,
  rounded corners,
  boxrule=0.5pt,
  left=10pt, right=10pt, top=8pt, bottom=8pt,
  before skip=8pt, after skip=8pt
}

\\newtcolorbox{atividadebox}[2][]{
  enhanced,
  colback=#1!5,
  colframe=#1!60,
  coltitle=white,
  fonttitle=\\bfseries,
  title={\\large #2},
  rounded corners,
  boxrule=0.8pt,
  left=10pt, right=10pt, top=8pt, bottom=8pt,
  shadow={1mm}{-1mm}{0mm}{black!15},
  before skip=12pt, after skip=12pt,
  attach boxed title to top left={yshift=-2mm, xshift=5mm},
  boxed title style={rounded corners, colback=#1!60}
}

\\newtcolorbox{dicabox}[1][]{
  enhanced,
  colback=lightyellow,
  colframe=aeegold!70,
  coltitle=aeeblue,
  fonttitle=\\bfseries,
  title={\\bulb~Dica da Prática},
  rounded corners,
  boxrule=0.5pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=8pt, after skip=8pt
}

\\newtcolorbox{materialbox}{
  enhanced,
  colback=aeegray,
  colframe=aeeblue!20,
  rounded corners,
  boxrule=0.4pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=6pt, after skip=6pt
}

\\newtcolorbox{sessaobox}[1][]{
  enhanced,
  colback=white,
  colframe=aeeblue,
  coltitle=white,
  fonttitle=\\bfseries\\large,
  title={#1},
  rounded corners,
  boxrule=1pt,
  left=10pt, right=10pt, top=8pt, bottom=8pt,
  shadow={1.5mm}{-1.5mm}{0mm}{black!10},
  before skip=14pt, after skip=14pt,
  toptitle=3pt, bottomtitle=3pt
}

\\newtcbox{\\objtag}[1][aeeblue]{
  on line, colback=#1!10, colframe=#1!40,
  boxrule=0.4pt, arc=3pt,
  left=3pt, right=3pt, top=1pt, bottom=1pt,
  fontupper=\\scriptsize\\bfseries\\color{#1}
}

% --- Watermark ---
\\usepackage{draftwatermark}
\\SetWatermarkText{CONFIDENCIAL}
\\SetWatermarkScale{0.4}
\\SetWatermarkColor{aeeblue!5}
\\SetWatermarkAngle{45}

% --- Hyperlinks ---
\\usepackage[
  colorlinks=true,
  linkcolor=aeeblue,
  urlcolor=aeeblue!70,
  citecolor=aeeblue
]{hyperref}

% ============================================================================
`;
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[&%$#_{}]/g, (ch) => `\\${ch}`)
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/---/g, "---")
    .replace(/--/g, "--");
}
