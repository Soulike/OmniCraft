import 'diff2html/bundles/css/diff2html.min.css';

import {html} from 'diff2html';
import {ColorSchemeType} from 'diff2html/lib/types';
import {useMemo} from 'react';

import {useTheme} from '@/hooks/useTheme.js';

import {EditFileResultView} from './EditFileResultView.js';

interface EditFileResultProps {
  filePath: string;
  matchCount: number;
  diff: string;
  truncated: boolean;
}

export function EditFileResult({
  filePath,
  matchCount,
  diff,
  truncated,
}: EditFileResultProps) {
  const {resolvedTheme} = useTheme();

  const diffHtml = useMemo(
    () =>
      html(diff, {
        drawFileList: false,
        outputFormat: 'line-by-line',
        matching: 'lines',
        colorScheme:
          resolvedTheme === 'dark'
            ? ColorSchemeType.DARK
            : ColorSchemeType.LIGHT,
      }),
    [diff, resolvedTheme],
  );

  return (
    <EditFileResultView
      diffHtml={diffHtml}
      filePath={filePath}
      matchCount={matchCount}
      truncated={truncated}
    />
  );
}
