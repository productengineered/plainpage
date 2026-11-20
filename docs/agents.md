# Plainpage: a guide for AI agents

Plainpage is a markdown editor. Its documents are ordinary `.md` files, and
whatever you write into one is exactly what the reviewer reads: there is no
hidden format and nothing is converted. The reviewer usually reads a
document in Plainpage's preview, the finished page, and answers or ticks
things off right there. The conventions below make that work. Each one is
plain markdown that reads fine in any other editor too.

The examples use `BD` as the reviewer's initials. Use the reviewer's own.

## Plain markdown

- Write GitHub-flavored markdown: headings, lists, emphasis, links, tables,
  task lists, footnotes, and fenced code blocks with a language.
- Raw HTML is dropped from the page. The one exception is `<br>` inside a
  table cell, the only way to break a line there.
- Diagram languages such as Mermaid show as code, not as a picture.
- Every code block gets a copy button in preview, so put anything the
  reviewer should paste somewhere (a command, a prompt) in a fenced block.

## Response rows

When you want the reviewer's answer to something, add a response row: a
two-column table with a header row and a delimiter row only. The first
header cell is a label that ends in `response:` (any case). The second
header cell is left empty.

```markdown
| BD RESPONSE: | |
| ------------ | --- |
```

Rules:

- Exactly two columns, and the first cell must end with `response:`.
  Anything else is an ordinary table.
- Leave the second cell empty. That's where the reviewer types.
- Add no body rows.
- Put a blank line before and after the table.
- Place it right after the question or item it answers, one row per
  question, so each answer stays tied to its question.
- Don't pad the label: Plainpage keeps the label column only as wide as
  its text and gives the answer the rest of the page.

The reviewer clicks the empty cell in preview and types; Enter or Escape
finishes. The answer is saved into the file as the second header cell:

```markdown
| BD RESPONSE: | Agreed, but cut the second example. |
| ------------ | ----------------------------------- |
```

Reading answers back:

- The answer is the text in the second cell of the header row.
- `<br>` in the cell is a line break the reviewer typed.
- `\|` is a literal pipe character.
- An empty cell means no answer yet.

## Copy sections

When you write text the reviewer will paste somewhere else (a grading box,
an email, a document), wrap it in a copy section: `<!-- copy -->` on its
own line before the text and `<!-- /copy -->` on its own line after it.

```markdown
<!-- copy -->
- **Strength:** the affinity map makes the four themes easy to follow.
- **Next step:** rewrite the problem statement around what participants
  *need*, not the feature you have in mind.
<!-- /copy -->
```

In preview the section sits in a light frame with a copy button. One click
copies just that text with its formatting (bullets, bold, links), ready to
paste. The markers are HTML comments, so other apps hide them.

Rules:

- Each marker on a line by itself, with a blank line before the opening
  marker and after the closing one.
- Sections don't nest. An unclosed section runs to the end of the list
  item, quote, or document it's in.
- Inside a list item, indent both markers to the item's text.
- Write only what should be pasted inside the section. Keep your notes to
  the reviewer outside it.

## Task lists

Use task-list items for things the reviewer should do or confirm:

```markdown
- [ ] Post the grade
- [x] Read the submission
```

The reviewer ticks a box with a click, in preview or in the editor, and
Plainpage writes the `x` into the file. When you read the file back,
`[x]` (or `[X]`) is done and `[ ]` is not.

## Reading the reviewer's edits

The file on disk is always the truth. Re-read it before you act on the
reviewer's answers, and leave their answers and ticked boxes as they are
when you update the document.
