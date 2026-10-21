# Welcome to Plainpage

This is a scratch page — click anywhere and start typing. Nothing here is
saved until you choose to: *File ▸ Save* (`⌘S`) turns it into a real file.

A few things to try:

- `⌘E` shows the finished page. Double-click anywhere on it to come back here.
- `⌘O` opens a markdown file. `⌘T` starts a new tab.
- `⌘K` searches every command.
- The full guide is one keystroke away: `⇧⌘/`.

---

# A tour of markdown

Markdown is plain text with a few symbols that mean "format this." Below
is one of everything you'll commonly see. Click into any line to see the
symbols behind it, then change things and watch what happens — this page
is yours to mess up.

## Headings

A line that starts with `#` is a heading. More `#`s make it smaller:
`#` is the page title, `##` a section, `###` a subsection.

### Try it

Put your cursor at the start of this line and type `## ` (two hashes and a space).

## Emphasis

Wrap words to style them: **bold** with two asterisks, *italic* with one,
~~strikethrough~~ with two tildes, and `code` with backticks.

**Try it:** select a word in this sentence and press `⌘B` for bold, `⌘I`
for italic. Press it again to undo the style.

## Links

A link is [the text you see](https://example.com) in square brackets,
followed by the address in parentheses. `⌘`-click a link to open it in
your browser.

**Try it:** copy a web address, select some words in this line, and paste.
The words become a link.

## Lists

Start a line with `-` for bullets:

- Milk
- Eggs
  - Indent with two spaces for a sub-item
- Bread

Start with a number for steps:

1. Open the file
2. Make the change
3. Save it

**Try it:** put your cursor at the end of "Bread" and press `Enter` — the
next bullet appears on its own. Press `Enter` on an empty bullet to stop.

## Checklists

- [x] Install Plainpage
- [ ] Read this page
- [ ] Write something of your own

**Try it:** click a box to check or uncheck it. In the file it's just
`[ ]` and `[x]`.

## Quotes

> A line starting with `>` becomes a quote — handy for pasting what
> someone else wrote, or an AI's answer you want to keep.

## Code

Short code goes inline with backticks: `print("hello")`. Longer code,
prompts, or output go between two lines of three backticks. Name the
language after the first three to get colors:

```python
def greet(name):
    return f"Hello, {name}!"
```

```text
You are a helpful tutor. Explain recursion to a first-year student
using one short example, then ask me a question to check my understanding.
```

**Try it:** press `⌘E` to see the finished page — each code block gets a
copy button in its corner, so a prompt is one click from your clipboard.

## Tables

Tables are rows of cells separated by `|` pipes. Plainpage shows them as
a grid you can edit directly:

| Topic       | Status      | Notes                  |
| ----------- | ----------- | ---------------------- |
| Prompts     | Done        | Shorter is better      |
| Evaluation  | In progress | Need more test cases   |

**Try it:** click a cell and type. `Tab` moves to the next cell, `Enter`
moves down (and adds a row at the bottom), `⇧Enter` puts a line break
inside a cell. The pipes in the file stay lined up for you.

## Images

Paste a screenshot, or drag a picture onto the page. Plainpage copies it
into an `assets` folder next to your document and writes the link for you:
`![a description](assets/screenshot.png)`. (Save the document first, so
there's a folder for the image to go in.)

## Dividers

Three dashes on their own line draw a line across the page — like the one
above "A tour of markdown."

---

## Saving your work

- `⌘S` saves. The first time, you choose a name and a folder; use `.md`
  at the end of the name.
- After that, **autosave** keeps the file up to date as you type.
- *File ▸ Browse Versions…* shows earlier versions of a saved document
  and lets you go back to one.
- Closing the app never loses anything: open documents, even unsaved
  ones, are waiting when you come back.

When you're ready, delete everything on this page and make it your own —
or press `⌘T` for a fresh tab.
