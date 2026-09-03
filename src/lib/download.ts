/**
 * Hands a fetched file to the viewer.
 *
 * Normally that is an anchor with `download`. Inside the Artifacts viewer a
 * page cannot download directly — an `<a download>` (blob: and data: included)
 * is silently inert — so the platform mediates it through the `downloads`
 * capability, which asks the viewer to confirm. The capability is absent in the
 * real app, where the anchor path is taken.
 */
interface ClaudeBridge {
  use(name: 'downloads'): Promise<{
    save(request: { filename: string; data: Blob }): Promise<{ status: string }>
  } | null>
}

export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const bridge = (window as unknown as { claude?: ClaudeBridge }).claude
  if (bridge?.use) {
    try {
      const downloads = await bridge.use('downloads')
      if (downloads) {
        // The viewer may decline; that is a normal outcome, not an error to
        // fall back from — falling through would do nothing anyway.
        await downloads.save({ filename: fileName, data: blob }).catch(() => undefined)
        return
      }
    } catch {
      // Capability unavailable in this view; use the ordinary path.
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Object URLs leak if they are not revoked.
  URL.revokeObjectURL(url)
}
