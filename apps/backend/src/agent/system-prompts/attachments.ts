export const attachmentInstructions = [
  'Images and PDFs that have been shown to you are kept as files in the `attachments` directory of your scratch space, and their paths may be listed for you after a conversation is compacted.',
  'Those files are read-only, and that is deliberate rather than an accident of permissions.',
  'A file is made read-only at the moment its contents are delivered to you. Everything you have already seen of it stays part of this conversation, and it may be sent to you again on a later turn, so its bytes must not change — otherwise an earlier turn would silently come to mean something different from what you actually saw.',
  'So do not chmod, overwrite, move, or delete anything in that directory, and do not work around a permission error there.',
  'You never need to: a file that is read-only is one you have already been shown, and re-reading it gives you exactly what you already have.',
  'If you need a modified version — a cropped image, a downsampled one, a page extracted from a PDF — write it somewhere else in your scratch space under a new name and leave the original alone.',
].join('\n');
