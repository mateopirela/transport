// Stand-in camera for the end-to-end flows (F14). The iOS simulator has no
// camera, so the operator's evidence (B23) could never be captured there.
// With EXPO_PUBLIC_E2E_FAKE_CAMERA=1 in a development build, "Tomar foto"
// returns a small fixed JPEG instead of opening the camera; everything after
// it (compression, hash, queue, upload, RPC) is the real code. Release builds
// ignore the variable: evidence there only ever comes from the camera.

/** Fixed 48×48 JPEG of the app icon. */
const FAKE_PHOTO_BASE64 =
  '/9j/4AAQSkZJRgABAQAASABIAAD/4QCARXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAIdpAAQAAAABAAAATgAAAAAAAABIAAAAAQAAAEgAAAABAAOgAQADAAAAAQABAACgAgAEAAAAAQAAADCgAwAEAAAAAQAAADAAAAAA/+0AOFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAAOEJJTQQlAAAAAAAQ1B2M2Y8AsgTpgAmY7PhCfv/AABEIADAAMAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAAkJCQkJCRAJCRAWEBAQFh4WFhYWHiYeHh4eHiYuJiYmJiYmLi4uLi4uLi43Nzc3NzdAQEBAQEhISEhISEhISEj/2wBDAQsMDBIREh8RER9LMyozS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0v/3QAEAAP/2gAMAwEAAhEDEQA/ALO6jdUG6l3V9efKk26jdXTaDp9u0H2u8jEhf7gbkBR3x70a9p9usH2uzjEZT74XgFT3x7VyfWo+05Dp+rS5Oc5ndS7qg3Um6uuxzH//0It1WbOA3lyluOAeWPoo6ms7fXU6RCLe1M78PLz9EHT8+tfWVp8sdNz5ijHmlqa99frY229MA42ov8vwFFjfrfW298E42uv8/wADXG396by43j7i8KP6/jRYXps7jcfuNww/r+Fcn1b3L9Tq+se/boPvIDZ3L255A5U+qnoarbua6HV4RcWonTl4ufqh6/l1rlg9dVGfNHU5aseWWh//0crdWjJqcsloLbHONpb1ArH3Ubq+ylBPc+SjNrYshsUFs1W30b6dhXNiPU5Y7Q22OcbQ3oDWeG6VX3UBuaUYJbDc29z/2Q==';

export const FAKE_PHOTO_SIZE = 48;

/** The stand-in camera is on only in development builds that ask for it. */
export function isFakeCameraEnabled(flag: string | undefined, isDev: boolean): boolean {
  return isDev && flag?.trim() === '1';
}

/** Base64 content of the stand-in photo (written to a file by the caller). */
export function fakePhotoBase64(): string {
  return FAKE_PHOTO_BASE64;
}
