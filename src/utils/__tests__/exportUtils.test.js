import { describe, it, expect } from 'vitest';
import { csvEscape } from '../exportUtils.js';

// Remarks fields are free text and land straight in a CSV that gets opened in Excel.
describe('csvEscape — CSV formula injection', () => {
  it('neutralises cells that Excel would evaluate as a formula', () => {
    // No comma/quote/newline, so it is prefixed but not wrapped.
    expect(csvEscape('=cmd|\'/c calc\'!A1')).toBe(`'=cmd|'/c calc'!A1`);
    // With a comma it is BOTH prefixed and quoted.
    expect(csvEscape('=SUM(A1,B1)')).toBe(`"'=SUM(A1,B1)"`);
    expect(csvEscape('+1+1')).toBe("'+1+1");
    expect(csvEscape('-2+3')).toBe("'-2+3");
    expect(csvEscape('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves ordinary values alone', () => {
    expect(csvEscape('Suman Devi')).toBe('Suman Devi');
    expect(csvEscape(1500)).toBe('1500');
    expect(csvEscape('₹1,500.00')).toBe('"₹1,500.00"');   // quoted for the comma, not prefixed
  });

  it('quotes and escapes commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('handles null and undefined as empty', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});
