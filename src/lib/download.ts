/**
 * Saves a fetched blob to the viewer's device. Object URLs leak if they are
 * not revoked, so this always cleans up after itself.
 */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
