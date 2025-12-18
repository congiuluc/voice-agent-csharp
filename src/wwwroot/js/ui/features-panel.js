// Features panel behavior implemented in external module to comply with CSP
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('closeFeaturesBtn');
  const panel = document.getElementById('featuresPanel');
  if (btn && panel) {
    btn.addEventListener('click', () => {
      panel.style.display = 'none';
    });
  }
});
