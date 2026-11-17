// Questionnaire template + the AI prompt that makes Claude (or any AI) write quizzes in that format.

export const TEMPLATE_EXAMPLE = `TEST I. MULTIPLE CHOICE

1. What does CPU stand for?
A. Central Processing Unit
B. Computer Personal Unit
C. Central Program Utility
D. Control Processing Unit
ANSWER: A

2. Which of the following is an input device?
A. Monitor
B. Printer
C. Keyboard
D. Speaker
ANSWER: C
POINTS: 2
TIME: 45 sec

TEST II. TRUE OR FALSE

3. RAM keeps its data even when the computer is turned off.
ANSWER: False

TEST III. IDENTIFICATION

4. He is known as the "Father of the Computer".
ANSWER: Charles Babbage | Babbage`;

export const TEMPLATE_TEXT = `# ==============================================================
#  QUIZ NI DETHER - QUESTIONNAIRE TEMPLATE
#  Save as .txt (or .docx) and upload it in: Questions > Import.
#  Lines starting with # are ignored.
# ==============================================================
#
#  RULES
#  * Every question starts with a number:          1. Question text
#  * Multiple choice: each choice starts with a letter (A to H):
#                                                   A. Choice text
#  * Every question needs an answer line:           ANSWER: ...
#      - Multiple choice -> the letter              ANSWER: B
#      - True or False   -> True or False           ANSWER: False
#      - Identification  -> the answer. Separate other accepted
#                           answers with |          ANSWER: RAM | Random Access Memory
#  * Optional:  POINTS: 2        (default is 1 point)
#  * Optional:  TIME: 45 sec     (this question's own timer: 30 sec, 1 min, 1:30)
#               Without it, the question uses the quiz's time per question.
#  * Optional:  TYPE: Multiple Choice / True or False / Identification
#               (normally detected automatically)
#  * Optional:  FIGURE:  then an SVG drawing on the next lines,
#               from <svg ...> to </svg>. Students see it under
#               the question (graphs, shapes, diagrams, charts).
#               Pictures inside a Word (.docx) file are added
#               automatically, or add them later with Edit.
#  * Group questions with headings like:            TEST II. TRUE OR FALSE
#  * Instead of ANSWER lines you may put an answer key at the very end:
#        ANSWER KEY
#        1. B
#        2. True
#        3. Charles Babbage | Babbage
# ==============================================================

${TEMPLATE_EXAMPLE}
`;

export const FIGURE_EXAMPLE = `5. What is the area of the rectangle shown?
FIGURE:
<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="16">
  <rect width="320" height="200" fill="#ffffff"/>
  <rect x="60" y="40" width="200" height="100" fill="#dbeafe" stroke="#1e3a8a" stroke-width="3"/>
  <text x="160" y="170" text-anchor="middle" fill="#111827">8 cm</text>
  <text x="285" y="95" text-anchor="middle" fill="#111827">4 cm</text>
</svg>
A. 12 square cm
B. 24 square cm
C. 32 square cm
D. 64 square cm
ANSWER: C`;

const FIGURE_RULES = `
FIGURES (pictures for the students):
- Add a figure under questions that are better with a visual: graphs, charts, geometric shapes, number lines, diagrams, maps, circuits, tables of data, labeled parts, etc. Aim for about 1 in every 4 questions, only where it truly helps. Never put the answer itself in the figure unless the question asks the student to read it.
- Write the figure right under the question line: a line "FIGURE:" then the drawing as SVG code from <svg ...> to </svg>.
- SVG rules: always include viewBox and xmlns="http://www.w3.org/2000/svg"; size about 400 x 250; white background rect; dark text (#111827) at font-size 14 or more; clear thick lines; simple flat colors.
- Use only basic shapes: rect, circle, ellipse, line, polyline, polygon, path, text, g, marker. NO <image>, NO links, NO scripts, NO foreignObject, NO outside fonts or files.
- Every label must be readable and must not overlap other labels or lines. Make sure the drawing matches the question and the answer exactly (correct values, angles, proportions).
- Questions that need the figure should say so, e.g. "Based on the figure, ...".`;

export function buildPrompt({ topic, items, types, level, figures }) {
  const names = { mcq: 'Multiple Choice', tf: 'True or False', text: 'Identification' };
  const chosen = Object.keys(names).filter((k) => types[k]);
  const mix = chosen.length ? chosen.map((k) => names[k]).join(', ') : 'Multiple Choice';
  return `Make a quiz about "${topic || 'Introduction to Computing'}" with ${items || 30} items${level ? ` for ${level}` : ''}.
Question types to use: ${mix}${chosen.length > 1 ? ' (group them by type)' : ''}.${figures ? '\nInclude figures (SVG drawings) for the questions that need a visual — see FIGURES below.' : ''}

Write it in EXACTLY this plain-text format so I can upload it to my quiz system:
- Number the questions continuously: 1., 2., 3., ... (do NOT restart numbering for each test).
- Multiple Choice: 4 choices on separate lines labeled A. B. C. D., then a line "ANSWER: <letter>".
- True or False: the statement, then "ANSWER: True" or "ANSWER: False".
- Identification: the question, then "ANSWER: <answer>". If more than one answer is acceptable, separate them with " | ".
- Add "POINTS: <number>" under a question only if it is worth more than 1 point.
- Add "TIME: <seconds> sec" under a question only if it needs more (or less) time than the others.
- You may group questions with headings like "TEST I. MULTIPLE CHOICE".
- Leave a blank line between questions. No bold text, no tables, no bullet symbols, no explanations.
- Every question must have exactly one correct answer, and every answer must be accurate.
- Put the whole quiz inside ONE code block.
${figures ? FIGURE_RULES + '\n' : ''}
Follow this example format:

${TEMPLATE_EXAMPLE}${figures ? `\n\nExample of a question with a figure:\n\n${FIGURE_EXAMPLE}` : ''}`;
}
