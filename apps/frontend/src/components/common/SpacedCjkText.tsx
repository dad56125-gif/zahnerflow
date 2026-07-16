import React from 'react';
import { hasCjkText, segmentCjkText } from './cjkText';

interface SpacedCjkTextProps {
  text: string;
  className?: string;
}

export const SpacedCjkText: React.FC<SpacedCjkTextProps> = ({ text, className = 'cjk-spaced' }) => (
  <span className={className} aria-label={text}>
    {segmentCjkText(text).map((segment, segmentIndex) => (
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

export const CjkText: React.FC<{ value: React.ReactNode }> = ({ value }) => {
  if (typeof value === 'string' && hasCjkText(value)) {
    return <SpacedCjkText text={value} />;
  }
  return <>{value}</>;
};
