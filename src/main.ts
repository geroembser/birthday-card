import './styles.css';
import { startRouter } from './router.ts';
import { renderHome } from './pages/home.ts';
import { renderEditor } from './pages/editor.ts';
import { renderViewer } from './pages/viewer.ts';

const app = document.getElementById('app')!;

startRouter(app, [
  { pattern: /^\/$/, render: (root) => renderHome(root) },
  { pattern: /^\/edit\/([A-Za-z0-9_-]+)\/?$/, render: (root, m) => renderEditor(root, m[1]!) },
  { pattern: /^\/c\/([A-Za-z0-9_-]+)\/?$/, render: (root, m) => renderViewer(root, m[1]!) },
]);
