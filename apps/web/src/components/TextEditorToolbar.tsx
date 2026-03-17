'use client';

import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { $createHeadingNode, type HeadingTagType } from '@lexical/rich-text';
import { $patchStyleText, $setBlocksType } from '@lexical/selection';
import {
    ListBulletsIcon,
    ListNumbersIcon,
    TextAlignCenterIcon,
    TextAlignJustifyIcon,
    TextAlignLeftIcon,
    TextAlignRightIcon,
    TextBIcon,
    TextHFourIcon,
    TextHOneIcon,
    TextHThreeIcon,
    TextHTwoIcon,
    TextItalicIcon,
    TextStrikethroughIcon,
    TextUnderlineIcon
} from '@phosphor-icons/react';
import { Separator } from '@repo/ui/components/separator';
import { TipButton } from '@repo/ui/components/tip-button';
import {
    $createParagraphNode,
    $getSelection,
    $isRangeSelection,
    FORMAT_ELEMENT_COMMAND,
    FORMAT_TEXT_COMMAND,
    type ElementFormatType,
    type LexicalEditor,
    type TextFormatType
} from 'lexical';
import { useCallback, useEffect, useState } from 'react';

import type { ProjectFont } from '~/hooks/useProjectFonts';

import { ColorPickerPopover } from './ColourPicker';

interface ToolbarState {
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isStrikethrough: boolean;
    blockType: string;
    fontSize: string;
    fontColor: string;
    bgColor: string;
}

const INITIAL_STATE: ToolbarState = {
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    blockType: 'paragraph',
    fontSize: '48',
    fontColor: '#ffffff',
    bgColor: 'transparent'
};

const SYSTEM_FONTS = ['sans-serif', 'serif', 'monospace', 'Inter Variable'];

export function TextEditorToolbar({
    editor,
    projectFonts = []
}: {
    editor: LexicalEditor;
    projectFonts?: ProjectFont[];
}) {
    const [state, setState] = useState<ToolbarState>(INITIAL_STATE);

    const updateToolbar = useCallback(() => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;

            setState((prev) => ({
                ...prev,
                isBold: selection.hasFormat('bold'),
                isItalic: selection.hasFormat('italic'),
                isUnderline: selection.hasFormat('underline'),
                isStrikethrough: selection.hasFormat('strikethrough')
            }));
        });
    }, [editor]);

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                updateToolbar();
            });
        });
    }, [editor, updateToolbar]);

    const formatText = (format: TextFormatType) => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

    const formatBlock = (type: 'paragraph' | HeadingTagType) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            if (type === 'paragraph') {
                $setBlocksType(selection, () => $createParagraphNode());
            } else {
                $setBlocksType(selection, () => $createHeadingNode(type));
            }
        });
    };

    const toggleList = (type: 'bullet' | 'number') => {
        if (type === 'bullet') {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        }
    };

    const formatAlignment = (alignment: ElementFormatType) => {
        editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, alignment);
    };

    const applyStyle = (property: string, value: string) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $patchStyleText(selection, { [property]: value });
            }
        });
    };

    const applyFontSize = (size: string) => {
        setState((prev) => ({ ...prev, fontSize: size }));
        applyStyle('font-size', `${size}px`);
    };

    const applyFontColor = (color: string) => {
        setState((prev) => ({ ...prev, fontColor: color }));
        applyStyle('color', color);
    };

    const applyBgColor = (color: string) => {
        setState((prev) => ({ ...prev, bgColor: color }));
        applyStyle('background-color', color);
    };

    const applyFontFamily = (family: string) => {
        applyStyle('font-family', family);
    };

    return (
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-1">
            {/* Text Format */}
            <TipButton
                tip="Bold"
                variant={state.isBold ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => formatText('bold')}
            >
                <TextBIcon />
            </TipButton>
            <TipButton
                tip="Italic"
                variant={state.isItalic ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => formatText('italic')}
            >
                <TextItalicIcon />
            </TipButton>
            <TipButton
                tip="Underline"
                variant={state.isUnderline ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => formatText('underline')}
            >
                <TextUnderlineIcon />
            </TipButton>
            <TipButton
                tip="Strikethrough"
                variant={state.isStrikethrough ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => formatText('strikethrough')}
            >
                <TextStrikethroughIcon />
            </TipButton>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Block Type */}
            <TipButton
                tip="Heading 1"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatBlock('h1')}
            >
                <TextHOneIcon />
            </TipButton>
            <TipButton
                tip="Heading 2"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatBlock('h2')}
            >
                <TextHTwoIcon />
            </TipButton>
            <TipButton
                tip="Heading 3"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatBlock('h3')}
            >
                <TextHThreeIcon />
            </TipButton>
            <TipButton
                tip="Heading 4"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatBlock('h4')}
            >
                <TextHFourIcon />
            </TipButton>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Alignment */}
            <TipButton
                tip="Align left"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatAlignment('left')}
            >
                <TextAlignLeftIcon />
            </TipButton>
            <TipButton
                tip="Align center"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatAlignment('center')}
            >
                <TextAlignCenterIcon />
            </TipButton>
            <TipButton
                tip="Align right"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatAlignment('right')}
            >
                <TextAlignRightIcon />
            </TipButton>
            <TipButton
                tip="Justify"
                variant="ghost"
                size="icon-sm"
                onClick={() => formatAlignment('justify')}
            >
                <TextAlignJustifyIcon />
            </TipButton>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Lists */}
            <TipButton
                tip="Bullet list"
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleList('bullet')}
            >
                <ListBulletsIcon />
            </TipButton>
            <TipButton
                tip="Numbered list"
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleList('number')}
            >
                <ListNumbersIcon />
            </TipButton>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Font Size */}
            <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Size</span>
                <input
                    type="number"
                    min={12}
                    max={500}
                    value={state.fontSize}
                    onChange={(e) => applyFontSize(e.target.value)}
                    className="h-7 w-16 rounded border border-border bg-background px-1.5 text-center text-xs"
                />
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Colors */}
            <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Text</span>
                <ColorPickerPopover value={state.fontColor} onChange={applyFontColor} />
            </div>
            <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">BG</span>
                <ColorPickerPopover value={state.bgColor} onChange={applyBgColor} />
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            {/* Font Family */}
            <div className="flex items-center gap-1">
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
            </div>
        </div>
    );
}
