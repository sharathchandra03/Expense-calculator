/**
 * Phase 1.3: Receipt Image Utilities
 * Handles image capture, compression, and base64 encoding
 * Accepts images up to 10MB input, compresses for storage
 */

const MAX_STORED_SIZE = 500 * 1024 // 500KB max stored (after compression)
const MAX_INPUT_SIZE = 10 * 1024 * 1024 // 10MB max input file

/**
 * Compress an image file to base64, keeping stored size reasonable
 * Accepts files up to 10MB, compresses to ~500KB or less
 */
export async function compressImageToBase64(file: File): Promise<string> {
  if (file.size > MAX_INPUT_SIZE) {
    throw new Error('File too large. Maximum 10MB allowed.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        // Scale down large images
        const maxDim = 1200
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }

        ctx.drawImage(img, 0, 0, width, height)

        // Compress iteratively to stay under stored size limit
        let quality = 0.8
        let base64 = canvas.toDataURL('image/jpeg', quality)

        while (base64.length > MAX_STORED_SIZE * 1.37 && quality > 0.2) {
          quality -= 0.1
          base64 = canvas.toDataURL('image/jpeg', quality)
        }

        resolve(base64)
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Trigger file input for image selection (camera or gallery)
 */
export function createFileInput(accept: string = 'image/*'): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.capture = 'environment'
  return input
}
