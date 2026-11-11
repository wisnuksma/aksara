// Tipe tambahan File System Access API yang belum ada di TypeScript bawaan.
interface FileSystemHandlePermissionDescriptor { mode?: 'read' | 'readwrite' }
interface FileSystemDirectoryHandle {
  keys(): AsyncIterableIterator<string>
  queryPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission?(d?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}
interface Window {
  showDirectoryPicker(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: 'desktop' | 'documents' | 'downloads' | FileSystemHandle
  }): Promise<FileSystemDirectoryHandle>
}
