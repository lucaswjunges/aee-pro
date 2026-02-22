interface PreambleOptions {
  documentTitle: string;
  studentName: string;
  schoolName: string;
  printMode?: "color" | "bw";
}

const BW_COLOR_OVERRIDES = `
% --- B&W Mode: Override all colors to grayscale ---
\\definecolor{aeeblue}{gray}{0.20}
\\definecolor{aeegold}{gray}{0.45}
\\definecolor{aeelightblue}{gray}{0.93}
\\definecolor{aeegreen}{gray}{0.30}
\\definecolor{aeered}{gray}{0.25}
\\definecolor{aeeorange}{gray}{0.35}
\\definecolor{aeepurple}{gray}{0.28}
\\definecolor{aeeteal}{gray}{0.30}
\\definecolor{aeegray}{gray}{0.95}
\\definecolor{textgray}{gray}{0.35}
\\definecolor{lightgreen}{gray}{0.93}
\\definecolor{lightorange}{gray}{0.95}
\\definecolor{lightpurple}{gray}{0.94}
\\definecolor{lightteal}{gray}{0.93}
\\definecolor{lightred}{gray}{0.94}
\\definecolor{lightyellow}{gray}{0.96}
`;

export function getLatexPreamble(options: PreambleOptions): string {
  const { documentTitle, studentName, schoolName, printMode } = options;

  return `% ============================================================================
% ${documentTitle} - Atendimento Educacional Especializado (AEE)
% Atendimento Educacional Especializado
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

% --- Overflow prevention ---
\\tolerance=2000
\\emergencystretch=5em
\\hbadness=3000

% --- Prevent orphan headings / widows / clubs ---
% High penalties prevent a section heading from being the last thing on a page
\\widowpenalty=10000
\\clubpenalty=10000
\\makeatletter
\\@beginparpenalty=10000
\\makeatother

% --- Page Layout ---
\\usepackage[
  top=2.5cm,
  bottom=2.5cm,
  left=2.5cm,
  right=2.5cm,
  headheight=36pt
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
${printMode === "bw" ? BW_COLOR_OVERRIDES : ""}
% --- Math symbols ---
\\usepackage{amssymb}
\\usepackage{amsmath}

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

% --- Prevent orphan headings (section title alone at bottom of page) ---
\\usepackage{needspace}

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
\\usepackage[fit]{truncate}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small\\color{textgray}\\textit{\\truncate{0.45\\headwidth}{${escapeLatex(documentTitle)}}}}
\\fancyhead[R]{\\small\\color{textgray}\\textit{\\truncate{0.45\\headwidth}{${escapeLatex(studentName)} --- ${escapeLatex(schoolName)}}}}
\\fancyfoot[C]{\\small\\color{textgray}\\thepage}
\\fancyfoot[R]{}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.2pt}
\\renewcommand{\\headrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\headrulewidth\\hfill}}
\\renewcommand{\\footrule}{\\hbox to\\headwidth{\\color{aeegold}\\leaders\\hrule height \\footrulewidth\\hfill}}

% --- Section Formatting ---
\\usepackage{titlesec}
\\titleformat{\\section}
  {\\needspace{5\\baselineskip}\\Large\\bfseries\\color{aeeblue}}
  {\\thesection.}{0.5em}{}
  [\\vspace{-0.5em}{\\color{aeegold}\\rule{\\textwidth}{1.5pt}}]

\\titleformat{\\subsection}
  {\\needspace{4\\baselineskip}\\large\\bfseries\\color{aeeblue!80}}
  {\\thesubsection}{0.5em}{}

\\titleformat{\\subsubsection}
  {\\needspace{3\\baselineskip}\\normalsize\\bfseries\\color{aeeblue!65}}
  {\\thesubsubsection}{0.5em}{}

% --- Boxes ---
\\usepackage[most]{tcolorbox}

\\newtcolorbox{infobox}[1][]{
  enhanced, breakable,
  colback=aeelightblue,
  colframe=aeeblue,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  shadow={1mm}{-1mm}{0mm}{black!20},
  before skip=10pt, after skip=10pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{alertbox}[1][]{
  enhanced, breakable,
  colback=aeered!5,
  colframe=aeered!70,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=10pt, after skip=10pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{successbox}[1][]{
  enhanced, breakable,
  colback=aeegreen!5,
  colframe=aeegreen!70,
  coltitle=white,
  fonttitle=\\bfseries,
  title=#1,
  rounded corners,
  boxrule=0.8pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=10pt, after skip=10pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{datacard}{
  enhanced, breakable,
  colback=aeegray,
  colframe=aeeblue!30,
  rounded corners,
  boxrule=0.5pt,
  left=10pt, right=10pt, top=8pt, bottom=8pt,
  before skip=8pt, after skip=8pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{atividadebox}[2][]{
  enhanced, breakable,
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
  boxed title style={rounded corners, colback=#1!60},
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{dicabox}[1][]{
  enhanced, breakable,
  colback=lightyellow,
  colframe=aeegold!70,
  coltitle=aeeblue,
  fonttitle=\\bfseries,
  title={\\bulb~Dica da Prática},
  rounded corners,
  boxrule=0.5pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=8pt, after skip=8pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{materialbox}{
  enhanced, breakable,
  colback=aeegray,
  colframe=aeeblue!20,
  rounded corners,
  boxrule=0.4pt,
  left=8pt, right=8pt, top=6pt, bottom=6pt,
  before skip=6pt, after skip=6pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
}

\\newtcolorbox{sessaobox}[1][]{
  enhanced, breakable,
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
  toptitle=3pt, bottomtitle=3pt,
  before upper app={\\tolerance=9999\\emergencystretch=3em}
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

% --- URL breaking (must load before hyperref) ---
\\usepackage[hyphens]{url}
\\usepackage{xurl}

% --- Hyperlinks ---
\\usepackage[
  colorlinks=${printMode === "bw" ? "false" : "true"},
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
