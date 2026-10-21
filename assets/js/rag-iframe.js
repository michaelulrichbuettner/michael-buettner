(() => {
  'use strict';
  document.querySelectorAll('[data-rag-iframe]').forEach(frame => {
    const origin = new URL(frame.src, location.href).origin;
    const connect = () => frame.contentWindow.postMessage({type: 'rag-embed:connect'}, origin);
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow || event.origin !== origin) return;
      const data = event.data;
      if (!data || data.type !== 'rag-embed:height' || !Number.isFinite(data.height) || data.height < 100 || data.height > 12000) return;
      frame.style.height = `${Math.ceil(data.height)}px`;
    });
    frame.addEventListener('load', connect);
    connect();
  });
})();
