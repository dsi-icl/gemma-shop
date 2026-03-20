export const TEXT_BASE_FONT_SIZE_PX = 48;
export const TEXT_BASE_LINE_HEIGHT = 1.3;
export const TEXT_BASE_PADDING_PX = 16;
export const TEXT_BASE_FONT_FAMILY = 'sans-serif';

export const TEXT_BASE_STYLE = {
    color: 'white',
    fontFamily: TEXT_BASE_FONT_FAMILY,
    fontSize: `${TEXT_BASE_FONT_SIZE_PX}px`,
    lineHeight: String(TEXT_BASE_LINE_HEIGHT),
    padding: `${TEXT_BASE_PADDING_PX}px`,
    boxSizing: 'border-box' as const
};
