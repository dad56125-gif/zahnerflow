export type TextSegment = {
  text: string;
  cjk: boolean;
};

const isCjkChar = (char: string) => /\p{Script=Han}/u.test(char);

export const segmentCjkText = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];

  Array.from(text).forEach((char) => {
    const cjk = isCjkChar(char);
    const last = segments[segments.length - 1];
    if (last && last.cjk === cjk) {
      last.text += char;
      return;
    }
    segments.push({ text: char, cjk });
  });

  return segments;
};

export const hasCjkText = (value: string) => Array.from(value).some(isCjkChar);
