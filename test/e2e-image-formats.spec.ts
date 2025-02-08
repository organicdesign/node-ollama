import { describe, it, expect } from 'vitest'
import { Ollama } from '../src/index'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'


async function describeImage(imageName: string) {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    const instance = new Ollama()
    const imagePath = path.resolve(__dirname, `./mocks/images/${imageName}`)
    const response = await instance.chat({
        model: 'llama3.2-vision',
        messages: [{ role: 'user', content: 'what is this?', images: [imagePath] }],
    })
    return response.message.content;
}

const testConfig = {
    timeout: 5 * 60 * 1000, // 5 minutes
    retry: 3,
}

describe('Ollama | Nodejs | Vision image formats', () => {
  it('support ".webp" image recognition', testConfig, async () => {
    const result = await describeImage('WebP-Gradient.webp')
    expect(result.toLowerCase()).toContain('gradient')
  })

  it('support ".gif" image recognition', testConfig, async () => {
    const result = await describeImage('200w.gif')
    expect(result.toLowerCase()).toContain('cat')
  })

  it('support ".avif" image recognition', testConfig, async () => {
    const result = await describeImage('fox.profile0.8bpc.yuv420.avif')
    expect(result.toLowerCase()).toContain('fox')
  })

  it('support ".tiff/.tif" image recognition', testConfig, async () => {
    const result = await describeImage('julia.tif')
    expect(result.toLowerCase()).toContain('julia')
  })

  it('support ".svg" image recognition', testConfig, async () => {
    const result = await describeImage('house.svg')
    expect(result.toLowerCase()).toContain('house')
  })
})