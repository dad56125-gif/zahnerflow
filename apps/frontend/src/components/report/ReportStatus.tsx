import { UiIconSvg } from '../shared/UiIconSvg';
import { STATUS_ICON_NAMES } from './types';
import { getReportStatusText } from './reportPresentation';
export function StatusLabel({ status }: { status: string }) {
  const iconName = STATUS_ICON_NAMES[status];

  return (
    <>
      {iconName && <UiIconSvg name={iconName} />}
      <span className="report__status-text">{getReportStatusText(status)}</span>
    </>
  );
}
