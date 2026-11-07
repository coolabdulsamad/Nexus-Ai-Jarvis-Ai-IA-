import { afterEach, describe, expect, it, vi } from 'vitest'
import { cameraSupported, requestCameraStream, stopCameraStream } from './camera'

afterEach(() => vi.unstubAllGlobals())

describe('camera helpers', () => {
  it('requests video only with a user-facing camera', async () => {
    const stream = { id: 'preview' } as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    await expect(requestCameraStream()).resolves.toBe(stream)
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false })
  })

  it('reports unsupported browsers without requesting access', async () => {
    vi.stubGlobal('navigator', {})
    expect(cameraSupported()).toBe(false)
    await expect(requestCameraStream()).rejects.toThrow('localhost or HTTPS')
  })

  it('stops every media track when preview closes', () => {
    const videoStop = vi.fn()
    const audioStop = vi.fn()
    const stream = {
      getTracks: () => [{ stop: videoStop }, { stop: audioStop }],
    } as unknown as MediaStream

    stopCameraStream(stream)
    expect(videoStop).toHaveBeenCalledOnce()
    expect(audioStop).toHaveBeenCalledOnce()
    expect(() => stopCameraStream(null)).not.toThrow()
  })
})
