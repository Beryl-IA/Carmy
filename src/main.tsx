import { render } from 'preact';
import { App } from './app';
import './styles.css';

// Bloque le zoom (pincement, Ctrl+molette, Ctrl +/-). Le double-tap est bloqué
// par `touch-action` dans styles.css ; iOS Safari ignore `user-scalable=no`,
// d'où les écouteurs gesture*.
const noZoom = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', noZoom, { passive: false });
document.addEventListener('gesturechange', noZoom, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
});

render(<App />, document.getElementById('app')!);
