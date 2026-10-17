'use strict';

function platform() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so check for touch as well.
  if (/iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

// URL that opens the model in the OS AR viewer, or null when there is none.
function arUrl(id) {
  const os = platform();

  if (os === 'ios') {
    return new URL('./3d/usdz/' + id + '.usdz', location.href).href;
  }

  if (os === 'android') {
    // Scene Viewer needs an absolute URL for the model.
    const model = new URL('./3d/glb/' + id + '.glb', location.href).href;
    const fallback = encodeURIComponent(location.href);
    return 'intent://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(model) +
      '&mode=ar_only' +
      '#Intent;scheme=https;package=com.google.ar.core;' +
      'action=android.intent.action.VIEW;' +
      'S.browser_fallback_url=' + fallback + ';end;';
  }

  return null;
}
