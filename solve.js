// csv-reader-speed: a fast drop-in for csv-reader 1.0.0.
//
// Same answers, same shape ({columns, rows, errors}), same error order —
// only the reading is different. The reference walks the text one
// character at a time and grows every field by appending one character
// after another. This reader instead lets the engine do the searching:
//
//   - a record line with no quote and no stray CR in it is cut in one go:
//     one slice for the line, one split on commas;
//   - an unquoted field is found by locating the next line break, then
//     looking for a comma or a CR inside that one line only, so no search
//     ever runs past the line it belongs to;
//   - a quoted field is found by locating its closing quote, and the text
//     between the quotes is taken in a single slice when it holds no
//     doubled quote and no line break; doubled quotes and line breaks
//     inside quotes are the rare path and are folded in there.
//
// No cache is kept between cases, nothing is random, and the result of
// run() depends only on its input.

// How a field ended: 1 at a comma (the record goes on), 2 at a line
// break (the record ends), 3 at the end of the text (the record ends).
const COMMA = 1;
const LINE_BREAK = 2;
const END = 3;

/** The answer for one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1; // a U+FEFF at the very start is dropped

  // The record being read: the line it starts on and the index in rows
  // it takes (null: the header). Field errors are stamped with these.
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, with `prefix` already in
  // its value ('' normally; '"' when a quote that never closed is being
  // re-read as a literal, or the value of a quoted field whose closing
  // quote was followed by junk). A CR not followed by LF is dropped and
  // reported (stray_cr). Returns the field, how it ended, and how many
  // characters were kept (`added`, not counting the prefix).
  function readUnquoted(prefix) {
    let added = 0;
    let acc = null; // pieces of the value, only when a stray CR splits the field
    for (;;) {
      const nl = text.indexOf('\n', pos);
      const lineEnd = nl === -1 ? len : nl;
      const seg = text.slice(pos, lineEnd);
      const iC = seg.indexOf(',');
      const iR = seg.indexOf('\r');
      if (iC !== -1 && (iR === -1 || iC < iR)) {
        const piece = seg.slice(0, iC);
        added += piece.length;
        pos += iC + 1;
        return { value: acc === null ? prefix + piece : acc.join('') + piece, ended: COMMA, added };
      }
      if (iR !== -1) {
        if (nl !== -1 && iR === seg.length - 1) {
          // A CR right before the LF: one CRLF line break.
          const piece = seg.slice(0, iR);
          added += piece.length;
          pos = lineEnd + 1;
          line += 1;
          return { value: acc === null ? prefix + piece : acc.join('') + piece, ended: LINE_BREAK, added };
        }
        // A CR on its own: dropped, reported, and the field goes on.
        error('stray_cr');
        if (acc === null) acc = [prefix];
        acc.push(seg.slice(0, iR));
        added += iR;
        pos += iR + 1;
        continue;
      }
      // No comma and no CR left on this line: the field runs to the
      // line break, or to the end of the text.
      added += seg.length;
      if (nl === -1) {
        pos = len;
        return { value: acc === null ? prefix + seg : acc.join('') + seg, ended: END, added };
      }
      pos = lineEnd + 1;
      line += 1;
      return { value: acc === null ? prefix + seg : acc.join('') + seg, ended: LINE_BREAK, added };
    }
  }

  // Reads a quoted field whose opening quote is at pos. Runs to the next
  // quote that is not doubled ("" inside it is one quote); each CRLF or
  // lone CR inside it is read as one LF. What follows the closing quote,
  // up to the next comma or line break, is appended as it stands
  // (quote_junk when the field ends, if anything was appended). A quote
  // that never closes is a literal character and the text after it is
  // read again as an unquoted field (unterminated_quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let value = '';
    let extraLines = 0; // line breaks inside the quotes, counted, then committed on close
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the
        // text after it is read again as unquoted. The lines inside the
        // failed quotes do not count, so the line goes back to the line
        // the quote opened on.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text[q + 1] === '"') {
        // A doubled quote: the run up to it, plus one quote, and on.
        value += foldQuotedRun(pos, q);
        value += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote: the run up to it ends the quoted part.
      value += foldQuotedRun(pos, q);
      pos = q + 1;
      break;
    }
    line += extraLines;
    if (pos >= len) return { value, ended: END, added: 0 };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to
    // the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;

    // One run inside quotes, [from, to): a plain slice when it holds no
    // line break, else the same text with every CRLF or lone CR folded
    // to one LF, counting the breaks it holds.
    function foldQuotedRun(from, to) {
      const seg = text.slice(from, to);
      if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) return seg;
      let n = 0;
      const folded = seg.replace(/\r\n|\r|\n/g, () => {
        n += 1;
        return '\n';
      });
      extraLines += n;
      return folded;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields = null;

    // Fast path: the whole record sits on this one line. That holds
    // when the line holds no quote at all (no quoted field can open on
    // it, and none is open at a record start, so no field can run past
    // the line break) and no stray CR (a CRLF at the end of the line
    // is the line break itself, not a stray). Then the fields are one
    // slice split on commas.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const contentEnd = nl !== -1 && lineEnd > pos && text[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd;
    const lineText = text.slice(pos, contentEnd);
    if (lineText.indexOf('"') === -1 && lineText.indexOf('\r') === -1) {
      fields = lineText.split(',');
      pos = nl === -1 ? len : lineEnd + 1;
      if (nl !== -1) line += 1;
    } else {
      // The line holds a quote or a stray CR: read it field by field.
      const list = [];
      let quoted = false;
      let field;
      do {
        quoted = text[pos] === '"';
        field = quoted ? readQuoted() : readUnquoted('');
        list.push(field.value);
      } while (field.ended === COMMA);

      // A line that held only stray CRs is left with no characters:
      // no record (its stray_cr errors stay).
      if (list.length === 1 && list[0] === '' && !quoted) continue;
      fields = list;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
