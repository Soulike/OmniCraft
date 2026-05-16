export function getDisplayFileName(filePath: string): string {
  const withoutTrailingSeparators = filePath.replace(/[\\/]+$/, '');
  const fileName = withoutTrailingSeparators.split(/[\\/]/).pop();

  return fileName && fileName.length > 0 ? fileName : filePath;
}
