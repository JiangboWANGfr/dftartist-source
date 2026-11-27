// Hand-calculated literals, not a copy of any implementation/conversion routine.
export const mixedText = "ab\t中😀e\u0301\r\nZ\rQ\n";
// [UTF-8 byte offset, line, byte-column, UTF-16 offset, UTF-16 column].
export const mixedBoundaries = [
  [0, 1, 1, 0, 1],
  [1, 1, 2, 1, 2],
  [2, 1, 3, 2, 3],
  [3, 1, 4, 3, 4],
  [6, 1, 7, 4, 5],
  [10, 1, 11, 6, 7],
  [11, 1, 12, 7, 8],
  [13, 1, 14, 8, 9],
  [15, 2, 1, 10, 1],
  [16, 2, 2, 11, 2],
  [17, 3, 1, 12, 1],
  [18, 3, 2, 13, 2],
  [19, 4, 1, 14, 1],
];
export const bomText = "\uFEFF中😀\r\n";
export const bomBoundaries = [
  [0, 1, 1, 0, 1],
  [3, 1, 4, 1, 2],
  [6, 1, 7, 2, 3],
  [10, 1, 11, 4, 5],
  [12, 2, 1, 6, 1],
];
export const sourcePoint = ([offset, line, column]) => ({
  offset,
  line,
  column,
});
export const displayPoint = ([, line, , offset, column]) => ({
  offset,
  line,
  column,
});
