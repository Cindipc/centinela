export interface CompressedImage {
  base64: string
  mediaType: string
}

export async function compressImageFile(
  file: File,
  maxSide = 1280,
  quality = 0.82
): Promise<CompressedImage> {
  const dataUrl = await readAsDataUrl(file)
  if (typeof document === 'undefined') {
    return { base64: dataUrl, mediaType: file.type || 'image/jpeg' }
  }

  const image = await loadImage(dataUrl)
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return { base64: dataUrl, mediaType: file.type || 'image/jpeg' }
  }
  context.drawImage(image, 0, 0, width, height)
  return {
    base64: canvas.toDataURL('image/jpeg', quality),
    mediaType: 'image/jpeg',
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
    image.src = src
  })
}
