// Identity verification for the official proctored interview.
//
// Before the interview begins the candidate's face is captured once on the pre-interview
// gate; that photo's 128-d face descriptor becomes the BASELINE. During the interview the
// session periodically re-computes a descriptor from the webcam and compares it with the
// baseline — if the person on camera changes, the interview is hard-terminated.
//
// Why a dedicated model: MediaPipe FaceMesh (already used for proctoring) only returns face
// GEOMETRY — it can tell where a face is, never WHO it is. Recognition needs an embedding
// model, so face-api's FaceRecognitionNet is loaded here.
//
// Hang safety (the interview must never freeze):
//   * Everything is loaded on the pre-interview gate, NOT during the interview — the heavy
//     one-time download and warm-up happen while the candidate is still on a static screen.
//   * The script tag persists across the SPA navigation, so the session reuses it for free.
//   * In-interview checks run rarely (see IDENTITY_CHECK_INTERVAL_MS) on a small input.

const FACE_API_SRC = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model';

// Euclidean distance between two 128-d descriptors below which they are the same person.
// 0.6 is face-api's standard threshold; anything above is treated as a different face.
export const IDENTITY_MATCH_THRESHOLD = 0.6;
// How often the session re-verifies the candidate mid-interview.
export const IDENTITY_CHECK_INTERVAL_MS = 30000;
// A single bad reading can come from motion blur, a hand across the face or bad lighting,
// so a mismatch must repeat this many times in a row before the interview is terminated.
export const IDENTITY_MISMATCH_STRIKES = 2;

let baselineDescriptor = null;
let baselineImage = null;
let loadPromise = null;

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the face verification library.'));
    document.body.appendChild(script);
  });

/**
 * Load the face-api library and the three model files it needs (tiny detector ~193KB,
 * landmarks ~357KB, recognition ~6.4MB). Cached: repeat calls await the same promise, so
 * the session never re-downloads what the pre-interview gate already fetched.
 */
export const loadFaceApi = () => {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await loadScript(FACE_API_SRC);
    const faceapi = window.faceapi;
    if (!faceapi) throw new Error('Face verification library did not initialize.');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    return faceapi;
  })().catch((err) => {
    // Let a later attempt retry instead of caching the failure forever.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
};

export const isFaceApiReady = () =>
  !!(window.faceapi && window.faceapi.nets?.faceRecognitionNet?.isLoaded);

/**
 * Compute the 128-d face descriptor for the single face in a <video> or <canvas>.
 * Returns null when no face is found (candidate out of frame, too dark, covered).
 */
export const computeDescriptor = async (input) => {
  const faceapi = window.faceapi;
  if (!faceapi || !input) return null;
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return result?.descriptor || null;
};

/** Euclidean distance between two descriptors. Lower = more likely the same person. */
export const descriptorDistance = (a, b) => {
  if (!a || !b || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

// ---- baseline held across the router navigation into InterviewSession ----
//
// The descriptor is ALSO mirrored into sessionStorage. Without that, reloading the page
// mid-interview would wipe the in-memory baseline and silently switch identity monitoring
// off — a candidate could simply refresh to escape it. sessionStorage survives the reload
// and dies with the tab, which is exactly the lifetime we want. Only the 128 floats are
// persisted; the photo stays in memory (it is uploaded as soon as the session opens).

const STORAGE_KEY = 'interviewer.identityBaseline';

const persistDescriptor = (descriptor) => {
  try {
    if (descriptor) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(descriptor)));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage unavailable (private mode / quota) — in-memory baseline still applies */
  }
};

const restoreDescriptor = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const values = JSON.parse(raw);
    return Array.isArray(values) && values.length ? Float32Array.from(values) : null;
  } catch {
    return null;
  }
};

export const setBaseline = (descriptor, imageDataUrl) => {
  baselineDescriptor = descriptor || null;
  baselineImage = imageDataUrl || null;
  persistDescriptor(baselineDescriptor);
};

export const getBaselineDescriptor = () => {
  if (!baselineDescriptor) {
    baselineDescriptor = restoreDescriptor();
  }
  return baselineDescriptor;
};

export const getBaselineImage = () => baselineImage;

export const hasBaseline = () => !!getBaselineDescriptor();

export const clearBaseline = () => {
  baselineDescriptor = null;
  baselineImage = null;
  persistDescriptor(null);
};
