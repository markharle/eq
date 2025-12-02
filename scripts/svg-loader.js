document.addEventListener('DOMContentLoaded', () => {
  const loaders = document.querySelectorAll('.svg-loader');
  
  loaders.forEach(async (loader) => {
    const url = loader.dataset.src;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch SVG: ${response.statusText}`);
      }
      const svgText = await response.text();
      loader.innerHTML = svgText;
    } catch (error) {
      console.error('Error loading SVG:', url, error);
      loader.innerHTML = '<p style="color:red;">Error</p>';
    }
  });
});
