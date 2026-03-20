import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelectionStyleValueForProperty, $patchStyleText } from '@lexical/selection';
import { mergeRegister } from '@lexical/utils';
import {
    ArrowClockwiseIcon,
    ArrowCounterClockwiseIcon,
    HighlighterIcon,
    TextAlignCenterIcon,
    TextAlignJustifyIcon,
    TextAlignLeftIcon,
    TextAlignRightIcon,
    TextAUnderlineIcon,
    TextBIcon,
    TextItalicIcon,
    TextStrikethroughIcon,
    TextUnderlineIcon
} from '@phosphor-icons/react';
import { Separator } from '@repo/ui/components/separator';
import { SymmetricSlider } from '@repo/ui/components/symmetric-slider';
import { TipButton } from '@repo/ui/components/tip-button';
import {
    $getSelection,
    $isRangeSelection,
    CAN_REDO_COMMAND,
    CAN_UNDO_COMMAND,
    COMMAND_PRIORITY_LOW,
    FORMAT_ELEMENT_COMMAND,
    FORMAT_TEXT_COMMAND,
    REDO_COMMAND,
    SELECTION_CHANGE_COMMAND,
    UNDO_COMMAND
} from 'lexical';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useEditorStore } from '~/lib/editorStore';
import { emToVirtualPx, TEXT_BASE_FONT_SIZE_PX, virtualPxToEm } from '~/lib/textRenderConfig';

import { ColorPickerPopover } from '../ColourPicker';

const DEFAULT_FONT_COLOR = '#FFFFFFFF';
const DEFAULT_BG_COLOR = '#333333FF';
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 1000;

function clampFontSize(px: number): number {
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, px));
}

function parseFontSizeToEm(fontSizeRaw: string): number | null {
    const value = fontSizeRaw.trim().toLowerCase();
    if (!value) return null;
    if (value.endsWith('em')) {
        const em = Number.parseFloat(value.slice(0, -2));
        return Number.isFinite(em) && em > 0 ? em : null;
    }
    if (value.endsWith('px')) {
        const px = Number.parseFloat(value.slice(0, -2));
        return Number.isFinite(px) && px > 0 ? px / TEXT_BASE_FONT_SIZE_PX : null;
    }
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric / TEXT_BASE_FONT_SIZE_PX : null;
}

export default function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext();
    const toolbarRef = useRef(null);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [color, setColor] = useState(DEFAULT_FONT_COLOR);
    const [bgColor, setBgColor] = useState(DEFAULT_BG_COLOR);
    const [fontSizePx, setFontSizePx] = useState(TEXT_BASE_FONT_SIZE_PX);
    const [fontSizeInput, setFontSizeInput] = useState(String(TEXT_BASE_FONT_SIZE_PX));
    const [fontSizeMixed, setFontSizeMixed] = useState(false);
    const [isFontSizeInteracting, setIsFontSizeInteracting] = useState(false);
    const activeScaleX = useEditorStore((s) => {
        const id = s.editingTextLayerId;
        if (!id) return 1;
        const layer = s.layers.get(id);
        if (!layer || layer.type !== 'text') return 1;
        return layer.config.scaleX || 1;
    });
    const activeScaleY = useEditorStore((s) => {
        const id = s.editingTextLayerId;
        if (!id) return 1;
        const layer = s.layers.get(id);
        if (!layer || layer.type !== 'text') return 1;
        return layer.config.scaleY || 1;
    });

    const $updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            // Update text format
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));

            let _color = DEFAULT_FONT_COLOR;
            let _bgColor = DEFAULT_BG_COLOR;
            selection.style.split(';').forEach((styleString) => {
                const styleBox = styleString.split(':');
                const style = styleBox[0]?.trim();
                const value = styleBox[1]?.trim();
                if (style === 'color' && value.length) _color = value;
                if (style === 'background-color' && value.length) _bgColor = value;
            });
            setColor(_color);
            setBgColor(_bgColor);

            if (!isFontSizeInteracting) {
                const fontSizeValue = $getSelectionStyleValueForProperty(
                    selection,
                    'font-size',
                    ''
                );
                const parsedEm = parseFontSizeToEm(fontSizeValue);
                const effectivePx = clampFontSize(
                    Math.round(emToVirtualPx(parsedEm ?? 1, activeScaleX, activeScaleY))
                );
                setFontSizePx(effectivePx);
                setFontSizeInput(String(effectivePx));
                setFontSizeMixed(!selection.isCollapsed() && !fontSizeValue);
            }
        }
    }, [activeScaleX, activeScaleY, isFontSizeInteracting]);

    useEffect(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => {
                    $updateToolbar();
                });
            }),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                (_payload, _newEditor) => {
                    $updateToolbar();
                    return false;
                },
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                CAN_UNDO_COMMAND,
                (payload) => {
                    setCanUndo(payload);
                    return false;
                },
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                CAN_REDO_COMMAND,
                (payload) => {
                    setCanRedo(payload);
                    return false;
                },
                COMMAND_PRIORITY_LOW
            )
        );
    }, [editor, $updateToolbar]);

    const applyStyle = (property: string, value: string) => {
        editor.focus(() => {
            editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    $patchStyleText(selection, { [property]: value });
                }
            });
        });
    };

    const applyColor = (color: string) => {
        applyStyle('color', color);
        setColor(color);
    };

    const applyBgColor = (color: string) => {
        applyStyle('background-color', color);
        setBgColor(color);
    };

    const applyFontSizePx = (nextPx: number) => {
        const clampedPx = clampFontSize(Math.round(nextPx));
        const em = virtualPxToEm(clampedPx, activeScaleX, activeScaleY);
        applyStyle('font-size', `${Math.max(0.01, em).toFixed(4)}em`);
        setFontSizePx(clampedPx);
        setFontSizeInput(String(clampedPx));
        setFontSizeMixed(false);
    };

    // const applyFontFamily = (family: string) => {
    //     applyStyle('font-family', family);
    // };

    // const applyFontSize = (size: string) => {
    //     applyStyle('font-size', `${size}px`);
    // };

    return (
        <div
            className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-1"
            ref={toolbarRef}
        >
            <TipButton
                tip="Undo"
                disabled={!canUndo}
                onClick={() => {
                    editor.dispatchCommand(UNDO_COMMAND, undefined);
                }}
                className="toolbar-item spaced"
                aria-label="Undo"
            >
                <ArrowCounterClockwiseIcon size={32} />
            </TipButton>
            <TipButton
                tip="Redo"
                disabled={!canRedo}
                onClick={() => {
                    editor.dispatchCommand(REDO_COMMAND, undefined);
                }}
                className="toolbar-item"
                aria-label="Redo"
            >
                <ArrowClockwiseIcon size={32} />
            </TipButton>
            <Separator orientation="vertical" className="mx-1 my-1 h-6" />
            <TipButton
                tip="Bold"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
                }}
                className={'toolbar-item spaced ' + (isBold ? 'active' : '')}
                aria-label="Format Bold"
            >
                <TextBIcon size={32} />
            </TipButton>
            <TipButton
                tip="Italic"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
                }}
                className={'toolbar-item spaced ' + (isItalic ? 'active' : '')}
                aria-label="Format Italics"
            >
                <TextItalicIcon size={32} />
            </TipButton>
            <TipButton
                tip="Underline"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
                }}
                className={'toolbar-item spaced ' + (isUnderline ? 'active' : '')}
                aria-label="Format Underline"
            >
                <TextUnderlineIcon size={32} />
            </TipButton>
            <TipButton
                tip="Strikethrough"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
                }}
                className={'toolbar-item spaced ' + (isStrikethrough ? 'active' : '')}
                aria-label="Format Strikethrough"
            >
                <TextStrikethroughIcon size={32} />
            </TipButton>
            <Separator orientation="vertical" className="mx-1 my-1 h-6" />
            <TipButton
                tip="Left Align"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
                }}
                className="toolbar-item spaced"
                aria-label="Left Align"
            >
                <TextAlignLeftIcon size={32} />
            </TipButton>
            <TipButton
                tip="Center Align"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
                }}
                className="toolbar-item spaced"
                aria-label="Center Align"
            >
                <TextAlignCenterIcon size={32} />
            </TipButton>
            <TipButton
                tip="Right Align"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
                }}
                className="toolbar-item spaced"
                aria-label="Right Align"
            >
                <TextAlignRightIcon size={32} />
            </TipButton>
            <TipButton
                tip="Justify Align"
                onClick={() => {
                    editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify');
                }}
                className="toolbar-item"
                aria-label="Justify Align"
            >
                <TextAlignJustifyIcon size={32} />
            </TipButton>
            <Separator orientation="vertical" className="mx-1 my-1 h-6" />
            <ColorPickerPopover
                tip="Text Colour"
                variant={'ghost'}
                value={color}
                onChange={applyColor}
            >
                <TextAUnderlineIcon size={32} style={{ color }} weight="fill" />
            </ColorPickerPopover>
            <ColorPickerPopover
                tip="Background Colour"
                variant={'ghost'}
                value={bgColor}
                onChange={applyBgColor}
            >
                <HighlighterIcon size={32} style={{ color: bgColor }} weight="fill" />
            </ColorPickerPopover>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <div className="flex min-w-56 items-center gap-2 px-1">
                <span className="text-xs text-muted-foreground">Size</span>
                <input
                    type="number"
                    min={FONT_SIZE_MIN}
                    max={FONT_SIZE_MAX}
                    value={fontSizeMixed ? '' : fontSizeInput}
                    placeholder={fontSizeMixed ? 'Mixed' : undefined}
                    className="h-7 w-18 rounded border border-border bg-background px-2 text-xs"
                    onChange={(e) => {
                        setFontSizeMixed(false);
                        setFontSizeInput(e.target.value);
                    }}
                    onBlur={() => {
                        const parsed = Number.parseFloat(fontSizeInput);
                        if (Number.isFinite(parsed)) applyFontSizePx(parsed);
                        else setFontSizeInput(String(fontSizePx));
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const parsed = Number.parseFloat(fontSizeInput);
                            if (Number.isFinite(parsed)) applyFontSizePx(parsed);
                        }
                    }}
                    aria-label="Font Size (virtual px)"
                />
                <div
                    className="w-28"
                    onPointerDownCapture={() => {
                        editor.focus();
                    }}
                >
                    <SymmetricSlider
                        value={fontSizePx}
                        min={FONT_SIZE_MIN}
                        max={FONT_SIZE_MAX}
                        step={1}
                        onValueChange={applyFontSizePx}
                        onInteractionChange={setIsFontSizeInteracting}
                    />
                </div>
            </div>

            {/* Add missing font select box here */}

            {/* <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Font</span>
                <select
                    className="h-7 max-w-32 rounded border border-border bg-background px-1.5 text-xs"
                    onChange={(e) => applyFontFamily(e.target.value)}
                >
                    {SYSTEM_FONTS.map((f) => (
                        <option key={f} value={f}>
                            {f}
                        </option>
                    ))}
                    {projectFonts.length > 0 && (
                        <optgroup label="Project Fonts">
                            {projectFonts.map((f) => (
                                <option key={f.family} value={f.family}>
                                    {f.family}
                                </option>
                            ))}
                        </optgroup>
                    )}
                </select>
            </div> */}
        </div>
    );
}
