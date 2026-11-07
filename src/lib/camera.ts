export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export function requestCameraStream(): Promise<MediaStream> {
  if (!cameraSupported()) {
    return Promise.reject(new Error('Camera preview requires a browser with webcam support on localhost or HTTPS.'))
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user' },
    audio: false,
  })
}

export function stopCameraStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
