import { describe, it, expect } from 'vitest'
import { Ollama } from '../src/index'
import path from 'path'
import fs from 'fs'
import { fileTypeFromBuffer } from 'file-type'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('Ollama | Nodejs', () => {
  it('support webp images convertation', async () => {
    const instance = new Ollama()
    const imagePath = path.resolve(__dirname, './mocks/images/WebP-Gradient.webp')
    const initialBuffer = await fs.promises.readFile(imagePath)
    const initialFileType = await fileTypeFromBuffer(initialBuffer)
    expect(initialFileType?.ext).toBe('webp')
    expect(initialFileType?.mime).toBe('image/webp')
    const base64img = await instance.encodeImage(imagePath)
    const buffer = Buffer.from(base64img, 'base64')
    const convertedFileType = await fileTypeFromBuffer(buffer)
    expect(convertedFileType?.ext).toBe('jpg')
    expect(convertedFileType?.mime).toBe('image/jpeg')
  })
})