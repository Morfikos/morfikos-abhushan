"use client";

import type { ChangeEvent, ComponentPropsWithRef, DragEvent } from "react";
import { useId, useRef, useState } from "react";
import { UploadCloud02 } from "@untitledui/icons";

import { cx } from "@/utils/cx";

export const getReadableFileSize = (bytes: number) => {
    if (bytes === 0) return "0 KB";

    const suffixes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), suffixes.length - 1);
    return `${Math.floor(bytes / Math.pow(1024, i))} ${suffixes[i] ?? "B"}`;
};

interface FileUploadDropZoneProps {
    className?: string;
    hint?: string;
    isDisabled?: boolean;
    accept?: string;
    allowsMultiple?: boolean;
    maxSize?: number;
    onDropFiles?: (files: FileList) => void;
    onDropUnacceptedFiles?: (files: FileList) => void;
    onSizeLimitExceed?: (files: FileList) => void;
}

export const FileUploadDropZone = ({
    className,
    hint,
    isDisabled,
    accept,
    allowsMultiple = true,
    maxSize,
    onDropFiles,
    onDropUnacceptedFiles,
    onSizeLimitExceed,
}: FileUploadDropZoneProps) => {
    const id = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isInvalid, setIsInvalid] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const isFileTypeAccepted = (file: File): boolean => {
        if (!accept) return true;
        const acceptedTypes = accept.split(",").map((type) => type.trim());
        return acceptedTypes.some((acceptedType) => {
            if (acceptedType.startsWith(".")) {
                const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
                return extension === acceptedType.toLowerCase();
            }
            if (acceptedType.endsWith("/*")) {
                const typePrefix = acceptedType.split("/")[0];
                return file.type.startsWith(`${typePrefix}/`);
            }
            return file.type === acceptedType;
        });
    };

    const handleDragIn = (event: DragEvent) => {
        if (isDisabled) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(true);
    };

    const handleDragOut = (event: DragEvent) => {
        if (isDisabled) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(false);
    };

    const processFiles = (files: File[]): void => {
        setIsInvalid(false);
        const acceptedFiles: File[] = [];
        const unacceptedFiles: File[] = [];
        const oversizedFiles: File[] = [];
        const filesToProcess = allowsMultiple ? files : files.slice(0, 1);

        filesToProcess.forEach((file) => {
            if (maxSize && file.size > maxSize) {
                oversizedFiles.push(file);
                return;
            }
            if (isFileTypeAccepted(file)) {
                acceptedFiles.push(file);
            } else {
                unacceptedFiles.push(file);
            }
        });

        if (oversizedFiles.length > 0 && typeof onSizeLimitExceed === "function") {
            const dataTransfer = new DataTransfer();
            oversizedFiles.forEach((file) => dataTransfer.items.add(file));
            setIsInvalid(true);
            onSizeLimitExceed(dataTransfer.files);
        }

        if (acceptedFiles.length > 0 && typeof onDropFiles === "function") {
            const dataTransfer = new DataTransfer();
            acceptedFiles.forEach((file) => dataTransfer.items.add(file));
            onDropFiles(dataTransfer.files);
        }

        if (unacceptedFiles.length > 0 && typeof onDropUnacceptedFiles === "function") {
            const unacceptedDataTransfer = new DataTransfer();
            unacceptedFiles.forEach((file) => unacceptedDataTransfer.items.add(file));
            setIsInvalid(true);
            onDropUnacceptedFiles(unacceptedDataTransfer.files);
        }

        if (inputRef.current) {
            inputRef.current.value = "";
        }
    };

    const handleDrop = (event: DragEvent) => {
        if (isDisabled) return;
        handleDragOut(event);
        processFiles(Array.from(event.dataTransfer.files));
    };

    const handleInputFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        processFiles(Array.from(event.target.files || []));
    };

    return (
        <div
            data-dropzone
            onDrop={handleDrop}
            onDragOver={handleDragIn}
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            className={cx(
                "relative flex flex-col items-center gap-3 rounded-xl bg-primary px-6 py-8 text-center ring-1 ring-secondary transition-shadow duration-100 ease-linear ring-inset",
                isDraggingOver && "ring-2 ring-brand",
                isInvalid && "ring-2 ring-error",
                isDisabled && "cursor-not-allowed opacity-50",
                className,
            )}
        >
            <input
                ref={inputRef}
                id={id}
                type="file"
                className="sr-only"
                disabled={isDisabled}
                accept={accept}
                multiple={allowsMultiple}
                onChange={handleInputFileChange}
            />
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary ring-1 ring-secondary ring-inset">
                <UploadCloud02 className="size-5 text-fg-quaternary" />
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-sm text-tertiary">
                    <label htmlFor={id} className="cursor-pointer font-semibold text-brand-secondary">
                        Click to upload
                    </label>{" "}
                    or drag and drop
                </div>
                <p className="text-xs text-tertiary">{hint || "JPEG, PNG, or WebP (max. 5 MB)"}</p>
            </div>
        </div>
    );
};

const FileUploadRoot = (props: ComponentPropsWithRef<"div">) => <div {...props} className={cx("flex flex-col gap-4", props.className)} />;

const FileUploadList = (props: ComponentPropsWithRef<"ul">) => <ul {...props} className={cx("flex flex-col gap-3", props.className)} />;

export const FileUpload = {
    Root: FileUploadRoot,
    List: FileUploadList,
    DropZone: FileUploadDropZone,
};
