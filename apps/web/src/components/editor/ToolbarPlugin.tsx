import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $patchStyleText } from '@lexical/selection';
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

import { ColorPickerPopover } from '../ColourPicker';

const DEFAULT_FONT_COLOR = '#FFFFFFFF';
const DEFAULT_BG_COLOR = '#333333FF';

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
        }
    }, []);

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
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $patchStyleText(selection, { [property]: value });
            }
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
