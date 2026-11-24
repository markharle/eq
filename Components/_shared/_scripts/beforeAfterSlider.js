// https://effect-labs.com/en/pages/blog/slider-avant-apres.html

    function initComparisonSlider(container) {
  const before = container.querySelector('.before');
  const handle = container.querySelector('.comparison-handle');
  let isDragging = false;

  // Calculate position as percentage
  function getPercent(clientX) {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  // Update the slider
  function updateSlider(percent) {
    before.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
    handle.style.left = percent + '%';
  }

  // Mouse events
  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    updateSlider(getPercent(e.clientX));
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateSlider(getPercent(e.clientX));
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// Initialisation
initComparisonSlider(document.querySelector('.comparison-slider'));
