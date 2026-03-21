import { TrashIcon, UploadIcon } from '@phosphor-icons/react';
import type { CreateProjectInput } from '@repo/db/schema';
import { Button } from '@repo/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@repo/ui/components/card';
import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { TagInput } from '@repo/ui/components/tag-input';
import { Textarea } from '@repo/ui/components/textarea';
import { useForm } from '@tanstack/react-form';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

interface ProjectFormProps {
    defaultValues?: Partial<CreateProjectInput>;
    onSubmit: (data: CreateProjectInput) => void;
    isSubmitting?: boolean;
    submitLabel?: string;
    autoSave?: boolean;
    autoSaveDelayMs?: number;
}

export function ProjectForm({
    defaultValues,
    onSubmit,
    isSubmitting,
    submitLabel = 'Create project',
    autoSave = false,
    autoSaveDelayMs = 1200
}: ProjectFormProps) {
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSubmittedSignatureRef = useRef('');

    const form = useForm({
        defaultValues: {
            name: '',
            authorOrganisation: '',
            description: '',
            tags: [],
            heroImages: [],
            collaborators: [],
            ...defaultValues
        },
        onSubmit: ({ value }) => {
            onSubmit(value);
        }
    });

    const getPayload = useCallback(
        (): CreateProjectInput => ({
            name: form.getFieldValue('name'),
            authorOrganisation: form.getFieldValue('authorOrganisation'),
            description: form.getFieldValue('description'),
            tags: form.getFieldValue('tags'),
            heroImages: form.getFieldValue('heroImages'),
            collaborators: form.getFieldValue('collaborators')
        }),
        [form]
    );

    const submitNow = useCallback(() => {
        const payload = getPayload();
        const signature = JSON.stringify(payload);
        if (signature === lastSubmittedSignatureRef.current) return;
        lastSubmittedSignatureRef.current = signature;
        onSubmit(payload);
    }, [getPayload, onSubmit]);

    const flushAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
    }, []);

    const scheduleAutoSave = useCallback(() => {
        if (!autoSave) return;
        flushAutoSave();
        autoSaveTimerRef.current = setTimeout(() => {
            if (isSubmitting) {
                scheduleAutoSave();
                return;
            }
            submitNow();
        }, autoSaveDelayMs);
    }, [autoSave, autoSaveDelayMs, flushAutoSave, isSubmitting, submitNow]);

    useEffect(() => {
        lastSubmittedSignatureRef.current = JSON.stringify(getPayload());
    }, [getPayload]);

    useEffect(() => {
        return () => {
            flushAutoSave();
        };
    }, [flushAutoSave]);

    const handleUpload = useCallback(
        async (files: FileList) => {
            setUploading(true);
            const uppy = new Uppy({ restrictions: { allowedFileTypes: ['image/*'] } }).use(Tus, {
                endpoint: '/api/uploads/',
                chunkSize: 5 * 1024 * 1024
            });

            const newUrls: string[] = [];
            for (const file of Array.from(files)) {
                uppy.addFile({ name: file.name, type: file.type, data: file });
            }

            uppy.on('upload-success', (_file, response) => {
                if (response.uploadURL) {
                    newUrls.push(response.uploadURL);
                }
            });

            try {
                await uppy.upload();
                form.setFieldValue('heroImages', [...form.getFieldValue('heroImages'), ...newUrls]);
                scheduleAutoSave();
            } catch {
                // errors handled by uppy events
            } finally {
                setUploading(false);
                uppy.destroy();
            }
        },
        [form, scheduleAutoSave]
    );

    const removeImage = (index: number) => {
        form.setFieldValue(
            'heroImages',
            form.getFieldValue('heroImages').filter((_, i) => i !== index)
        );
        scheduleAutoSave();
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                flushAutoSave();
                form.handleSubmit();
            }}
            className="flex flex-col gap-6"
        >
            <div className="grid gap-4">
                <form.Field
                    name="name"
                    validators={{
                        onChange: z.string().min(1, 'Project name is required.')
                    }}
                >
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor={field.name}>Project name *</Label>
                            <Input
                                id={field.name}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => {
                                    field.handleChange(e.target.value);
                                    scheduleAutoSave();
                                }}
                                placeholder="My Video Wall Project"
                            />
                            {field.state.meta.errors ? (
                                <em className="text-xs text-red-500">
                                    {field.state.meta.errors.map((e) => e?.message).join(', ')}
                                </em>
                            ) : null}
                        </div>
                    )}
                </form.Field>

                <form.Field
                    name="authorOrganisation"
                    validators={{
                        onChange: z.string().min(1, 'Author/Organisation is required.')
                    }}
                >
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor={field.name}>Author / Organisation *</Label>
                            <Input
                                id={field.name}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => {
                                    field.handleChange(e.target.value);
                                    scheduleAutoSave();
                                }}
                                placeholder="Dept. of Physics"
                            />
                            {field.state.meta.errors ? (
                                <em className="text-xs text-red-500">
                                    {field.state.meta.errors.map((e) => e?.message).join(', ')}
                                </em>
                            ) : null}
                        </div>
                    )}
                </form.Field>

                <form.Field name="description">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor={field.name}>Description</Label>
                            <Textarea
                                id={field.name}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => {
                                    field.handleChange(e.target.value);
                                    scheduleAutoSave();
                                }}
                                placeholder="Describe your project..."
                                rows={4}
                            />
                        </div>
                    )}
                </form.Field>

                <form.Field name="tags">
                    {(field) => (
                        <div className="grid gap-2">
                            <Label htmlFor={field.name}>Tags</Label>
                            <TagInput
                                value={field.state.value}
                                onValueChange={(next) => {
                                    field.handleChange(next);
                                    scheduleAutoSave();
                                }}
                                placeholder="Type a tag and press Enter"
                            />
                        </div>
                    )}
                </form.Field>
            </div>

            <Card size="sm">
                <CardHeader>
                    <CardTitle>Hero Images</CardTitle>
                </CardHeader>
                <CardContent>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files?.length) {
                                handleUpload(e.target.files);
                            }
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        <UploadIcon />
                        {uploading ? 'Uploading...' : 'Upload images'}
                    </Button>
                    <form.Field name="heroImages">
                        {(field) =>
                            field.state.value.length > 0 && (
                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    {field.state.value.map((url, i) => (
                                        <div key={url} className="group relative">
                                            <img
                                                src={url}
                                                alt={`Hero ${i + 1}`}
                                                className="h-24 w-full rounded-lg object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(i)}
                                                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                            >
                                                <TrashIcon className="size-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )
                        }
                    </form.Field>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || !form.state.isValid}>
                    {isSubmitting ? 'Saving...' : submitLabel}
                </Button>
            </div>
        </form>
    );
}
