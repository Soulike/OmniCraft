import {imageSize} from 'image-size';

/** Product-level image boundary chosen to fit the strictest request mode of
 * every supported provider. The limit applies independently to each edge. */
const MAX_IMAGE_DIMENSION_PIXELS = 2000;

type ImageDimensionCheck = 'within-limit' | 'too-large' | 'invalid';

/** Reads an image header and classifies its dimensions without decoding the
 * pixels. The caller has already sniffed the bytes as a supported image type;
 * `invalid` covers a truncated or otherwise unreadable image header. */
export function checkImageDimensions(bytes: Uint8Array): ImageDimensionCheck {
  try {
    const {width, height} = imageSize(bytes);
    return width > MAX_IMAGE_DIMENSION_PIXELS ||
      height > MAX_IMAGE_DIMENSION_PIXELS
      ? 'too-large'
      : 'within-limit';
  } catch {
    return 'invalid';
  }
}
