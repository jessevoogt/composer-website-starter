import { useState, useCallback, useRef, useEffect, type DragEvent, type ChangeEvent, type CSSProperties } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface UploadState {
  status: UploadStatus
  message: string | null
  dragOver: boolean
}

interface UseFileUploadOptions {
  /** Path relative to source/, e.g. "heroes/my-hero/image.jpg" */
  buildDestPath: (file: File) => string | null
  /** Optional accept filter, e.g. "image/*" or ".jpg,.png,.webp" */
  accept?: string
  /** Called after a successful upload with the response data */
  onSuccess?: (data: { path: string; size: number; backups: Array<{ from: string; to: string }> }) => void
}

interface UseFileUploadReturn {
  state: UploadState
  /** Props to spread on the drop zone element */
  dropZoneProps: {
    onDragOver: (e: DragEvent) => void
    onDragEnter: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
  /** Handler for a traditional file input onChange */
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void
  /** The accept string for file inputs */
  accept: string
  /** Whether the drop zone is currently being hovered */
  dragOver: boolean
  /** Object URL of the most recently dropped/selected file for instant preview */
  localPreviewUrl: string | null
  /** The pending File object (held in memory, not yet uploaded) */
  pendingFile: File | null
  /** Revoke the local preview URL and clear pending file state */
  clearLocalPreview: () => void
  /** Upload a pending file to a specific destination (for deferred create-mode uploads) */
  uploadPendingFile: (dest: string, file: File) => Promise<boolean>
}

// ── Styles (importable by consuming components) ─────────────────────────────

export const dropZoneOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--kui-color-scale-amber4)',
  border: '2px dashed var(--kui-color-scale-amber7)',
  borderRadius: '6px',
  zIndex: 10,
  pointerEvents: 'none',
}

export const dropZoneOverlayTextStyle: CSSProperties = {
  padding: '6px 14px',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--kui-color-scale-amber11)',
  backgroundColor: 'var(--kui-color-scale-slate2)',
  borderRadius: '4px',
}

export const statusMessageStyle = (status: UploadStatus): CSSProperties => ({
  padding: '6px 10px',
  fontSize: '12px',
  lineHeight: '1.4',
  color:
    status === 'error'
      ? '#dc2626'
      : status === 'success'
        ? '#4ade80'
        : 'var(--kui-color-scale-slate9)',
  backgroundColor:
    status === 'error'
      ? '#fef2f2'
      : status === 'success'
        ? 'rgba(34, 197, 94, 0.08)'
        : 'var(--kui-color-scale-slate2)',
  borderTop: '1px solid var(--kui-color-scale-slate5)',
})

export const fileInputWrapperStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '4px',
}

export const fileInputLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--kui-color-scale-slate11)',
  backgroundColor: 'var(--kui-color-scale-slate3)',
  border: '1px solid var(--kui-color-scale-slate6)',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.15s, border-color 0.15s',
}

export const hiddenInputStyle: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useFileUpload({ buildDestPath, accept = '*/*', onSuccess }: UseFileUploadOptions): UseFileUploadReturn {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    message: null,
    dragOver: false,
  })

  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const prevPreviewUrlRef = useRef<string | null>(null)
  const dragCounterRef = useRef(0)

  // Revoke stale object URLs on change or unmount
  useEffect(() => {
    return () => {
      if (prevPreviewUrlRef.current) {
        URL.revokeObjectURL(prevPreviewUrlRef.current)
      }
    }
  }, [])

  const setPreviewUrl = useCallback((url: string | null) => {
    if (prevPreviewUrlRef.current && prevPreviewUrlRef.current !== url) {
      URL.revokeObjectURL(prevPreviewUrlRef.current)
    }
    prevPreviewUrlRef.current = url
    setLocalPreviewUrl(url)
  }, [])

  const clearLocalPreview = useCallback(() => {
    setPreviewUrl(null)
    setPendingFile(null)
  }, [setPreviewUrl])

  /**
   * Capture a file: create an object URL for instant preview and optionally
   * upload it. In create mode the caller may skip the upload and store the
   * file in IndexedDB instead.
   */
  const captureFile = useCallback(
    (file: File) => {
      // Create instant preview URL
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setPendingFile(file)
    },
    [setPreviewUrl],
  )

  const uploadFile = useCallback(
    async (file: File) => {
      const dest = buildDestPath(file)
      if (!dest) {
        // No destination (create mode or missing folder) — just capture for preview
        captureFile(file)
        return
      }

      // Capture for instant preview
      captureFile(file)

      setState({ status: 'uploading', message: `Uploading ${file.name}…`, dragOver: false })

      try {
        const res = await fetch(`/api/dev/file-upload?dest=${encodeURIComponent(dest)}`, {
          method: 'PUT',
          body: file,
        })

        const data = await res.json()

        if (!res.ok || !data.ok) {
          setState({ status: 'error', message: data.error || 'Upload failed.', dragOver: false })
          return
        }

        const backupNote =
          data.backups?.length > 0
            ? ` (${data.backups.length} backup${data.backups.length > 1 ? 's' : ''})`
            : ''
        setState({
          status: 'success',
          message: `Uploaded${backupNote}. Processing…`,
          dragOver: false,
        })

        onSuccess?.(data)
      } catch (err) {
        setState({
          status: 'error',
          message: `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          dragOver: false,
        })
      }
    },
    [buildDestPath, onSuccess, captureFile],
  )

  /**
   * Upload a file to a specific destination path. Used for deferred uploads
   * in create mode (after the entry has been saved and the slug is known).
   */
  const uploadPendingFile = useCallback(
    async (dest: string, file: File): Promise<boolean> => {
      setState({ status: 'uploading', message: 'Uploading queued file…', dragOver: false })
      try {
        const res = await fetch(`/api/dev/file-upload?dest=${encodeURIComponent(dest)}`, {
          method: 'PUT',
          body: file,
        })
        const data = await res.json()
        if (!res.ok || !data.ok) {
          setState({ status: 'error', message: data.error || 'Upload failed.', dragOver: false })
          return false
        }
        setState({ status: 'success', message: 'Uploaded. Processing…', dragOver: false })
        onSuccess?.(data)
        return true
      } catch (err) {
        setState({
          status: 'error',
          message: `Upload failed: ${err instanceof Error ? err.message : 'unknown error'}`,
          dragOver: false,
        })
        return false
      }
    },
    [onSuccess],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setState((prev) => ({ ...prev, dragOver: true }))
    }
  }, [])

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setState((prev) => ({ ...prev, dragOver: false }))
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setState((prev) => ({ ...prev, dragOver: false }))

      const file = e.dataTransfer?.files?.[0]
      if (file) uploadFile(file)
    },
    [uploadFile],
  )

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) uploadFile(file)
      // Reset input so the same file can be re-selected
      e.target.value = ''
    },
    [uploadFile],
  )

  return {
    state,
    dropZoneProps: { onDragOver, onDragEnter, onDragLeave, onDrop },
    onFileInputChange,
    accept,
    dragOver: state.dragOver,
    localPreviewUrl,
    pendingFile,
    clearLocalPreview,
    uploadPendingFile,
  }
}
