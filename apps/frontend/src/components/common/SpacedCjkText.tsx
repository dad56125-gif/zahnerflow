import React from 'react';

interface SpacedCjkTextProps {
  text: string;
  className?: string;
}

type TextSegment = {
  text: string;
  cjk: boolean;
};

const isCjkChar = (char: string) => /\p{Script=Han}/u.test(char);

const segmentText = (text: string): TextSegment[] => {
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

export const SpacedCjkText: React.FC<SpacedCjkTextProps> = ({ text, className = 'cjk-spaced' }) => (
  <span className={className} aria-label={text}>
    {segmentText(text).map((segment, segmentIndex) => (
      segment.cjk ? (
        <span className="cjk-spaced__group" aria-hidden="true" key={`${segment.text}-${segmentIndex}`}>
          {Array.from(segment.text).map((char, charIndex) => (
            <span key={`${char}-${segmentIndex}-${charIndex}`}>{char}</span>
          ))}
        </span>
      ) : (
        <span className="cjk-spaced__plain" aria-hidden="true" key={`${segment.text}-${segmentIndex}`}>
          {segment.text}
        </span>
      )
    ))}
  </span>
);

export const renderCjkText = (value: React.ReactNode): React.ReactNode => {
  if (typeof value === 'string' && hasCjkText(value)) {
    return <SpacedCjkText text={value} />;
  }
  return value;
};
